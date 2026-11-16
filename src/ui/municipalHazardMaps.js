import { HAZARD_CATEGORIES, getMunicipalHazardLinks, getMunicipalHazardLookupUrls } from "../domain/municipalHazardMaps.js";

export function createHazardDirectoryClient({ fetchImpl = globalThis.fetch, baseUrl = `${import.meta.env?.BASE_URL ?? "/"}data/municipal-hazard-maps/`, timeoutMs = 10_000 } = {}) {
  const cache = new Map();
  function request(path, validate) {
    if (cache.has(path)) return cache.get(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const promise = Promise.resolve().then(async () => {
      const response = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal, cache: path === "index.json" ? "no-cache" : "default" });
      if (!response.ok) throw new Error(`Hazard directory HTTP ${response.status}`);
      const data = await response.json();
      if (!validate(data)) throw new Error("Invalid hazard directory data");
      return data;
    }).catch((error) => { cache.delete(path); throw error; }).finally(() => clearTimeout(timer));
    cache.set(path, promise);
    return promise;
  }
  return {
    getIndex: () => request("index.json", (data) => data?.schemaVersion === 1 && /^[a-f\d]{12}$/u.test(data.version)
      && Array.isArray(data.prefectures) && data.prefectures.length === 47 && Array.isArray(data.categories)),
    getPrefecture: (version, code) => {
      if (!/^[a-f\d]{12}$/u.test(version) || !/^(?:0[1-9]|[1-3]\d|4[0-7])$/u.test(code)) return Promise.reject(new Error("Invalid hazard directory key"));
      return request(`${version}/${code}.json`, (data) => data?.code === code && Array.isArray(data.municipalities)
        && data.municipalities.every((city) => new RegExp(`^${code}\\d{3}$`, "u").test(city.code) && typeof city.name === "string" && Array.isArray(city.links)));
    }
  };
}

export function setupMunicipalHazardMaps(root, { client = createHazardDirectoryClient() } = {}) {
  const prefecture = root.querySelector("#hazard-prefecture");
  const municipality = root.querySelector("#hazard-municipality");
  const category = root.querySelector("#hazard-category");
  const status = root.querySelector("#hazard-directory-status");
  const retry = root.querySelector("#hazard-directory-retry");
  const results = root.querySelector("#hazard-directory-results");
  let index = null, data = null, generation = 0;

  function option(value, label) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
  }
  function announce(message, error = false) {
    status.textContent = message;
    status.dataset.status = error ? "error" : "ok";
    retry.hidden = !error;
  }
  function resetCity() {
    data = null;
    municipality.replaceChildren(option("", "市区町村を選択"));
    municipality.disabled = true;
    category.replaceChildren(option("", "すべての種類"));
    category.disabled = true;
    results.replaceChildren();
  }
  async function show() {
    if (index) return;
    const token = ++generation;
    prefecture.disabled = true;
    announce("自治体の一覧を読み込み中...");
    try {
      const next = await client.getIndex();
      if (token !== generation) return;
      index = next;
      prefecture.replaceChildren(option("", "都道府県を選択"), ...index.prefectures.map((pref) => option(pref.code, pref.name)));
      prefecture.disabled = false;
      announce("都道府県と市区町村を選んでください。");
    } catch {
      if (token === generation) announce("一覧を読み込めませんでした。再読み込みしてください。", true);
    }
  }
  async function selectPrefecture() {
    const token = ++generation;
    resetCity();
    if (!prefecture.value) { announce("都道府県と市区町村を選んでください。"); return; }
    announce("市区町村を読み込み中...");
    try {
      const next = await client.getPrefecture(index.version, prefecture.value);
      if (token !== generation) return;
      data = next;
      municipality.replaceChildren(option("", "市区町村を選択"), ...data.municipalities.map((city) => option(city.code, city.name)));
      municipality.disabled = false;
      announce("市区町村を選んでください。");
    } catch {
      if (token === generation) announce("一覧を読み込めませんでした。再読み込みしてください。", true);
    }
  }
  function selectedCity() { return data?.municipalities.find((city) => city.code === municipality.value); }
  function appendLink(link, label = "", description = "") {
    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const name = document.createElement("strong");
    if (label) name.textContent = label;
    else link.categories.forEach((id, i) => {
      if (i) name.append(document.createTextNode(" / "));
      const kind = document.createElement("span");
      kind.textContent = HAZARD_CATEGORIES.find(item => item.id === id).label;
      name.append(kind);
    });
    const detail = document.createElement("span");
    detail.textContent = description || (link.kind === "webmap" ? "Web地図を開く" : /\.pdf$/iu.test(new URL(link.url).pathname) ? "PDFを開く" : "地図・PDFの掲載ページを開く");
    const host = document.createElement("span");
    host.textContent = new URL(link.url).hostname;
    host.dataset.i18nIgnore = "";
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.className = "hazard-directory-arrow";
    arrow.setAttribute("aria-hidden", "true");
    anchor.append(name, detail, host, arrow);
    item.append(anchor);
    if (link.replacements?.length) {
      const notice = document.createElement("div");
      notice.className = "hazard-directory-correction";
      const disclosure = document.createElement("p");
      disclosure.textContent = "MeteoScopeがリンク先を独自に置換";
      const date = document.createElement("p");
      const dateLabel = document.createElement("span");
      dateLabel.textContent = "確認日";
      date.append(dateLabel, document.createTextNode(`: ${link.checkedAt}`));
      notice.append(disclosure, date);
      for (const original of link.replacements) {
        const reference = document.createElement("a");
        reference.href = original.url;
        reference.target = "_blank";
        reference.rel = "noopener noreferrer";
        const originalLabel = document.createElement("span");
        originalLabel.textContent = "国土地理院の元リンク";
        reference.append(originalLabel, document.createTextNode("（"));
        original.categories.forEach((id, i) => {
          if (i) reference.append(document.createTextNode(" / "));
          const label = document.createElement("span");
          label.textContent = HAZARD_CATEGORIES.find(kind => kind.id === id).label;
          reference.append(label);
        });
        reference.append(document.createTextNode("） ↗"));
        notice.append(reference);
      }
      item.append(notice);
    }
    results.append(item);
  }
  function renderLinks() {
    results.replaceChildren();
    const city = selectedCity();
    if (!city) { announce("市区町村を選んでください。"); return; }
    const links = getMunicipalHazardLinks(city, category.value);
    announce(links.length ? "資料を選ぶと、自治体の公式ページを別タブで開きます。" : "この種類の資料は一覧に掲載されていません。災害リスクがないことを示すものではありません。");
    for (const link of links) appendLink(link);
    const lookup = getMunicipalHazardLookupUrls(index.prefectures.find(item => item.code === prefecture.value)?.name, city, category.value);
    if (lookup) {
      const help = document.createElement("li");
      help.className = "hazard-directory-help";
      help.textContent = "見つからない・開けない場合";
      results.append(help);
      appendLink({ url: lookup.search }, "最新の公式ページを検索", "選択中の自治体と災害の種類で検索します。");
      appendLink({ url: lookup.directory }, "国土地理院の自治体別一覧", "自治体が公開する資料の一覧を確認できます。");
    }
  }
  function selectCity() {
    category.replaceChildren(option("", "すべての種類"));
    const city = selectedCity();
    for (const kind of HAZARD_CATEGORIES) if (city?.links.some((link) => link.category === kind.id)) category.append(option(kind.id, kind.label));
    category.disabled = !city;
    renderLinks();
  }
  prefecture.addEventListener("change", selectPrefecture);
  municipality.addEventListener("change", selectCity);
  category.addEventListener("change", renderLinks);
  retry.addEventListener("click", () => { if (index) void selectPrefecture(); else void show(); });
  return { show };
}
