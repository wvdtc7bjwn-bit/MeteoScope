import { SAMPLE_PROFILE } from "../science/numericalCalculations.js";
import { buildNumericalPython } from "../science/numericalPython.js";
import "./numericalCalculation.css";

const MODES = [
  { id: "thermal", title: "熱力学", description: "気温・気圧・相対湿度から温位、露点、混合比などを計算します。", fields: [
    ["temperature", "気温 (°C)", 25, -80, 50, 0.1], ["pressure", "気圧 (hPa)", 1000, 100, 1100, 0.1], ["humidity", "相対湿度・液水基準 (%)", 70, 1, 100, 0.1],
  ] },
  { id: "profile", title: "鉛直解析", description: "CSVから温位・乾燥静的安定度・風の鉛直変化を解析します。初期表示は架空のサンプルです。" },
  { id: "moist", title: "湿潤熱力学・湿潤断熱線", description: "相当温位と湿球温度、LCL前後の理想化した気塊上昇を計算します。", fields: [
    ["temperature", "気温 (°C)", 25, -40, 40, .1], ["pressure", "出発気圧 (hPa)", 1000, 600, 1100, .1], ["humidity", "相対湿度・液水基準 (%)", 70, 5, 100, .1], ["topPressure", "上端気圧・LCLより上 (hPa)", 300, 100, 1000, .1],
  ] },
  { id: "lcl", title: "雲底高度の目安（LCL）", description: "持ち上げ凝結高度の温度・気圧と、出発点からの高度差を求めます。実際の雲底の観測値ではありません。", fields: [
    ["temperature", "気温 (°C)", 25, -40, 40, .1], ["pressure", "出発気圧 (hPa)", 1000, 600, 1100, .1], ["humidity", "相対湿度・液水基準 (%)", 70, 5, 100, .1],
  ] },
  { id: "waterColumn", title: "可降水量・湿潤静的エネルギー", csv: true, description: "鉛直CSVの入力範囲だけの水蒸気量と湿潤静的エネルギーを求めます。初期表示は架空のサンプルです。" },
  { id: "richardson", title: "勾配Richardson数", csv: true, description: "鉛直CSVの乾燥成層と風のシアを比較します。シアがゼロの層は未定義です。初期表示は架空のサンプルです。" },
  { id: "transport", title: "移流・拡散", description: "1次元の周期領域でトレーサーを移流・拡散させ、数値解と参照解を比較します。", fields: [
    ["length", "領域長 (m)", 100000, 1000, 1000000, 100], ["cells", "格子数", 128, 32, 256, 1], ["velocity", "移流速度 (m/s)", 10, -100, 100, 0.1],
    ["diffusivity", "拡散係数 (m²/s)", 1000, 0, 1000000, 1], ["dt", "時間刻み (s)", 60, 0.01, 3600, 0.01],
    ["duration", "終了時刻 (s)", 3600, 0.01, 172800, 0.01], ["sigma", "初期ガウス分布の標準偏差 (m)", 10000, 10, 125000, 1],
  ] },
  { id: "thickness", title: "気圧と層厚（測高公式）", group: "熱力学・鉛直解析", description: "層平均仮温度と上下の気圧から、静力学平衡での層厚を求めます。", fields: [
    ["lowerPressure", "下層気圧 (hPa)", 1000, 100, 1100, .1], ["upperPressure", "上層気圧 (hPa)", 500, 10, 1000, .1], ["meanVirtualTemperature", "層平均仮温度 (K)", 270, 180, 340, .1],
  ] },
  { id: "geostrophic", title: "地衡風", group: "大気力学", description: "等圧面のジオポテンシャル高度勾配から地衡風を計算します。南緯は負で入力します。", fields: [
    ["latitude", "緯度 (°・北正南負)", 35, -85, 85, .1], ["gradientX", "東向き高度勾配 (m/100 km)", 0, -1000, 1000, .1], ["gradientY", "北向き高度勾配 (m/100 km)", -10, -1000, 1000, .1],
  ] },
  { id: "thermalWind", title: "温度風", group: "大気力学", description: "層内の一定温度勾配から、上下の地衡風の差を計算します。", fields: [
    ["latitude", "緯度 (°・北正南負)", 35, -85, 85, .1], ["lowerPressure", "下層気圧 (hPa)", 1000, 100, 1100, .1], ["upperPressure", "上層気圧 (hPa)", 500, 10, 1000, .1],
    ["temperatureGradientX", "東向き温度勾配 (K/100 km)", 0, -20, 20, .1], ["temperatureGradientY", "北向き温度勾配 (K/100 km)", -1, -20, 20, .1],
    ["lowerU", "下層地衡風 u (m/s)", 5, -150, 150, .1], ["lowerV", "下層地衡風 v (m/s)", 0, -150, 150, .1],
  ] },
  { id: "coriolis", title: "コリオリ・慣性振動", group: "大気力学", description: "コリオリ係数・慣性周期・Rossby数を求め、自由な慣性振動を表示します。", fields: [
    ["latitude", "緯度 (°・北正南負)", 35, -90, 90, .1], ["velocity", "初期東向き風速 (m/s)", 10, 0, 100, .1], ["length", "代表長さ (m)", 100000, 1000, 1000000, 100],
  ] },
  { id: "radiation", title: "黒体・灰色体の放射", group: "放射", description: "放射発散度、放射収支、Wien則の波長、Planck分布を計算します。", fields: [
    ["temperatureK", "放射体の温度 (K)", 288, 150, 400, .1], ["emissivity", "放射率 ε (0〜1)", .98, 0, 1, .01], ["incomingFlux", "吸収済み流入放射 (W/m²)", 350, 0, 1500, .1],
  ] },
  { id: "oscillator", title: "減衰・浮力振動（RK4）", group: "数値実験", description: "減衰振動を4次Runge–Kutta法で解き、解析解と比較します。", fields: [
    ["frequency", "角振動数 ω (rad/s)", .01, .001, .1, .001], ["damping", "減衰比 ζ", .1, 0, 2, .01], ["displacement", "初期変位 (m)", 100, -1000, 1000, 1],
    ["initialVelocity", "初期鉛直速度 (m/s)", 0, -100, 100, .1], ["dt", "時間刻み (s)", 1, .01, 100, .01], ["duration", "終了時刻 (s)", 3600, .01, 86400, .01],
  ] },
];
const METRICS = {
  potentialTemperature: ["温位", "K"], dewPoint: ["露点", "°C"], mixingRatio: ["混合比", "g/kg"], specificHumidity: ["比湿", "g/kg"],
  virtualTemperature: ["仮温度", "K"], density: ["湿潤空気の密度", "kg/m³"], levels: ["入力層数", "層"], minN2: ["最小 N²", "s⁻²"], maxN2: ["最大 N²", "s⁻²"],
  bulkWindDifference: ["全層の風ベクトル差", "m/s"], courant: ["Courant数 C", ""], diffusionNumber: ["拡散数 D", ""], stabilityNumber: ["C + 2D", "≤ 1"],
  steps: ["計算ステップ数", ""], rmse: ["参照解との RMSE", ""], massChangePercent: ["総量の変化", "%"],
  layerThickness: ["層厚", "m"], coriolisParameter: ["コリオリ係数 f", "s⁻¹"], u: ["地衡風 u", "m/s"], v: ["地衡風 v", "m/s"], windSpeed: ["地衡風速", "m/s"],
  deltaU: ["地衡風差 Δu", "m/s"], deltaV: ["地衡風差 Δv", "m/s"], upperU: ["上層地衡風 u", "m/s"], upperV: ["上層地衡風 v", "m/s"],
  inertialPeriodHours: ["慣性周期", "h"], inertialRadius: ["慣性半径", "m"], rossbyNumber: ["Rossby数", ""],
  emittedFlux: ["放射発散度", "W/m²"], netRadiativeFlux: ["正味放射（加熱側が正）", "W/m²"], peakWavelength: ["Wien波長・黒体参照値", "µm"],
  naturalPeriodSeconds: ["非減衰固有周期", "s"], displacementRmse: ["変位 RMSE", "m"], maxDisplacementError: ["変位の最大誤差", "m"],
  equivalentPotentialTemperature: ["相当温位 θe", "K"], wetBulbTemperature: ["湿球温度・Normand近似", "°C"], lclTemperature: ["LCL温度", "°C"], lclPressure: ["LCL気圧", "hPa"], lclHeight: ["LCL高度差・出発点基準", "m"],
  precipitableWater: ["入力範囲の可降水量", "mm"], bottomPressure: ["積分下端気圧", "hPa"], topPressure: ["積分上端気圧", "hPa"], minRichardson: ["最小 Ri・定義された層のみ", ""], undefinedLayers: ["Ri未定義の層", "層"],
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = element("button", text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function svgNode(tag, attrs, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, val]) => node.setAttribute(key, String(val)));
  if (text !== undefined) node.textContent = text;
  return node;
}
function format(value) {
  if (value === null) return "未定義";
  if (value === 0) return "0";
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 100000) return value.toExponential(3);
  return Number(value.toPrecision(5)).toString();
}

export function buildNumericalChart(chart) {
  const figure = element("figure", undefined, "numerical-chart");
  figure.append(element("figcaption", chart.title));
  const svg = svgNode("svg", { viewBox: "0 0 620 360", role: "img", "aria-label": `${chart.title}。横軸${chart.xLabel}、縦軸${chart.yLabel}。${chart.series.map(s => s.name).join("、")}` });
  const rawPoints = chart.series.flatMap(series => series.points);
  if (rawPoints.some(p => p.some(v => v !== null && !Number.isFinite(v)))) throw new Error("グラフに不正なデータがあります。");
  const valid = p => p.every(v=>v !== null && Number.isFinite(v));
  const points = rawPoints.filter(valid);
  if (!points.length) { figure.append(element("p", "定義されたデータがありません。入力条件を確認してください。")); return figure; }
  let minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
  let minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
  if (minX === maxX) { minX -= Math.max(1, Math.abs(minX) * 0.05); maxX += Math.max(1, Math.abs(maxX) * 0.05); }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const x = v => 88 + (v - minX) / (maxX - minX) * 506;
  const y = v => 20 + (chart.invertY ? (v - minY) : (maxY - v)) / (maxY - minY) * 280;
  for (let i = 0; i <= 4; i++) {
    const xv = minX + (maxX - minX) * i / 4, yv = minY + (maxY - minY) * i / 4;
    svg.append(svgNode("line", { x1: x(xv), x2: x(xv), y1: 20, y2: 300, class: "numerical-gridline" }));
    svg.append(svgNode("line", { x1: 88, x2: 594, y1: y(yv), y2: y(yv), class: "numerical-gridline" }));
    svg.append(svgNode("text", { x: x(xv), y: 321, "text-anchor": "middle" }, format(xv)));
    svg.append(svgNode("text", { x: 78, y: y(yv) + 4, "text-anchor": "end" }, format(yv)));
  }
  chart.series.forEach((series, i) => {
    let segment = [];
    const draw = () => {
      if (segment.length) svg.append(svgNode("polyline", { points: segment.map(p => `${x(p[0]).toFixed(3)},${y(p[1]).toFixed(3)}`).join(" "), fill: "none", class: `numerical-line numerical-line-${i % 3}` }));
      if (segment.length === 1) svg.append(svgNode("circle", {cx:x(segment[0][0]),cy:y(segment[0][1]),r:3,fill:"none",class:`numerical-line numerical-line-${i % 3}`}));
      segment = [];
    };
    series.points.forEach(p=>{ if (valid(p)) segment.push(p); else draw(); });
    draw();
  });
  svg.append(svgNode("text", { x: 341, y: 347, "text-anchor": "middle" }, chart.xLabel));
  svg.append(svgNode("text", { transform: "translate(16 160) rotate(-90)", "text-anchor": "middle" }, chart.yLabel));
  const legend = element("div", undefined, "numerical-legend");
  chart.series.forEach((s, i) => legend.append(element("span", s.name, `numerical-key numerical-key-${i % 3}`)));
  figure.append(svg, legend);
  return figure;
}

function download(contents, filename, mime) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = element("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map(row => keys.map(k => row[k]).join(","))].join("\n");
}

export function setupNumericalCalculationModal() {
  const opener = document.getElementById("numerical-calculation-button");
  const modal = document.getElementById("numerical-calculation-modal");
  const body = document.getElementById("numerical-calculation-body");
  if (!opener || !modal || !body || opener.dataset.ready === "true") return;
  opener.dataset.ready = "true";
  let built = false, mode = "thermal", worker = null, generation = 0, previousFocus = null;
  const drafts = {};
  let form, output, status, submit;
  const cancel = () => { generation++; worker?.terminate(); worker = null; if (submit) { submit.disabled = false; submit.textContent = "計算する"; } if (form) form.setAttribute("aria-busy", "false"); };
  const invalidate = () => { cancel(); output.replaceChildren(); status.textContent = "入力が変わりました。「計算する」で結果を更新してください。"; };
  function showResult(result) {
    status.textContent = "計算完了。入力条件と同じ計算をPythonでも再現できます。";
    output.replaceChildren();
    const metrics = element("dl", undefined, "numerical-metrics");
    Object.entries(result.summary).forEach(([key, number]) => {
      const [label, unit] = METRICS[key];
      const item = element("div");
      item.append(element("dt", label), element("dd", `${format(number)} ${unit}`));
      metrics.append(item);
    });
    const charts = element("div", undefined, "numerical-charts");
    result.charts.forEach(chart => charts.append(buildNumericalChart(chart)));
    const method = element("section", undefined, "numerical-method");
    method.append(element("h3", "計算方法・適用範囲"), element("p", result.method));
    const units = { profile: "気圧 hPa / 高度 m / 気温・露点 °C / 相対湿度 % / u,v m/s / 温位 K / N² s⁻² / シア s⁻¹", transport: "位置 m / トレーサー量 無次元 / C,D,RMSE 無次元 / 総量変化 %", thermal: "気圧 hPa / 気温 °C", thickness: "気圧 hPa / 相対高度 m", geostrophic: "距離 m / 高度差 m", thermalWind: "気圧 hPa / u,v m/s", coriolis: "時間 h / u,v m/s", radiation: "波長 µm / 放射輝度 W m⁻² sr⁻¹ µm⁻¹", oscillator: "時間 s / 変位 m / 速度 m/s" }[result.type];
    const extraUnits = {moist:"気圧 hPa / 気温 °C / phase 0=乾燥・1=飽和",lcl:"気圧 hPa / 気温 °C / 出発点からの高度差 m",waterColumn:"気圧 hPa / Δp Pa / q kg/kg / q表示 g/kg / エネルギー J/kg / 層別・累積可降水量 mm",richardson:"気圧 hPa / 高度 m / 気温・露点 °C / 相対湿度 % / u,v m/s / 温位 K / N² s⁻² / シア s⁻¹ / Ri 無次元（空欄=未定義）"};
    const resultUnits = units ?? extraUnits[result.type];
    method.append(element("p", `CSVの単位：${resultUnits}`));
    const explanation = element("details", undefined, "numerical-explanation");
    explanation.append(element("summary", "計算過程 — 式・代入・中間値を確認"));
    const steps = element("ol");
    result.steps.forEach(step => {
      const item = element("li");
      item.append(element("h4", step.title), element("p", step.formula, "numerical-equation"), element("p", `代入：${step.substitution}`), element("p", `結果：${step.answer}`, "numerical-step-answer"), element("p", step.detail));
      steps.append(item);
    });
    explanation.append(steps, element("p", "解説中の数値は表示桁数に丸めています。計算内部は丸めず、CSV・JSONには計算値を出力します。"));
    const actions = element("div", undefined, "numerical-actions");
    const timestamp = new Date().toISOString();
    actions.append(button("条件・結果を保存 (.json)", () => download(JSON.stringify({ version: 1, calculatedAt: timestamp, units: resultUnits, ...result }, null, 2), "meteoscope-calculation.json", "application/json")),
      button("結果CSV", () => download(csv(result.rows), `meteoscope-${result.type}.csv`, "text/csv;charset=utf-8")));
    if (result.layers) actions.append(button("層別診断CSV", () => download(csv(result.layers), "meteoscope-profile-layers.csv", "text/csv;charset=utf-8")));
    const details = element("details", undefined, "numerical-python");
    details.append(element("summary", "Pythonプログラム — コピー・ダウンロード"));
    details.append(element("p", "Python 3.10以上。計算は標準ライブラリ、作図にはmatplotlibが必要です。入力値・計算・CSV保存・作図を含みます。ファイル保存先は実行時の作業フォルダーです。アプリ内でPythonを実行する機能ではありません。"));
    const code = element("textarea");
    code.readOnly = true;
    code.spellcheck = false;
    code.setAttribute("aria-label", "コピー用Pythonコード");
    code.value = buildNumericalPython(result);
    const codeActions = element("div", undefined, "numerical-actions");
    const copyStatus = element("p");
    copyStatus.setAttribute("role", "status");
    codeActions.append(button("Pythonをコピー", async () => {
      try { await navigator.clipboard.writeText(code.value); copyStatus.textContent = "コピーしました。"; }
      catch { code.focus(); code.select(); copyStatus.textContent = "自動コピーできませんでした。選択されたコードを手動でコピーしてください。"; }
    }), button(".pyを保存", () => download(code.value, `meteoscope-${result.type}.py`, "text/x-python;charset=utf-8")));
    details.append(codeActions, copyStatus, code);
    output.append(metrics, explanation, charts, method, actions, details);
  }
  function renderForm() {
    cancel();
    const spec = MODES.find(m => m.id === mode);
    form.replaceChildren(element("h3", spec.title, "numerical-form-title"), element("p", spec.description, "numerical-description"));
    output.replaceChildren();
    status.textContent = "条件を入力して計算してください。値は端末内で処理し、サーバーへ送信しません。";
    const fields = element("div", undefined, "numerical-fields");
    if (mode === "profile" || spec.csv) {
      const label = element("label", "鉛直データCSV（高度昇順・気圧降順、3〜300層）");
      const input = element("textarea");
      input.id = "numerical-profile-csv";
      input.name = "csv";
      input.value = drafts[mode]?.csv ?? SAMPLE_PROFILE;
      input.spellcheck = false;
      input.required = true;
      label.htmlFor = input.id;
      fields.append(label, element("p", "列：気圧(hPa), 高度(m), 気温(°C), 相対湿度(%・液水基準), u(m/s・東向き), v(m/s・北向き)。ヘッダーは下記サンプルの形式か、省略してください。高度は同じ基準を使ってください。"), input,
        button("架空サンプルを入力", () => { input.value = SAMPLE_PROFILE; drafts[mode] = { csv: input.value }; invalidate(); }));
      fields.classList.add("numerical-profile-input");
    } else {
      spec.fields.forEach(([key, title, initial, min, max, step]) => {
        const label = element("label", title);
        const input = element("input");
        input.type = "number";
        input.name = key;
        input.id = `numerical-${key}`;
        input.min = min;
        input.max = max;
        input.step = step;
        input.required = true;
        input.value = drafts[mode]?.[key] ?? initial;
        label.htmlFor = input.id;
        label.append(input);
        fields.append(label);
      });
    }
    submit = element("button", "計算する", "numerical-submit");
    submit.type = "submit";
    form.append(fields, submit);
  }
  function build() {
    const intro = element("p", "数式・単位・近似を確認しながら試算する計算ワークスペースです。研究での利用は、観測データ・既知解・独立した実装と照合してください。", "numerical-intro");
    const selector = element("label", "計算項目", "numerical-selector");
    const select = element("select");
    select.id = "numerical-mode"; selector.htmlFor = select.id; select.setAttribute("aria-label", "計算項目");
    const groups = new Map();
    MODES.forEach(spec => {
      const name = spec.group ?? (spec.id === "transport" ? "数値実験" : "熱力学・鉛直解析");
      if (!groups.has(name)) { const group = element("optgroup"); group.label = name; groups.set(name, group); }
      const option = element("option", spec.title); option.value = spec.id; groups.get(name).append(option);
    });
    select.append(...groups.values()); selector.append(select);
    select.addEventListener("change", () => { mode = select.value; renderForm(); });
    const pane = element("section");
    pane.id = "numerical-pane";
    form = element("form");
    form.setAttribute("aria-label", "数値計算の入力条件");
    status = element("p", undefined, "numerical-status");
    status.setAttribute("role", "status");
    output = element("div", undefined, "numerical-output");
    form.addEventListener("input", () => { drafts[mode] = Object.fromEntries(new FormData(form)); invalidate(); });
    form.addEventListener("submit", event => {
      event.preventDefault();
      cancel();
      output.replaceChildren();
      const input = Object.fromEntries(new FormData(form));
      drafts[mode] = input;
      const id = generation;
      status.textContent = "計算中…";
      submit.textContent = "計算中…"; submit.disabled = true; form.setAttribute("aria-busy", "true");
      try {
        worker = new Worker(new URL("../science/numericalCalculationWorker.js", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }) => {
          if (id !== generation) return;
          cancel();
          if (data.error) { status.textContent = data.error; return; }
          try { showResult(data.result); } catch (error) { output.replaceChildren(); status.textContent = `表示できませんでした：${error.message}`; }
        };
        worker.onerror = () => { if (id !== generation) return; cancel(); status.textContent = "計算処理を開始できませんでした。ページを再読み込みしてください。"; };
        worker.postMessage({ type: mode, input });
      } catch { cancel(); status.textContent = "この環境では計算用Workerを開始できません。対応ブラウザでお試しください。"; }
    });
    pane.append(form, status, output);
    const sources = element("p", undefined, "numerical-sources");
    sources.append(document.createTextNode("式・計算方法の参考： "));
    [["MetPy 計算資料", "https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.html"], ["MIT 移流差分法", "https://ocw.mit.edu/courses/18-086-mathematical-methods-for-engineers-ii-spring-2006/resources/am52/"], ["NASA 黒体放射", "https://lhea.gsfc.nasa.gov/archive/mwmw/mmw_bbody.html"]].forEach(([name, href]) => {
      const link = element("a", name); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; sources.append(link, document.createTextNode(" "));
    });
    body.append(intro, selector, pane, sources);
    renderForm();
    built = true;
  }
  const close = () => {
    if (modal.hidden) return;
    cancel();
    if (status?.textContent === "計算中…") status.textContent = "計算を中断しました。再度計算してください。";
    modal.hidden = true; opener.setAttribute("aria-expanded", "false");
    if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
    const focus = previousFocus?.closest?.("#map-utility-actions") ? document.getElementById("map-utility-menu-toggle") : previousFocus;
    focus?.focus?.({ preventScroll: true });
  };
  opener.addEventListener("click", () => {
    previousFocus = document.activeElement;
    if (!built) build();
    modal.hidden = false; opener.setAttribute("aria-expanded", "true"); document.body.classList.add("modal-open");
    modal.querySelector("button[data-numerical-close]")?.focus({ preventScroll: true });
  });
  modal.addEventListener("click", event => { if (event.target instanceof Element && event.target.closest("[data-numerical-close]")) close(); });
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const items = [...modal.querySelectorAll('button:not(:disabled), select, input, textarea, summary, a[href]')].filter(node => node.tabIndex >= 0 && node.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}
