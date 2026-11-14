import { HAZARD_CATEGORIES, getMunicipalHazardLinks } from "../domain/municipalHazardMaps.js";

export function createHazardDirectoryClient({ fetchImpl = globalThis.fetch, baseUrl = `${import.meta.env?.BASE_URL ?? "/"}data/municipal-hazard-maps/`, timeoutMs = 10_000 } = {}) {
  const cache = new Map();
  function request(path, validate) {
    if (cache.has(path)) return cache.get(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const promise = Promise.resolve().then(async () => {
      const response = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal });
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
  function renderLinks() {
    results.replaceChildren();
    const city = selectedCity();
    if (!city) { announce("市区町村を選んでください。"); return; }
    const links = getMunicipalHazardLinks(city, category.value);
    announce(links.length ? "資料を選ぶと、自治体の公式ページを別タブで開きます。" : "この種類の資料は一覧に掲載されていません。災害リスクがないことを示すものではありません。");
    for (const link of links) {
      const item = document.createElement("li");
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      const name = document.createElement("strong");
      link.categories.forEach((id, i) => {
        if (i) name.append(document.createTextNode(" / "));
        const label = document.createElement("span");
        label.textContent = HAZARD_CATEGORIES.find((kind) => kind.id === id).label;
        name.append(label);
      });
      const host = document.createElement("span");
      host.textContent = new URL(link.url).hostname;
      host.dataset.i18nIgnore = "";
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      arrow.className = "hazard-directory-arrow";
      arrow.setAttribute("aria-hidden", "true");
      anchor.append(name, host, arrow);
      item.append(anchor);
      results.append(item);
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
