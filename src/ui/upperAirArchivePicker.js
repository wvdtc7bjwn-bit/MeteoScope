const OFFICIAL_ARCHIVE_URL = "https://www.data.jma.go.jp/yoho/wxchart/archive/index.html";
const LEVELS = [850, 700, 500, 300];

export function getUpperAirArchiveApiUrl(hostname = globalThis.location?.hostname ?? "") {
  return hostname.endsWith(".github.io")
    ? "https://meteoscope.pages.dev/api/jma-upper-air-archive"
    : "/api/jma-upper-air-archive";
}

function createSelect(labelText, options = []) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  select.disabled = true;
  options.forEach(({ value, label: text }) => select.add(new Option(text, value)));
  label.append(select);
  return { label, select };
}

function fillSelect(select, options, preferredValue) {
  select.replaceChildren();
  options.forEach(({ value, label }) => select.add(new Option(label, value)));
  select.disabled = options.length === 0;
  select.value = options.some(({ value }) => value === preferredValue) ? preferredValue : options[0]?.value ?? "";
}

async function fetchArchive(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`JMA archive request failed: ${response.status}`);
  return response.json();
}

export function createUpperAirArchivePicker() {
  const section = document.createElement("section");
  section.className = "numeric-weather-archive";
  const title = document.createElement("h3");
  title.textContent = "過去の高層天気図を探す";
  const description = document.createElement("p");
  description.textContent = "気象庁の保存用天気図から、年月・気圧面・日付を指定できます。新しい月は公開後に追加されます。";
  const controls = document.createElement("div");
  controls.className = "numeric-weather-archive-controls";
  const month = createSelect("年月");
  const level = createSelect("気圧面", LEVELS.map((value) => ({ value: String(value), label: `${value}hPa` })));
  const day = createSelect("日付");
  const hour = createSelect("時刻");
  controls.append(month.label, level.label, day.label, hour.label);
  const status = document.createElement("p");
  status.className = "numeric-weather-archive-status";
  status.setAttribute("role", "status");
  status.textContent = "保存用天気図の公開月を読み込みます。";
  const openLink = document.createElement("a");
  openLink.className = "numeric-weather-archive-open";
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";
  openLink.textContent = "選んだ高層天気図を開く ↗";
  openLink.hidden = true;
  const officialLink = document.createElement("a");
  officialLink.className = "numeric-weather-archive-official";
  officialLink.href = OFFICIAL_ARCHIVE_URL;
  officialLink.target = "_blank";
  officialLink.rel = "noopener noreferrer";
  officialLink.textContent = "気象庁の保存用天気図一覧（さらに古い資料の案内）↗";
  section.append(title, description, controls, status, openLink, officialLink);

  const apiUrl = getUpperAirArchiveApiUrl();
  const chartCache = new Map();
  let monthsPromise;
  let charts = [];

  function updateLink() {
    const selected = charts.find((chart) =>
      String(chart.level) === level.select.value && chart.date === day.select.value && chart.hour === hour.select.value
    );
    openLink.hidden = !selected;
    if (selected) openLink.href = selected.url;
  }

  function updateHours() {
    const options = charts
      .filter((chart) => String(chart.level) === level.select.value && chart.date === day.select.value)
      .map((chart) => ({ value: chart.hour, label: `${chart.hour}:00 UTC（${chart.hour === "00" ? "09" : "21"}:00 JST）` }));
    fillSelect(hour.select, options, hour.select.value);
    updateLink();
  }

  function updateDays() {
    const dates = [...new Set(charts.filter((chart) => String(chart.level) === level.select.value).map((chart) => chart.date))].sort().reverse();
    fillSelect(day.select, dates.map((value) => ({ value, label: `${Number(value.slice(6, 8))}日` })), day.select.value);
    updateHours();
    status.textContent = dates.length ? `${dates.length}日分の高層天気図があります。` : "この気圧面の資料はありません。";
  }

  async function loadMonth() {
    const selectedMonth = month.select.value;
    charts = [];
    day.select.disabled = true;
    hour.select.disabled = true;
    openLink.hidden = true;
    status.textContent = `${selectedMonth.replace("_", "年")}月の資料を読み込んでいます…`;
    try {
      if (!chartCache.has(selectedMonth)) {
        chartCache.set(selectedMonth, fetchArchive(`${apiUrl}?month=${selectedMonth}`));
      }
      const data = await chartCache.get(selectedMonth);
      if (month.select.value !== selectedMonth) return;
      charts = Array.isArray(data.charts) ? data.charts : [];
      if (!charts.length) throw new Error("No charts for selected month");
      level.select.disabled = false;
      updateDays();
    } catch (error) {
      chartCache.delete(selectedMonth);
      if (month.select.value !== selectedMonth) return;
      status.textContent = "資料を読み込めませんでした。気象庁の一覧から確認してください。";
      console.warn("[MeteoScope] upper-air archive month unavailable", error);
    }
  }

  month.select.addEventListener("change", () => { void loadMonth(); });
  level.select.addEventListener("change", updateDays);
  day.select.addEventListener("change", updateHours);
  hour.select.addEventListener("change", updateLink);

  function load() {
    if (monthsPromise) return monthsPromise;
    status.textContent = "保存用天気図の公開月を読み込んでいます…";
    monthsPromise = fetchArchive(apiUrl)
      .then(async (data) => {
        if (!Array.isArray(data.months) || !data.months.length) throw new Error("No published months");
        fillSelect(month.select, data.months);
        await loadMonth();
      })
      .catch((error) => {
        status.textContent = "公開月を読み込めませんでした。気象庁の一覧から確認してください。";
        console.warn("[MeteoScope] upper-air archive unavailable", error);
        monthsPromise = null;
      });
    return monthsPromise;
  }

  return { section, load };
}
