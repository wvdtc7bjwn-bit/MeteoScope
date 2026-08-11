const JMA_NUMERIC_MAP_BASE = "https://www.jma.go.jp/bosai/numericmap/";
const JMA_LONG_FORECAST_BASE = "https://www.data.jma.go.jp/cpd/data/longfcst/fax/";

const utcCharts = (entries) => entries.flatMap(({
  code,
  label,
  times,
  forecast = "実況・解析",
  leadHours = 0
}) => times.map((time) => ({
  label,
  forecast,
  leadHours,
  meta: `${forecast}｜${code}｜${time} UTC`,
  href: `${JMA_NUMERIC_MAP_BASE}data/nwpmap/${code.toLowerCase()}_${time}.pdf`
})));

const imageCharts = (entries, baseUrl = JMA_NUMERIC_MAP_BASE) => entries.map(({
  code,
  label,
  forecast = "長期予報",
  leadHours = 720
}) => ({
  label,
  forecast,
  leadHours,
  meta: `${forecast}｜${code}｜PNG`,
  href: `${baseUrl}${baseUrl === JMA_NUMERIC_MAP_BASE ? "data/nwpmap/" : ""}${code.toLowerCase()}${baseUrl === JMA_LONG_FORECAST_BASE ? "_12" : ""}.png`
}));

export const numericWeatherChartGroups = [
  {
    title: "上層・広域天気図",
    description: "高層の気温・風・湿数など",
    links: utcCharts([
      { code: "AUPA20", label: "アジア太平洋 200hPa", times: ["00", "12"] },
      { code: "AUPA25", label: "アジア太平洋 250hPa", times: ["00", "12"] },
      { code: "AUPN30", label: "北太平洋 300hPa", times: ["00", "12"] },
      { code: "AUPQ35", label: "アジア 500・300hPa", times: ["00", "12"] },
      { code: "AUPQ78", label: "アジア 850・700hPa", times: ["00", "12"] },
      { code: "AUXN50", label: "北半球 500hPa", times: ["12"] },
      { code: "AXFE578", label: "極東 850・700・500hPa", times: ["00", "12"] },
      { code: "FEAS50", label: "アジア 地上・850・500hPa", times: ["12"] },
      { code: "AXJP140", label: "高層断面図（東経140度）", times: ["00", "12"] }
    ])
  },
  {
    title: "短期・中期予報天気図",
    description: "12時間から11日先までの予報",
    links: utcCharts([
      { code: "FUPA252", label: "北太平洋 250hPa予報", times: ["00", "12"], forecast: "24時間後", leadHours: 24 },
      { code: "FUPA302", label: "北太平洋 300hPa予報", times: ["00", "12"], forecast: "24時間後", leadHours: 24 },
      { code: "FUPA402", label: "北太平洋 400hPa予報", times: ["00", "12"], forecast: "24時間後", leadHours: 24 },
      { code: "FUPA502", label: "北太平洋 500hPa予報", times: ["00", "12"], forecast: "24時間後", leadHours: 24 },
      { code: "FXFE502", label: "極東 地上・500hPa予報", times: ["00", "12"], forecast: "12・24時間後", leadHours: 24 },
      { code: "FXFE504", label: "極東 地上・500hPa予報", times: ["00", "12"], forecast: "36・48時間後", leadHours: 48 },
      { code: "FXFE507", label: "極東 地上・500hPa予報", times: ["00", "12"], forecast: "72時間後", leadHours: 72 },
      { code: "FXFE577", label: "極東 850・700・500hPa予報", times: ["00", "12"], forecast: "72時間後", leadHours: 72 },
      { code: "FXFE5782", label: "極東 850・700・500hPa予報", times: ["00", "12"], forecast: "12・24時間後", leadHours: 24 },
      { code: "FXFE5784", label: "極東 850・700・500hPa予報", times: ["00", "12"], forecast: "36・48時間後", leadHours: 48 },
      { code: "FXJP854", label: "日本 850hPa予想気温・風", times: ["00", "12"], forecast: "12・24・36・48時間後", leadHours: 48 },
      ...Object.entries({
        "502": 24,
        "504": 48,
        "507": 72,
        "509": 96,
        "512": 120,
        "514": 144,
        "516": 168,
        "519": 192,
        "521": 216,
        "524": 240,
        "526": 264
      }).map(([lead, leadHours]) => ({
        code: `FEAS${lead}`,
        label: "アジア 地上・850・500hPa予報",
        forecast: `${leadHours}時間後`,
        leadHours,
        times: ["12"]
      }))
    ])
  },
  {
    title: "週間アンサンブル・支援図",
    description: "週間予報や2週間予報の参考資料",
    links: imageCharts([
      { code: "FEFE19", label: "週間アンサンブル予報図", forecast: "1週間後まで", leadHours: 168 },
      { code: "FXXN519", label: "週間予報支援図", forecast: "1週間後まで", leadHours: 168 },
      { code: "FZCX50", label: "週間予報支援図（アンサンブル）", forecast: "1週間後まで", leadHours: 168 }
    ])
  },
  {
    title: "長期予報天気図",
    description: "2週間・1か月予報",
    links: imageCharts([
      { code: "FCVX21", label: "2週間予報・実況解析図", forecast: "2週間予報", leadHours: 336 },
      { code: "FCVX22", label: "2週間予報・北半球予想図", forecast: "2週間予報", leadHours: 336 },
      { code: "FCVX23", label: "2週間予報・確率予報図", forecast: "2週間予報", leadHours: 336 },
      { code: "FCVX24", label: "2週間予報・各種時系列", forecast: "2週間予報", leadHours: 336 },
      { code: "FCVX11", label: "1か月予報・実況解析図", forecast: "1か月予報", leadHours: 720 },
      { code: "FCVX12", label: "1か月予報・北半球予想図", forecast: "1か月予報", leadHours: 720 },
      { code: "FCVX13", label: "1か月予報・高偏差確率", forecast: "1か月予報", leadHours: 720 },
      { code: "FCVX14", label: "1か月予報・各種時系列", forecast: "1か月予報", leadHours: 720 },
      { code: "FCVX15", label: "1か月予報・熱帯・中緯度予想図", forecast: "1か月予報", leadHours: 720 }
    ], JMA_LONG_FORECAST_BASE)
  }
];

let initialized = false;

function createChartLink({ href, label, meta }) {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const title = document.createElement("strong");
  title.textContent = label;
  const detail = document.createElement("small");
  detail.textContent = meta;
  link.append(title, detail);
  return link;
}

const timelineStages = [
  { title: "実況・解析", description: "現在の大気の状態", min: 0, max: 0 },
  { title: "12〜24時間後", description: "短期予報", min: 1, max: 24 },
  { title: "36〜48時間後", description: "短期予報", min: 25, max: 48 },
  { title: "72〜96時間後", description: "3〜4日後の予報", min: 49, max: 96 },
  { title: "120〜144時間後", description: "5〜6日後の予報", min: 97, max: 144 },
  { title: "168〜264時間後", description: "1週間〜11日後の予報", min: 145, max: 264 },
  { title: "2週間予報", description: "週間・長期予報", min: 265, max: 336 },
  { title: "1か月予報", description: "長期予報", min: 337, max: Infinity }
];

function buildTimelineGroups() {
  const links = numericWeatherChartGroups.flatMap((group) => group.links.map((link) => ({
    ...link,
    meta: `${group.title}｜${link.meta}`
  })));
  return timelineStages.map((stage) => ({
    ...stage,
    links: links.filter((link) => link.leadHours >= stage.min && link.leadHours <= stage.max)
  })).filter((stage) => stage.links.length > 0);
}

function setNumericWeatherChartGroupExpanded(group, expanded) {
  const toggle = group.querySelector("[data-numeric-weather-chart-group-toggle]");
  const content = group.querySelector(".numeric-weather-chart-group-content");
  group.classList.toggle("is-expanded", expanded);
  toggle?.setAttribute("aria-expanded", String(expanded));
  if (content) content.hidden = !expanded;
}

function toggleNumericWeatherChartGroup(toggle) {
  const group = toggle.closest(".numeric-weather-chart-group");
  if (!group) return;
  const expanded = toggle.getAttribute("aria-expanded") !== "true";
  if (expanded) {
    document.querySelectorAll("#numeric-weather-chart-body .numeric-weather-chart-group.is-expanded").forEach((otherGroup) => {
      if (otherGroup !== group) setNumericWeatherChartGroupExpanded(otherGroup, false);
    });
  }
  setNumericWeatherChartGroupExpanded(group, expanded);
  if (expanded) group.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderNumericWeatherChartLinks() {
  const body = document.getElementById("numeric-weather-chart-body");
  if (!body || body.dataset.ready === "true") return;
  body.dataset.ready = "true";
  body.replaceChildren();

  const intro = document.createElement("p");
  intro.className = "numeric-weather-chart-intro";
  intro.textContent = "気象庁が公開する数値予報天気図の全リンクです。時刻はUTC表記です（日本時間は＋9時間）。";
  body.append(intro);

  buildTimelineGroups().forEach((group, index) => {
    const section = document.createElement("section");
    section.className = "numeric-weather-chart-group";

    const toggle = document.createElement("button");
    toggle.className = "numeric-weather-chart-group-toggle";
    toggle.type = "button";
    toggle.dataset.numericWeatherChartGroupToggle = "";
    toggle.setAttribute("aria-expanded", "false");
    const copy = document.createElement("span");
    copy.className = "numeric-weather-chart-group-copy";
    const heading = document.createElement("strong");
    heading.textContent = group.title;
    const description = document.createElement("small");
    description.textContent = `${group.description}・${group.links.length}件`;
    copy.append(heading, description);
    toggle.append(copy);
    // Keep this on the button itself. Some installed PWA webviews do not
    // consistently bubble clicks from dynamically rendered modal controls.
    toggle.addEventListener("click", () => toggleNumericWeatherChartGroup(toggle));

    const links = document.createElement("div");
    links.className = "settings-group-content numeric-weather-chart-group-content numeric-weather-chart-links";
    links.hidden = true;
    group.links.forEach((item) => links.append(createChartLink(item)));
    section.append(toggle, links);
    if (index === 0) setNumericWeatherChartGroupExpanded(section, true);
    body.append(section);
  });

  const allLink = document.createElement("a");
  allLink.className = "numeric-weather-chart-all-link";
  allLink.href = JMA_NUMERIC_MAP_BASE;
  allLink.target = "_blank";
  allLink.rel = "noopener noreferrer";
  const allTitle = document.createElement("strong");
  allTitle.textContent = "気象庁の数値予報天気図一覧を開く";
  const allDetail = document.createElement("small");
  allDetail.textContent = "掲載内容・更新時刻を公式ページで確認";
  allLink.append(allTitle, allDetail);
  body.append(allLink);
}

export function setupNumericWeatherChartModal() {
  if (initialized) return;
  initialized = true;

  const button = document.getElementById("numeric-weather-chart-button");
  const modal = document.getElementById("numeric-weather-chart-modal");
  if (!button || !modal) return;

  renderNumericWeatherChartLinks();
  button.addEventListener("click", openNumericWeatherChartModal);
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-numeric-weather-chart-close]")) {
      closeNumericWeatherChartModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNumericWeatherChartModal();
  });
}

export function openNumericWeatherChartModal() {
  const modal = document.getElementById("numeric-weather-chart-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("numeric-weather-chart-button")?.setAttribute("aria-expanded", "true");
}

function closeNumericWeatherChartModal() {
  const modal = document.getElementById("numeric-weather-chart-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("numeric-weather-chart-button")?.setAttribute("aria-expanded", "false");
  if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
}
