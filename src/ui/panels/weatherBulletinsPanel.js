import {
  createWeatherBulletinReader, FLASH_DISPLAY_HOURS_WITHOUT_EXPIRY,
  getWeatherBulletinOffice, getWeatherFlashDisplayUntil
} from "../../jma/weatherBulletins.js";
import { escapeHtmlString as escapeHtml } from "../../utils/html.js";
import { getCurrentLanguage, localizeText } from "../locale.js";

const OFFICIAL_PAGE = "https://www.jma.go.jp/bosai/information/";
const REFRESH_MS = 60_000;
const DATE_OPTIONS = { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Tokyo" };
let panel;

function tr(ja, en) { return getCurrentLanguage() === "en" ? en : ja; }

function dateLabel(value) {
  return new Intl.DateTimeFormat(tr("ja-JP", "en-GB"), DATE_OPTIONS).format(new Date(value));
}

function sourceLink(url, label) {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
}

function renderReport(report, openUrls) {
  const validUntil = Number.isFinite(Date.parse(report.validUntil)) ? dateLabel(report.validUntil) : "";
  const expiry = report.scope === "flash" ? ` data-expires-at="${getWeatherFlashDisplayUntil(report)}"` : "";
  const details = [
    report.headline && `<p>${escapeHtml(report.headline)}</p>`,
    ...report.paragraphs.map(({ title, text }) => `
      ${title ? `<h4>${escapeHtml(title)}</h4>` : ""}
      <p>${escapeHtml(text)}</p>`),
    ...report.events.map(({ name, areaName, time }) => `
      <p>${escapeHtml([name, areaName].filter(Boolean).join(" · "))}
      ${Number.isFinite(Date.parse(time)) ? `<time datetime="${escapeHtml(time)}">${escapeHtml(dateLabel(time))}</time>` : ""}</p>`),
    validUntil && `<p class="weather-bulletin-meta">${tr("有効期限", "Valid until")} <time datetime="${escapeHtml(report.validUntil)}">${escapeHtml(validUntil)}</time></p>`
  ].filter(Boolean).join("");
  return `<details class="weather-bulletin-report" data-report="${escapeHtml(report.url)}"${expiry}${openUrls.has(report.url) ? " open" : ""}>
    <summary>
      <span class="weather-bulletin-report-title">${escapeHtml(report.title)}</span>
      <span class="weather-bulletin-meta">
        <time datetime="${escapeHtml(report.issuedAt)}">${escapeHtml(dateLabel(report.issuedAt))}</time>
        ${escapeHtml(report.publisher)}
        ${report.infoType === "訂正" ? tr("・訂正", "· Correction") : ""}
      </span>
    </summary>
    <div class="weather-bulletin-report-body">
      ${details}
      ${sourceLink(report.url, tr("出典・気象庁 XML", "Source: JMA XML"))}
    </div>
  </details>`;
}

function createSection(root, reader, flash, areaState) {
  const title = flash ? tr("気象防災速報", "Flash weather bulletins") : tr("気象解説情報", "Weather commentary");
  const scopes = [
    ["national", tr("全般", "Japan")], ["regional", tr("地方", "Region")],
    ["prefectural", tr("府県", "Prefecture")], ["local", tr("現在地", "Near me")]
  ];
  const regionControl = `<label class="weather-bulletin-region" hidden>
    <span>${tr("対象地域", "Area")}</span>
    <select></select>
  </label>`;
  root.insertAdjacentHTML("beforeend", `
    <details class="weather-bulletin-section${flash ? " is-flash" : ""}">
      <summary><span>${title}</span></summary>
      <div class="weather-bulletin-section-body">
        <div class="weather-bulletin-controls">
          ${flash ? regionControl : `<div role="group" aria-label="${title}" class="weather-bulletin-scopes">
            ${scopes.map(([scope, label], index) => `<button type="button" data-scope="${scope}" aria-pressed="${index === 0}">${label}</button>`).join("")}
          </div>`}
          <button class="weather-bulletin-refresh" type="button">${tr("更新", "Refresh")}</button>
        </div>
        ${flash ? "" : regionControl}
        ${flash ? "" : `<div class="weather-bulletin-location" hidden>
          <p class="weather-bulletin-meta"></p>
          <button type="button">${tr("現在地を取得", "Use current location")}</button>
        </div>`}
        <p class="weather-bulletin-status" role="status" hidden></p>
        <div class="weather-bulletin-list"></div>
        <p class="weather-bulletin-meta weather-bulletin-source">
          ${tr("日本時間", "Japan time")} ·
          ${sourceLink(OFFICIAL_PAGE, tr("気象庁の発表一覧", "JMA bulletin list"))}
        </p>
        ${flash ? `<p class="weather-bulletin-meta weather-bulletin-source">
          ${tr(`有効期限の記載がない速報は、発表から${FLASH_DISPLAY_HOURS_WITHOUT_EXPIRY}時間まで表示します。`,
    `Bulletins without an expiry are shown for ${FLASH_DISPLAY_HOURS_WITHOUT_EXPIRY} hours after issue.`)}
        </p>` : ""}
      </div>
    </details>`);
  const section = root.lastElementChild;
  const list = section.querySelector(".weather-bulletin-list");
  const status = section.querySelector(".weather-bulletin-status");
  const regionLabel = section.querySelector(".weather-bulletin-region");
  const select = regionLabel.querySelector("select");
  const refreshButton = section.querySelector(".weather-bulletin-refresh");
  const locationRow = section.querySelector(".weather-bulletin-location");
  const locationMessage = locationRow?.querySelector("p");
  const locateButton = locationRow?.querySelector("button");
  const selection = new Map();
  let scope = flash ? "flash" : "national";
  let lastRequest = null;
  let shownKey = "";
  let shownReports = "";
  let expiryTimer;

  function emptyMessage() {
    return flash
      ? tr("表示対象の速報はありません。", "No bulletins to display.")
      : scope === "local"
        ? tr("現在地に対応する最近の発表はありません。", "No recent reports for your area.")
        : tr("取得できる最近の発表はありません。", "No recent reports are available.");
  }

  function setStatus(message = "") {
    status.textContent = message;
    status.hidden = !message;
  }

  function expireFlashReports() {
    if (!flash) return;
    clearTimeout(expiryTimer);
    const now = Date.now();
    let nextExpiry = Infinity;
    let removed = false;
    for (const item of Array.from(list.children)) {
      const expiry = Number(item.dataset.expiresAt);
      if (expiry <= now) {
        item.remove();
        removed = true;
      } else {
        nextExpiry = Math.min(nextExpiry, expiry);
      }
    }
    if (removed && !list.childElementCount && status.hidden) setStatus(emptyMessage());
    if (Number.isFinite(nextExpiry)) {
      expiryTimer = setTimeout(expireFlashReports, Math.min(nextExpiry - now, 2_147_483_647));
    }
  }

  function activeRegion(area) {
    const office = getWeatherBulletinOffice(area, areaState.location?.areaCode);
    return selection.get(scope) ?? (scope === "regional" ? area?.offices?.[office]?.parent ?? "" : office);
  }

  function updateRegions(area, region) {
    if (scope === "national" || scope === "local" || !area) {
      regionLabel.hidden = true;
      return;
    }
    const byCode = scope === "regional" ? area.centers : area.offices;
    if (!byCode) return;
    if (select.dataset.scope !== scope) {
      select.dataset.scope = scope;
      select.replaceChildren(new Option(tr("すべての地域", "All areas"), ""));
      for (const code of Object.keys(byCode).sort()) {
        const names = byCode[code];
        select.add(new Option(tr(names.name, names.enName || names.name), code));
      }
    }
    select.value = region;
    regionLabel.hidden = false;
  }

  function clearResults() {
    list.replaceChildren();
    shownKey = "";
    shownReports = "";
  }

  function clearRequest() {
    lastRequest?.controller.abort();
    lastRequest = null;
    refreshButton.disabled = false;
    list.removeAttribute("aria-busy");
  }

  function updateLocation(area, officeCode) {
    const { areaCode, status: locationStatus, geographyStatus, message } = areaState.location ?? {};
    const loading = locationStatus === "loading" || geographyStatus === "loading";
    const office = area?.offices?.[officeCode];
    const center = area?.centers?.[office?.parent];
    locationRow.hidden = false;
    locateButton.hidden = Boolean(office || (areaCode && !area));
    locateButton.disabled = loading;
    refreshButton.hidden = !areaCode;

    if (office) {
      locationMessage.textContent = [center, office].filter(Boolean)
        .map((names) => tr(names.name, names.enName || names.name)).join(" / ");
      return;
    }
    locationMessage.textContent = loading
      ? tr("現在地の地域を確認中…", "Finding your area…")
      : locationStatus === "error" && message
        ? localizeText(message)
        : locationStatus === "found"
          ? areaCode && !area ? "" : tr("現在地の地域を特定できませんでした。", "Could not determine your area.")
          : tr("現在地を取得すると、対象の地方・府県を表示します。", "Use your current location to find reports for your region and prefecture.");
    locationRow.hidden = !locationMessage.textContent;
  }

  async function load(force = false) {
    if (!section.open || root.hidden || document.hidden) return;
    expireFlashReports();
    const activeScope = scope;
    if (activeScope === "local" && !areaState.location?.areaCode) {
      if (lastRequest) clearRequest();
      if (shownKey) clearResults();
      setStatus();
      updateLocation();
      return;
    }
    if (activeScope !== "national" && !areaState.area) {
      const areas = areaState.load(force);
      if (areas && !lastRequest) setStatus(tr("取得中…", "Loading…"));
      await areas;
      if (scope !== activeScope || !section.open || root.hidden) return;
    }
    const area = areaState.area;
    const region = scope === "national" ? "" : activeRegion(area);
    const key = `${scope}:${region}`;
    updateRegions(area, region);
    if (scope === "local") {
      updateLocation(area, region);
      if (!region) {
        clearRequest();
        clearResults();
        setStatus(area ? "" : tr("地域一覧を取得できませんでした。", "Could not load the area list."));
        return;
      }
    }
    if (lastRequest?.key === key && (lastRequest.pending || (!force && Date.now() - lastRequest.started < REFRESH_MS))) return;
    if (shownKey !== key) clearResults();
    lastRequest?.controller.abort();
    const request = { key, started: Date.now(), pending: true, controller: new AbortController() };
    lastRequest = request;
    refreshButton.disabled = true;
    list.setAttribute("aria-busy", "true");
    setStatus(tr("取得中…", "Loading…"));
    try {
      const { reports, partial } = await reader.loadReports({ scope, region, area }, { signal: request.controller.signal });
      if (lastRequest !== request) return;
      const reportKey = reports.map((report) => report.url).join("|");
      if (reportKey !== shownReports && (reports.length || !partial)) {
        const openUrls = new Set(Array.from(list.querySelectorAll("details[open]"), (item) => item.dataset.report));
        list.innerHTML = reports.map((report) => renderReport(report, openUrls)).join("");
        shownReports = reportKey;
      }
      shownKey = key;
      const areaError = scope !== "national" && !area;
      setStatus(partial || areaError
        ? tr("一部の情報を取得できませんでした。最新の発表は気象庁で確認できます。", "Some information could not be loaded. Check JMA for the latest reports.")
        : reports.length ? "" : emptyMessage());
      expireFlashReports();
    } catch {
      if (lastRequest === request) setStatus(tr("発表を取得できませんでした。", "Could not load reports."));
    } finally {
      if (lastRequest === request) {
        request.pending = false;
        refreshButton.disabled = false;
        list.removeAttribute("aria-busy");
      }
    }
  }

  section.addEventListener("toggle", () => void load());
  refreshButton.addEventListener("click", () => void load(true));
  locateButton?.addEventListener("click", () => void areaState.onRequestLocation?.());
  select.addEventListener("change", () => {
    selection.set(scope, select.value);
    void load();
  });
  section.querySelectorAll("button[data-scope]").forEach((button, _, buttons) => {
    button.addEventListener("click", () => {
      if (scope === button.dataset.scope) return;
      scope = button.dataset.scope;
      clearRequest();
      clearResults();
      setStatus();
      regionLabel.hidden = true;
      locationRow.hidden = true;
      refreshButton.hidden = false;
      buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      void load();
    });
  });
  return { section, load };
}

function createPanel(root) {
  const reader = createWeatherBulletinReader();
  let areaRequest;
  let areaRequestedAt = -Infinity;
  const areaState = {
    location: null,
    onRequestLocation: null,
    area: null,
    load(force) {
      if (!areaRequest && (force || Date.now() - areaRequestedAt >= REFRESH_MS)) {
        areaRequestedAt = Date.now();
        areaRequest = reader.loadAreas()
          .then((area) => { if (area?.centers && area?.offices) areaState.area = area; })
          .catch(() => {})
          .finally(() => { areaRequest = null; });
      }
      return areaRequest;
    }
  };
  const sections = [createSection(root, reader, false, areaState), createSection(root, reader, true, areaState)];
  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) void sections.find(({ section }) => section === entry.target)?.load();
      }
    }, { root: document.getElementById("sidebar") })
    : null;
  sections.forEach(({ section }) => observer?.observe(section));
  document.addEventListener("visibilitychange", () => sections.forEach(({ load }) => void load()));
  return {
    update(visible, location, onRequestLocation) {
      const previous = areaState.location;
      const changed = root.hidden !== !visible || previous?.areaCode !== location?.areaCode
        || previous?.status !== location?.status || previous?.geographyStatus !== location?.geographyStatus
        || previous?.message !== location?.message;
      root.hidden = !visible;
      areaState.location = location;
      areaState.onRequestLocation = onRequestLocation;
      if (visible && changed) sections.forEach(({ load }) => void load());
    }
  };
}

export function updateWeatherBulletinsPanel(visible, location, onRequestLocation) {
  if (!panel && visible) {
    const root = document.getElementById("warning-bulletins");
    if (root) panel = createPanel(root);
  }
  panel?.update(visible, location, onRequestLocation);
}
