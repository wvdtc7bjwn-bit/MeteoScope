import { mechanismEvent, mechanismMonths, matchMechanism, mechanismLinks, MECHANISM_TYPES, MECHANISM_ROOT } from "../earthquake/focalMechanism.js";
import { doubleCoupleAmplitude } from "../earthquake/focalMechanismArchive.js";

const cache = new Map();
const openedEvents = new Set();
let manifestPromise;
async function archiveManifest() {
  if (!manifestPromise) manifestPromise = fetch(`${import.meta.env.BASE_URL}data/focal-mechanism/manifest.json`, { signal: AbortSignal.timeout(15000) })
    .then(response => { if (!response.ok) throw new Error("archive unavailable"); return response.json(); })
    .catch(error => { manifestPromise = null; throw error; });
  return manifestPromise;
}
async function catalogue(month, type) {
  const key = `${type}:${month}`;
  const previous = cache.get(key);
  if (previous && Date.now() - previous.time < 900000) return previous.promise;
  const origin = globalThis.location?.hostname?.endsWith("github.io") ? "https://meteoscope.pages.dev" : "";
  const promise = archiveManifest().then(manifest => {
    if (manifest.months.includes(month)) {
      if (type === "initial") return { records: [], archiveOnly: true };
      return fetch(`${import.meta.env.BASE_URL}data/focal-mechanism/${month}.json`, { signal: AbortSignal.timeout(15000) });
    }
    return fetch(`${origin}/api/jma-focal-mechanism?month=${month}&type=${type}`, { signal: AbortSignal.timeout(15000) });
  })
    .then(response => { if (response.records) return response; if (!response.ok) throw new Error("unavailable"); return response.json(); })
    .catch(error => { cache.delete(key); throw error; });
  if (cache.size >= 24) cache.delete(cache.keys().next().value);
  cache.set(key, { time: Date.now(), promise });
  return promise;
}

export function renderFocalMechanism(event) {
  const target = mechanismEvent(event);
  // Attributes contain only validated numbers, never external HTML or place names.
  return `<focal-mechanism${target ? ` data-time="${target.time}" data-lon="${target.coordinates[0]}" data-lat="${target.coordinates[1]}"` : ""}></focal-mechanism>`;
}

function textElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function archiveDiagram(record) {
  const figure = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = 320; canvas.height = 320;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "下半球等積投影の発震機構図。上が北、右が東。黒は押し、白は引き。");
  const context = canvas.getContext("2d");
  if (!context) return textElement("p", "図を描画できません。節面の角度をご確認ください。");
  const pixels = context.createImageData(320, 320);
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    const value = doubleCoupleAmplitude(record.planes[0], (x + .5 - 160)/150, (y + .5 - 160)/150);
    if (value === null) continue;
    const index = (y*320+x)*4, shade = value >= 0 ? 20 : 255;
    pixels.data.set([shade,shade,shade,255], index);
  }
  context.putImageData(pixels,0,0);
  context.strokeStyle = "#555"; context.lineWidth = 1.5; context.beginPath(); context.arc(160,160,150,0,Math.PI*2); context.stroke();
  figure.append(canvas, textElement("figcaption", "北 ↑ ・東 → ／ 黒：押し、白：引き。気象庁の節面データからMeteoScopeが描画したダブルカップル成分（下半球等積投影）です。"));
  return figure;
}

// A self-contained element also works when the earthquake list is re-rendered.
if (globalThis.customElements && !customElements.get("focal-mechanism")) {
  customElements.define("focal-mechanism", class extends HTMLElement {
    connectedCallback() {
      if (this.childElementCount) return;
      this.hidden = true;
      const eventKey = `${this.dataset.time}:${this.dataset.lon}:${this.dataset.lat}`;
      const details = document.createElement("details");
      details.append(textElement("summary", "発震機構（気象庁）"));
      const body = document.createElement("div");
      body.className = "focal-mechanism-body";
      details.append(body);
      this.append(details);
      let busy = false, loaded = false;
      const load = async () => {
        if (busy || loaded) return;
        if (!this.hasAttribute("data-time")) {
          return;
        }
        busy = true;
        body.setAttribute("aria-busy", "true");
        body.replaceChildren(textElement("p", "気象庁の解析結果を確認しています…"));
        const time = Number(this.dataset.time);
        const event = { originTime: new Date(time).toISOString(), coordinates: [Number(this.dataset.lon), Number(this.dataset.lat)] };
        const results = await Promise.all(Object.entries(MECHANISM_TYPES).map(async ([type, definition]) => {
          try {
            const pages = await Promise.all(mechanismMonths(time).map(month => catalogue(month, type)));
            const match = matchMechanism(pages.flatMap(page => page.records), event);
            return { type, definition, archiveOnly: pages.every(page => page.archiveOnly), ...match };
          } catch { return { type, definition, status: "error" }; }
        }));
        busy = false;
        if (!this.isConnected) return;
        body.removeAttribute("aria-busy");
        body.replaceChildren();
        this.hidden = !results.some(result => result.status === "matched" || result.status === "error");
        for (const result of results) {
          if (result.status !== "matched" && result.status !== "error") continue;
          const section = document.createElement("section");
          section.append(textElement("h4", result.definition.label));
          if (result.status !== "matched") {
            section.append(textElement("p", result.status === "error" ? "取得できませんでした。時間をおいて再試行してください。" : result.archiveOnly ? "この期間は確定CMTデータを表示しています。初動解の過去資料は対象外です。" : result.status === "ambiguous" ? "近い時刻・位置に複数の解析結果があり、自動照合できません。" : "公開一覧に一致する解析結果がありません。未掲載・公開対象外の場合があります。"));
          } else {
            const record = result.record;
            const links = record.archive ? { source: "https://www.data.jma.go.jp/eqev/data/bulletin/cmt.html" } : mechanismLinks(result.type, record.id);
            if (!links) continue;
            if (record.archive) section.append(archiveDiagram(record));
            else {
            const image = document.createElement("img");
            image.src = links.image;
            image.alt = `${record.place}の${result.definition.label}（気象庁作成）`;
            image.loading = "lazy";
            image.addEventListener("error", () => image.replaceWith(textElement("p", "図を読み込めません。気象庁の詳細ページをご確認ください。")), { once: true });
            section.append(image);
            }
            const origin = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "medium" }).format(new Date(record.time));
            section.append(textElement("p", `解析対象：${origin}（日本時間） ${record.place}${record.mw !== null ? ` / Mw ${record.mw.toFixed(1)}` : ""}`));
            const table = document.createElement("table");
            table.append(textElement("caption", "節面の角度（°）"));
            const head = document.createElement("tr");
            for (const title of ["節面", "走向", "傾斜", "すべり角"]) { const th = textElement("th", title); th.scope = "col"; head.append(th); }
            table.append(head);
            record.planes.forEach((plane, index) => { const row = document.createElement("tr"); for (const value of [index + 1, ...plane]) row.append(textElement("td", String(value))); table.append(row); });
            section.append(table);
            const link = textElement("a", "気象庁の詳細・原図を開く ↗");
            link.href = links.source; link.target = "_blank"; link.rel = "noopener noreferrer";
            section.append(link);
          }
          body.append(section);
        }
        body.append(textElement("p", "出典：気象庁。解析結果の掲載には数日かかり、後日修正される場合があります。2つの節面だけでは実際の断層面は特定できません。"));
        const source = textElement("a", "発震機構の公開一覧 ↗");
        source.href = `${MECHANISM_ROOT}index.html`; source.target = "_blank"; source.rel = "noopener noreferrer";
        body.append(source);
        loaded = !results.some(result => result.status === "error");
        if (!loaded) { const retry = textElement("button", "再読み込み"); retry.type = "button"; retry.addEventListener("click", load); body.append(retry); }
        details.open = openedEvents.has(eventKey);
      };
      details.addEventListener("toggle", () => {
        if (!this.isConnected) return;
        if (details.open) {
          if (openedEvents.size >= 40) openedEvents.delete(openedEvents.values().next().value);
          openedEvents.add(eventKey);
        } else openedEvents.delete(eventKey);
      });
      void load();
    }
  });
}
