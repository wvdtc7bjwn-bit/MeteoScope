import { escapeHtmlString as escapeHtml } from "../../utils/html.js";
import { getLatestVolcanoReportsByType, getLatestVolcanoTargetMunicipalities, getVolcanoWarningDetailReport, parseVolcanoSeismicCountTable } from "../../jma/volcanoXml.js";
import { getCurrentLanguage, localizeText, localizeVolcanoText } from "../locale.js";

// JVDN publishes individual public pages only for its currently supported
// volcanoes. Keep the canonical page names here so a selected JMA volcano
// never produces a dead external link. The JMA catalogue uses \"ヶ\" for
// Hokkaido-Komagatake while JVDN's page uses \"ケ\".
const JVDN_VOLCANO_PAGE_NAMES = new Set([
  "アトサヌプリ", "雌阿寒岳", "大雪山", "十勝岳", "樽前山", "倶多楽", "有珠山",
  "北海道駒ケ岳", "恵山", "岩木山", "十和田", "秋田焼山", "岩手山", "秋田駒ケ岳",
  "鳥海山", "栗駒山", "蔵王山", "吾妻山", "安達太良山", "磐梯山", "那須岳",
  "日光白根山", "草津白根山", "浅間山", "新潟焼山", "弥陀ヶ原", "焼岳", "乗鞍岳",
  "御嶽山", "白山", "富士山", "箱根山", "伊豆大島", "三宅島", "八丈島",
  "鶴見岳・伽藍岳", "九重山", "阿蘇山", "雲仙岳", "霧島山", "桜島", "口永良部島", "諏訪之瀬島"
]);

const JVDN_VOLCANO_PAGE_ALIASES = new Map([
  ["北海道駒ヶ岳", "北海道駒ケ岳"],
  ["秋田駒ヶ岳", "秋田駒ケ岳"]
]);

const VOLCANO_ALERT_LEVEL_GUIDE = [
  {
    level: 5,
    keyword: "避難",
    range: "居住地域",
    action: "危険な居住地域から避難します。対象地域と避難方法は、自治体の指示を確認してください。",
    scope: 100
  },
  {
    level: 4,
    keyword: "高齢者等避難",
    range: "居住地域",
    action: "高齢者など避難に時間がかかる方は避難し、ほかの住民は避難の準備をします。",
    scope: 88
  },
  {
    level: 3,
    keyword: "入山規制",
    range: "火口から居住地域近くまで",
    action: "登山禁止や入山規制が行われます。状況により、高齢者などは避難の準備をします。",
    scope: 67
  },
  {
    level: 2,
    keyword: "火口周辺規制",
    range: "火口周辺",
    action: "火口周辺への立ち入りが規制されます。規制範囲には入らないでください。",
    scope: 45
  },
  {
    level: 1,
    keyword: "活火山であることに留意",
    range: "火口内など",
    action: "最新の火山情報を確認します。状況により、火口内への立ち入りが規制されます。",
    scope: 28
  }
];

function buildVolcanoAlertLevelGuide() {
  const scopeRows = VOLCANO_ALERT_LEVEL_GUIDE.map(({ level, keyword, scope }) => {
    const chartKeyword = level === 1 ? "活火山に留意" : keyword;
    return `
    <div class="volcano-guide-scope-row level-${level}">
      <b>L${level}</b>
      <span
        style="--volcano-guide-scope:${scope}%"
        title="${escapeHtml(localizeText(keyword))}"
        aria-label="${escapeHtml(localizeText(keyword))}"
      >${escapeHtml(localizeText(chartKeyword))}</span>
    </div>
  `;
  }).join("");
  const levelRows = VOLCANO_ALERT_LEVEL_GUIDE.map(({ level, keyword, range, action }) => `
    <li class="volcano-guide-level level-${level}">
      <span class="volcano-guide-level-number"><small>${escapeHtml(localizeText("レベル"))}</small>${level}</span>
      <div class="volcano-guide-level-copy">
        <div>
          <strong>${escapeHtml(localizeText(keyword))}</strong>
          <span>${escapeHtml(localizeText(range))}</span>
        </div>
        <p>${escapeHtml(localizeText(action))}</p>
      </div>
    </li>
  `).join("");

  return `
    <article class="volcano-level-guide">
      <header class="volcano-level-guide-header">
        <span>${escapeHtml(localizeText("火山情報の見方"))}</span>
        <h2>${escapeHtml(localizeText("噴火警戒レベル"))}</h2>
        <p>${escapeHtml(localizeText("火山活動の状況と、防災上警戒すべき範囲を5段階で示します。"))}</p>
      </header>
      <section class="volcano-guide-scope" aria-labelledby="volcano-guide-scope-title">
        <div class="volcano-guide-section-title">
          <h3 id="volcano-guide-scope-title">${escapeHtml(localizeText("警戒範囲の目安"))}</h3>
          <span>${escapeHtml(localizeText("活動に応じて範囲が広がります"))}</span>
        </div>
        <div class="volcano-guide-scope-chart">${scopeRows}</div>
        <div class="volcano-guide-scope-axis" aria-hidden="true">
          <span>${escapeHtml(localizeText("火口内"))}</span>
          <span>${escapeHtml(localizeText("火口周辺"))}</span>
          <span>${escapeHtml(localizeText("居住地域近く"))}</span>
          <span>${escapeHtml(localizeText("居住地域"))}</span>
        </div>
      </section>
      <section class="volcano-guide-levels" aria-labelledby="volcano-guide-levels-title">
        <div class="volcano-guide-section-title">
          <h3 id="volcano-guide-levels-title">${escapeHtml(localizeText("レベル別の行動"))}</h3>
          <span>${escapeHtml(localizeText("対象範囲は火山ごとに異なります"))}</span>
        </div>
        <ol>${levelRows}</ol>
      </section>
      <p class="volcano-guide-footnote">${escapeHtml(localizeText("地図上の▲を選択すると、その火山の発表内容を表示します。噴火警戒レベルを運用していない火山では、警報・予報の表現が異なります。実際の規制や避難対象は、気象庁・自治体等の最新発表に従ってください。"))}</p>
    </article>
  `;
}

function renderVolcanoList(state, render) {
  if (state.status === "loading") {
    render(`<div class="earthquake-empty">${escapeHtml(localizeText("気象庁防災情報XMLから火山情報を取得中です。"))}</div>`);
    return;
  }
  if (state.status === "error") {
    render(`<div class="earthquake-empty">${escapeHtml(localizeText("火山情報を取得できませんでした。最新性を確認できていません。"))}</div>`);
    return;
  }
  const reports = state.data?.reports ?? [];
  if (!reports.length) {
    render(`<div class="earthquake-empty">${escapeHtml(localizeText("直近の火山情報はありません。"))}</div>`);
    return;
  }
  const selectedCode = String(state.selectedVolcanoCode ?? state.data?.selectedVolcanoCode ?? "");
  const selectedBulletinId = String(state.selectedVolcanoBulletinId ?? "");
  const selectedReport = reports.find((report) =>
    String(report.volcanoCode ?? report.code ?? "") === selectedCode
  );
  const selectedBulletin = (selectedReport?.relatedReports ?? [])
    .find((item) => String(item.id ?? "") === selectedBulletinId);
  render(`
    ${selectedBulletin
      ? ""
      : selectedReport
        ? `<div class="volcano-bulletin-detail-nav volcano-selection-nav">
            <button type="button" data-volcano-clear-selection>${escapeHtml(localizeText("← 火山情報の見方"))}</button>
            <span>${escapeHtml(localizeText("地図で選択中"))}</span>
          </div>`
        : `<section class="volcano-panel-intro">
            <div>
              <strong>${escapeHtml(localizeText("火山防災情報"))}</strong>
              <span>${escapeHtml(localizeText("噴火警戒レベルと、必要な行動を確認できます。"))}</span>
            </div>
          </section>`}
    <div class="volcano-report-list">
      ${selectedReport
        ? buildSelectedVolcanoDetail(selectedReport, selectedBulletinId)
        : buildVolcanoAlertLevelGuide()}
    </div>
    <p class="volcano-source-note">${escapeHtml(localizeText("出典："))}<a href="https://www.jma.go.jp/bosai/volcano/" target="_blank" rel="noopener noreferrer">${escapeHtml(localizeText("気象庁「火山情報」"))}</a>${escapeHtml(localizeText("。MeteoScopeは気象庁の公式アプリではありません。避難や規制は自治体等の公式発表も確認してください。"))}</p>
  `);
}

function buildSelectedVolcanoDetail(report, selectedBulletinId = "") {
  const relatedReports = report.relatedReports?.length ? report.relatedReports : [report];
  const selectedBulletin = relatedReports.find((item) => String(item.id ?? "") === selectedBulletinId);
  if (selectedBulletin) return buildVolcanoBulletinDetail(report, selectedBulletin);
  const warningDetailReport = getVolcanoWarningDetailReport(report);
  const detailReport = warningDetailReport ?? report;
  const latestRelatedReports = getLatestVolcanoReportsByType(relatedReports);
  const level = Math.max(0, Math.min(5, Number(report.level) || 0));
  const priority = Math.max(0, Math.min(5, Number(report.alertPriority ?? level) || 0));
  const statusText = report.currentStatus ?? report.kindName ?? detailReport.kindName ?? "警戒状況未確認";
  const alertName = report.currentStatus ?? report.kindName ?? detailReport.kindName ?? statusText;
  const levelGuide = VOLCANO_ALERT_LEVEL_GUIDE.find((item) => item.level === level);
  const restriction = localizeVolcanoText(
    extractVolcanoRestriction(alertName, alertName),
    localizeText(levelGuide?.keyword ?? "警戒状況未確認")
  );
  const warningText = warningDetailReport
    ? warningDetailReport.prevention || warningDetailReport.volcanoHeadline || warningDetailReport.headline
    : "";
  const targetMunicipalities = getLatestVolcanoTargetMunicipalities(report);
  const craterName = relatedReports.find((item) => item.craterName)?.craterName ?? "";
  const volcanoName = report.volcanoName ? localizeText(report.volcanoName) : localizeText("火山名不明");
  const localizedCraterName = craterName ? localizeText(craterName) : "";
  const displayName = craterName && !volcanoName.includes(craterName)
    ? `${volcanoName}${localizedCraterName ? ` (${localizedCraterName})` : ""}`
    : volcanoName;
  const referenceLinks = buildVolcanoReferenceLinks(report);
  const hasLongVolcanoName = Array.from(displayName).length >= 7;
  return `
    <article class="volcano-selected-detail level-${priority}">
      <header class="volcano-selected-header${hasLongVolcanoName ? " is-long-name" : ""}">
        <div>
          <h2>${escapeHtml(displayName)}</h2>
          <time>${escapeHtml(detailReport.reportTime ?? report.reportTime ?? localizeText("発表時刻不明"))}</time>
        </div>
        ${referenceLinks}
      </header>
      ${buildVolcanoSummaryNotice()}
      <section class="volcano-alert-summary" aria-label="${escapeHtml(localizeText("現在の噴火警報・予報"))}">
        <span>${level > 0 ? escapeHtml(localizeText(`噴火警戒レベル${level}`)) : escapeHtml(localizeVolcanoText(detailReport.infoKind, localizeText("火山情報")))}</span>
        <strong>${escapeHtml(restriction)}</strong>
      </section>
      ${warningText ? `
        <section class="volcano-detail-section">
          <h3>${escapeHtml(localizeText("現在の警戒事項等"))}</h3>
          ${formatVolcanoParagraphs(
            warningText,
            localizeText(levelGuide?.action ?? "発表内容は気象庁の原文で確認してください。")
          )}
        </section>` : ""}
      ${detailReport.activity ? `
        <section class="volcano-detail-section">
          <h3>${escapeHtml(localizeText("火山活動の状況"))}</h3>
          ${formatVolcanoParagraphs(
            detailReport.activity,
            "Detailed volcanic activity is available in the original JMA bulletin."
          )}
        </section>` : ""}
      ${targetMunicipalities.length ? `
        <section class="volcano-detail-section">
          <h3>${escapeHtml(localizeText("対象市区町村"))}</h3>
          ${buildVolcanoTargetMunicipalityList(targetMunicipalities)}
        </section>` : ""}
      ${detailReport.nextAdvisory ? `
        <section class="volcano-detail-section volcano-next-advisory">
          <h3>${escapeHtml(localizeText("次回の情報"))}</h3>
          ${formatVolcanoParagraphs(
            detailReport.nextAdvisory,
            "The next bulletin schedule is available in the original JMA bulletin. Updates may be issued sooner if conditions change."
          )}
        </section>` : ""}
      ${buildVolcanoOriginalSourceLink(detailReport.sourceUrl)}
      <section class="volcano-detail-section volcano-history-section">
        <h3>${escapeHtml(localizeText("関連する発表"))}</h3>
        <div class="volcano-detail-history">
          ${latestRelatedReports.map((item) => buildVolcanoHistoryItem(item, selectedBulletinId)).join("")}
        </div>
      </section>
    </article>`;
}

function buildVolcanoBulletinDetail(volcano, bulletin) {
  const volcanoName = volcano.volcanoName ? localizeText(volcano.volcanoName) : localizeText("火山名不明");
  const craterName = bulletin.craterName ?? "";
  const localizedCraterName = craterName ? localizeText(craterName) : "";
  const displayName = craterName && !volcanoName.includes(craterName)
    ? `${volcanoName}${localizedCraterName ? ` (${localizedCraterName})` : ""}`
    : volcanoName;
  const targetMunicipalities = getLatestVolcanoTargetMunicipalities(bulletin);
  const sections = [
    bulletin.volcanoHeadline || bulletin.headline
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("発表内容"))}</h3>${formatVolcanoParagraphs(bulletin.volcanoHeadline || bulletin.headline, "See the original JMA bulletin for the full announcement.")}</section>`
      : "",
    bulletin.activity
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("火山活動の状況"))}</h3>${formatVolcanoParagraphs(bulletin.activity, "Detailed volcanic activity is available in the original JMA bulletin.")}</section>`
      : "",
    bulletin.prevention
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("警戒事項等"))}</h3>${formatVolcanoParagraphs(bulletin.prevention, "Follow the current restrictions and safety instructions from JMA and local authorities.")}</section>`
      : "",
    targetMunicipalities.length
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("対象市区町村"))}</h3>${buildVolcanoTargetMunicipalityList(targetMunicipalities)}</section>`
      : "",
    bulletin.nextAdvisory
      ? `<section class="volcano-detail-section volcano-next-advisory"><h3>${escapeHtml(localizeText("次回の情報"))}</h3>${formatVolcanoParagraphs(bulletin.nextAdvisory, "The next bulletin schedule is available in the original JMA bulletin. Updates may be issued sooner if conditions change.")}</section>`
      : ""
  ].filter(Boolean).join("");
  return `
    <article class="volcano-selected-detail volcano-bulletin-detail">
      <div class="volcano-bulletin-detail-nav">
        <button type="button" data-volcano-bulletin-back>${getCurrentLanguage() === "en" ? `← Back to ${escapeHtml(volcanoName)}` : `← ${escapeHtml(volcanoName)}の情報へ戻る`}</button>
        <span>${escapeHtml(localizeText("選択した発表"))}</span>
      </div>
      <header class="volcano-selected-header">
        <span class="volcano-selected-kicker">${escapeHtml(displayName)}</span>
        <h2>${escapeHtml(localizeVolcanoText(
          formatVolcanoBulletinTitle(bulletin.title ?? bulletin.infoKind ?? "火山情報"),
          getVolcanoBulletinFallbackTitle(bulletin)
        ))}</h2>
        <time>${escapeHtml(bulletin.reportTime ?? localizeText("発表時刻不明"))}</time>
      </header>
      ${buildVolcanoSummaryNotice()}
      ${sections || `<section class="volcano-detail-section"><p>${escapeHtml(localizeText("この発表の本文は取得できませんでした。気象庁XML原文を確認してください。"))}</p></section>`}
      ${buildVolcanoOriginalSourceLink(bulletin.sourceUrl)}
    </article>`;
}

function buildVolcanoSummaryNotice() {
  if (getCurrentLanguage() !== "en") return "";
  return `
    <aside class="volcano-summary-notice" role="note">
      <strong>Automated English summary</strong>
      <p>Only details identified with high confidence are shown. Some observations, dates, quantities, locations, conditions, and precautions may be omitted. This is not an official or complete translation. Check the original JMA bulletin before making safety decisions.</p>
    </aside>`;
}

function buildVolcanoOriginalSourceLink(sourceUrl) {
  if (!sourceUrl) return "";
  return `<a class="volcano-xml-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localizeText("気象庁発表原文を確認"))}</a>`;
}

function buildVolcanoReferenceLinks(report) {
  const volcanoCode = String(report?.volcanoCode ?? report?.code ?? "").trim();
  const volcanoName = String(report?.volcanoName ?? "").trim();
  const links = [];
  if (/^\d{3}$/u.test(volcanoCode)) {
    links.push({
      label: localizeText("気象庁"),
      accessibleLabel: localizeText("気象庁の火山ページを開く"),
      url: `https://www.data.jma.go.jp/vois/data/report/activity_info/${volcanoCode}.html`
    });
  }
  const jvdnPageName = JVDN_VOLCANO_PAGE_NAMES.has(volcanoName)
    ? volcanoName
    : JVDN_VOLCANO_PAGE_ALIASES.get(volcanoName);
  if (jvdnPageName) {
    links.push({
      label: "JVDN",
      accessibleLabel: localizeText("JVDNの火山ページを開く"),
      url: `https://jvdn.bosai.go.jp/portal/ja/${encodeURIComponent(jvdnPageName)}`
    });
  }
  if (!links.length) return "";
  return `
    <nav class="volcano-reference-links" aria-label="${escapeHtml(localizeText("選択した火山の外部情報"))}">
      ${links.map(({ label, accessibleLabel, url }) => `<a class="volcano-reference-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(accessibleLabel)}">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`).join("")}
    </nav>`;
}

function extractVolcanoRestriction(statusText, fallback) {
  const match = String(statusText ?? "").match(
    /^(?:噴火警戒)?レベル\s*[1-5]\s*[（(]([^）)]+)[）)]/u
  );
  return match?.[1] ?? fallback ?? statusText ?? "警戒状況未確認";
}

function formatVolcanoParagraphs(value, englishFallback = "") {
  if (getCurrentLanguage() === "en") {
    const paragraphs = String(value ?? "")
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => localizeVolcanoText(paragraph, englishFallback))
      .filter((paragraph, index, values) =>
        Boolean(paragraph) && values.indexOf(paragraph) === index
      );
    return (paragraphs.length ? paragraphs : [englishFallback])
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
  }
  return String(value ?? "")
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(formatVolcanoParagraph)
    .join("");
}

function formatVolcanoParagraph(paragraph) {
  const countTable = parseVolcanoSeismicCountTable(paragraph);
  if (!countTable) return `<p>${escapeHtml(paragraph)}</p>`;
  const before = countTable.before.length
    ? `<p>${escapeHtml(countTable.before.join("\n"))}</p>`
    : "";
  const after = countTable.after.length
    ? `<p>${escapeHtml(countTable.after.join("\n"))}</p>`
    : "";
  const rows = countTable.rows.map((row) => `
    <tr>
      <th scope="row">${escapeHtml(row.period)}</th>
      <td>${escapeHtml(row.earthquakeCount)}回</td>
      <td>${escapeHtml(row.explosionCount)}回</td>
    </tr>`).join("");
  return `${before}
    <div class="volcano-seismic-table-wrap">
      <table class="volcano-seismic-table">
        <caption>火山性地震・爆発の回数</caption>
        <thead>
          <tr>
            <th scope="col">期間</th>
            <th scope="col">火山性地震</th>
            <th scope="col">爆発</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${after}`;
}

function buildVolcanoTargetMunicipalityList(municipalities) {
  return `
    <ul class="volcano-target-municipality-list">
      ${municipalities.map((area) => `<li>${escapeHtml(area.name ? localizeText(area.name) : localizeText("対象地域不明"))}</li>`).join("")}
    </ul>`;
}

function buildVolcanoHistoryItem(report, selectedBulletinId = "") {
  const summary = report.volcanoHeadline || report.headline || report.activity || report.prevention || "発表内容は気象庁の原文で確認してください。";
  const reportId = String(report.id ?? "");
  const selectedClass = reportId === selectedBulletinId ? " is-selected" : "";
  const title = localizeVolcanoText(
    formatVolcanoBulletinTitle(report.title ?? report.kindName ?? report.infoKind ?? "火山情報"),
    getVolcanoBulletinFallbackTitle(report)
  );
  const displaySummary = localizeVolcanoText(
    summary,
    "Open this bulletin for the latest volcanic activity and safety information."
  );
  return `
    <button type="button" class="volcano-history-item${selectedClass}" data-volcano-bulletin-id="${escapeHtml(reportId)}"${reportId ? "" : " disabled"}>
      <span><strong>${escapeHtml(title)}</strong><time>${escapeHtml(report.reportTime ?? localizeText("発表時刻不明"))}</time><small>${escapeHtml(displaySummary)}</small></span>
      <b aria-hidden="true">›</b>
    </button>`;
}

function getVolcanoBulletinFallbackTitle(report) {
  const source = [
    report?.title,
    report?.kindName,
    report?.infoKind,
    report?.bulletinCode
  ].filter(Boolean).join(" ");
  if (/降灰/u.test(source) || /VFVO5[3-6]/u.test(source)) return "Ashfall forecast";
  if (/解説/u.test(source) || /VFSV/u.test(source)) return "Volcano activity commentary";
  if (/観測報/u.test(source) || /VFVO52/u.test(source)) return "Volcanic observation report";
  if (/噴火速報/u.test(source) || /VFVO50/u.test(source)) return "Eruption bulletin";
  if (/警報|予報/u.test(source) || /VFVO51/u.test(source)) return "Volcanic warning or forecast";
  return localizeText("火山情報");
}

function formatVolcanoBulletinTitle(value) {
  const compact = String(value ?? "火山情報")
    .replace(/^火山名[\s\u3000]*/u, "")
    .replace(/(?:令和|平成|昭和)[０-９\d]+年[０-９\d]+月[０-９\d]+日[０-９\d]+時[０-９\d]+分\s*$/u, "")
    .trim();
  const numbered = compact.match(/^(?<kind>.+?)[（(][^()（）]*?第(?<number>[０-９\d]+)号[）)]$/u);
  if (numbered?.groups) return `${numbered.groups.kind}（第${numbered.groups.number}号）`;
  return compact || "火山情報";
}

export {
  VOLCANO_ALERT_LEVEL_GUIDE,
  renderVolcanoList
};
