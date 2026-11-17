import { JMA_ENDPOINTS, MAP_DATA_ENDPOINTS } from "../config.js";
import { getCurrentLanguage } from "./locale.js";
import { loadSimulationResource, SimulationPreparationError } from "../simulation/preparationErrors.js";
import { createSimulationCamera } from "../simulation/camera.js";
import {getFaultAssessment, faultAssessmentCaseId, publishedMagnitudeBounds, publishedMagnitudeDefault} from "../simulation/faultAssessment.js";

const text = (ja, en) => getCurrentLanguage() === "en" ? en : ja;
const modelNames = () => [
  ["point", text("任意震源", "Custom epicenter")],
  ["active-fault", text("活断層（J-SHIS）", "Active fault (J-SHIS)")],
  ["nankai-trough", text("南海トラフ", "Nankai Trough")],
  ["kuril-trench", text("千島海溝", "Kuril Trench")],
  ["japan-trench", text("日本海溝", "Japan Trench")]
];

export function setupEarthquakeSimulation({ getMap, activate, canStart, onFrame, onStop }) {
  const button = document.getElementById("earthquake-simulation-button");
  if (!button) return null;
  let core = null;
  let player = null;
  let preparation = null;
  let sequence = 0;
  let picking = false;
  let lastFocused = null;
  let lastValues = null;
  let lastFrame = null;
  let groundCoverage = null;
  let scenarioIntensity = null;
  let scenarioCoverage = null;
  let faultModelController = null;
  let faultModelLoading = false;
  let selectedCaseId = "";
  let intensityEstimateAvailable = true;
  let offshoreDetectionCount = 0;
  let firstReportElapsedSec = null;
  let intensityDisplay = "current";
  let playbackMinimized = false;
  let selectedFault = null;
  let faultCatalog = [];
  let faultCatalogController = null;
  const modal = document.createElement("div");
  modal.id = "earthquake-simulation-modal";
  modal.className = "warning-modal simulation-modal";
  modal.hidden = true;
  // Keep the shell mounted so the shared hidden/open transition can run.
  modal.innerHTML = `<div class="warning-modal-backdrop" data-simulation-close></div>
    <section class="warning-modal-panel simulation-panel" role="dialog" aria-modal="true" aria-labelledby="simulation-title">
      <header class="settings-modal-header"><div><small>SIMULATION</small><h2 id="simulation-title"></h2></div>
        <button type="button" class="warning-modal-close" data-simulation-close>×</button></header>
      <div class="simulation-body"></div>
    </section>`;
  const modalBody = modal.querySelector(".simulation-body");
  const playback = document.createElement("section");
  playback.className = "simulation-playback";
  playback.hidden = true;
  const camera = createSimulationCamera({
    fitToCoordinates: (coordinates, options) => getMap()?.fitToCoordinates(coordinates, { ...options, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : options.duration }),
    onFollowingChange: following => { const select = playback.querySelector("[data-simulation-camera]"); if (select) select.value = following ? "follow" : "manual"; },
  });
  const notice = document.createElement("div");
  notice.className = "simulation-notice";
  notice.setAttribute("role", "status");
  notice.hidden = true;
  document.body.append(modal);
  document.getElementById("map")?.parentElement?.append(playback, notice);
  const field = name => modal.querySelector(`[name="${name}"]`);
  const isRealEvent = () => !canStart();
  const showNotice = message => { notice.textContent = message; notice.hidden = !message; };

  function updateModalLabels() {
    modal.querySelector("#simulation-title").textContent = text("地震シミュレーション", "Earthquake simulation");
    modal.querySelector(".warning-modal-close").setAttribute("aria-label", text("閉じる", "Close"));
  }
  updateModalLabels();

  function renderForm() {
    modalBody.innerHTML = `<form class="simulation-form">
          <p class="simulation-disclaimer">${text("学習用の模擬計算です。実際の地震・EEWではありません。", "Educational simulation. This is not a real earthquake or EEW.")}</p>
          <aside class="simulation-disclaimer" data-simulation-deep-warning role="note" hidden>
            <strong>${text("深発地震の表示について", "About deep-earthquake simulations")}</strong>
            <p>${text("深発地震は学習用の近似表示で、実際の地震がこの表示どおりになることを示すものではありません。震度分布・揺れの強さや収まり方・EEWの推移は実際と異なる場合があります。深さ150kmを超えるシミュレーションでは、EEWの対象地域名と赤い地域表示を出しません。実際の震度予測や防災判断には使用しないでください。", "Deep earthquakes use an educational approximation. Real earthquakes will not necessarily behave as shown. Intensity distribution, shaking strength and decay, and EEW updates may differ from reality. For simulations deeper than 150 km, EEW target region names and red regional shading are not shown. Do not use this simulation to predict actual intensities or make safety decisions.")}</p>
          </aside>
          <label>${text("震源モデル", "Source model")}<select name="model">${modelNames().map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <section class="simulation-active-fault" hidden>
            <label>${text("活断層を検索", "Search active faults")}<input name="faultSearch" type="search" placeholder="${text("例：上町、糸魚川、中央構造線", "Fault name")}"></label>
            <label>${text("活断層・活動ケース", "Active fault / activity case")}<select name="activeFaultId"></select></label>
            <p data-active-fault-status role="status"></p>
            <button type="button" class="simulation-secondary" data-active-fault-retry hidden>${text("一覧を再読み込み", "Reload fault list")}</button>
            <p data-active-fault-description></p>
            <p data-active-model-status role="status"></p>
            <label>${text("規模の資料", "Magnitude source")}<select name="magnitudeBasis"><option value="herp-M">${text("地震調査委員会の公表Mを優先", "Prefer HERP published M")}</option><option value="Mw">${text("計算用Mwを指定", "Specify calculation Mw")}</option></select></label>
            <label data-assessment-case-label>${text("公表Mの活動ケース", "Published M activity case")}<select name="assessmentCase"></select></label>
            <label data-assessment-value-label hidden>${text("公表Mの範囲から選択", "Choose a value within published M bounds")}<select name="assessmentMagnitude"></select></label>
            <p data-assessment-default-note hidden></p>
            <p data-active-assessment></p><a data-active-assessment-link target="_blank" rel="noopener noreferrer" hidden></a>
            <p data-magnitude-basis-note></p>
            <p>${text("断層形状は選択した2024年版モデルの全断層面です。公表Mを選んでも形状は変わりません。最新評価で区分が変わった場合も、旧モデルの形状を最新の区分とは見なしません。", "Geometry uses all planes of the selected 2024 model. Selecting published M does not change geometry or reproduce revised activity sections.")}</p>
            <a href="https://www.j-shis.bosai.go.jp/api-vectortile-majorfault" target="_blank" rel="noopener noreferrer">${text("一覧：J-SHIS 2022年版・MAX確率ケース", "Index: J-SHIS 2022, MAX probability case")} ↗</a><br>
            <a data-active-model-source target="_blank" rel="noopener noreferrer" hidden>${text("計算に使用する2024年版モデル（公式API） ↗", "2024 calculation model (official API) ↗")}</a>
          </section>
          <label class="simulation-nankai-case" hidden>${text("南海トラフの破壊ケース", "Nankai rupture case")}<select name="nankaiCase"><option value="full">${text("全割れ", "Full rupture")}</option><option value="east">${text("半割れ・東側", "Eastern half")}</option><option value="west">${text("半割れ・西側", "Western half")}</option></select></label>
          <div class="simulation-coordinate-fields simulation-fields">
            <label>${text("緯度", "Latitude")}<input name="latitude" type="number" min="-85" max="85" step="0.0001" required inputmode="decimal"></label>
            <label>${text("経度", "Longitude")}<input name="longitude" type="number" min="-180" max="180" step="0.0001" required inputmode="decimal"></label>
          </div>
          <button class="simulation-secondary" type="button" data-simulation-pick>${text("地図で震源を選ぶ", "Choose epicenter on map")}</button>
          <div class="simulation-fields">
            <label><span data-magnitude-label>${text("計算用Mw", "Calculation Mw")}</span><input name="magnitude" aria-label="${text("マグニチュード Mw", "Moment magnitude Mw")}" type="number" min="1" max="9.5" step="0.1" required inputmode="decimal"></label>
            <label>${text("深さ（km）", "Depth (km)")}<input name="depthKm" type="number" min="0" max="700" step="1" required inputmode="numeric"></label>
          </div>
          <div class="simulation-fault-fields simulation-fields" hidden>
            <label>${text("破壊開始位置", "Rupture origin")}<select name="ruptureOrigin"><option value="center">${text("中央", "Center")}</option><option value="start">${text("始点側", "Start")}</option><option value="end">${text("終点側", "End")}</option></select></label>
            <label>${text("破壊速度（km/s）", "Rupture speed (km/s)")}<input name="ruptureSpeed" type="number" min="0.5" max="4" step="0.1" required inputmode="decimal"></label>
          </div>
          <label>${text("地盤補正", "Ground correction")}<select name="groundCorrection"><option value="jshis-1km">${text("あり（J-SHIS・1kmメッシュ）", "On (J-SHIS, 1 km mesh)")}</option><option value="none">${text("なし（基盤上の参考値）", "Off (reference bedrock)")}</option></select></label>
          <p class="simulation-model-note"></p>
          <p data-simulation-published-magnitude></p>
          <p data-simulation-long-term-assessment hidden></p><a data-simulation-long-term-source target="_blank" rel="noopener noreferrer" hidden></a>
          <p class="simulation-reference-note" data-simulation-reference></p>
          <details class="simulation-public-scenario"><summary>${text("公的な想定震度分布", "Published scenario intensities")}</summary>
            <p>${text("対応する公表ケースのデータを読み込むと、その地点の想定震度を優先します。全割れ・東西の半割れ、規模・深さ・破壊開始位置が異なるデータは流用しません。", "Load data for the matching published scenario to prioritize its surface intensities. Full and half ruptures, magnitude, depth and rupture origin must match.")}</p>
            <label>${text("想定データを読み込む（JSON）", "Load scenario data (JSON)")}<input type="file" accept=".json,application/json" data-simulation-scenario-file></label>
            <button class="simulation-secondary" type="button" data-simulation-scenario-clear>${text("想定データを解除", "Clear scenario data")}</button>
            <p class="simulation-reference-note" data-simulation-scenario-status role="status"></p>
            <a data-simulation-scenario-source target="_blank" rel="noopener noreferrer" hidden></a>
          </details>
          <p class="simulation-reference-note">${text("模擬EEWのM・深さ・予想最大震度は観測の増加に応じて更新され、推定の安定を確認して最終報になります。観測点は現在の揺れを表示し、ピーク後は徐々に弱まります。記録最大は地点をタップすると確認できます。", "Simulated EEW estimates of magnitude, depth and maximum intensity update as observations arrive. A final bulletin follows a period of stable estimates. Station markers show current shaking, which fades after its peak. Tap a station to see its recorded maximum.")}</p>
          <details><summary>${text("計算モデル・出典", "Model and sources")}</summary><p>${text("観測点の位置は実データですが、揺れは計算値です。地盤補正ありでは、WE-SimulatorがJ-SHISを加工した1kmメッシュの速度増幅率を使います。欠測地点は補正なしです。津波・建物・地盤の非線形性は計算しません。", "Station locations are real; shaking is simulated. Ground correction uses velocity amplification from J-SHIS aggregated to 1 km meshes by WE-Simulator. Missing sites remain uncorrected. Tsunami, buildings and nonlinear soil effects are not modeled.")}</p><p>WE-Simulator · JMA2001 · ${text("司・翠川(1999)式（Mw8.3上限）", "Si & Midorikawa (1999), capped at Mw8.3")}</p><a href="https://github.com/itachi-kun-itc/WE-Simulator" target="_blank" rel="noopener noreferrer">WE-Simulator ↗</a><br><a href="https://www.j-shis.bosai.go.jp/faq-siteamp-and-shakiness" target="_blank" rel="noopener noreferrer">${text("地盤データ：J-SHIS（防災科研）、若松・松岡(2020)ほか", "Ground data: J-SHIS (NIED), Wakamatsu & Matsuoka (2020) et al.")} ↗</a></details>
          <p class="simulation-form-status" role="status"></p>
          <button class="simulation-secondary" type="button" data-simulation-without-ground hidden>${text("地盤補正なしで再試行", "Retry without ground correction")}</button>
          <button class="simulation-start" type="submit">${text("シミュレーション開始", "Start simulation")}</button>
          <aside class="simulation-recommendation">
            <p>${text("もっと地震シミュレーションを試したい方には、WE-Simulatorをおすすめします。", "For more earthquake simulation options, try WE-Simulator.")}</p>
            <a href="https://itachi-kun-itc.github.io/WE-Simulator/" target="_blank" rel="noopener noreferrer">${text("WE-Simulatorを開く（別タブ）", "Open WE-Simulator (new tab)")} ↗</a>
          </aside>
        </form>`;
    const values = lastValues ?? { ...core.getSimulationPresetOptions("point"), groundCorrection: "jshis-1km" };
    selectedFault = values.activeFault ?? selectedFault;
    selectedCaseId = selectedFault ? core.activeFaultCaseId(selectedFault) : selectedCaseId;
    for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value;
    updateModelFields();
    modal.querySelector("form").addEventListener("submit", event => { event.preventDefault(); void start(); });
    field("model").addEventListener("change", () => {
      const model = field("model").value;
      const values = { ...core.getSimulationPresetOptions(model === "active-fault" ? "point" : model), model, groundCorrection: field("groundCorrection").value };
      for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value;
      if (model === "active-fault" && selectedFault) applyActiveFault(selectedFault);
      updateModelFields();
    });
    field("nankaiCase").addEventListener("change", () => {
      const values = { ...core.getSimulationPresetOptions(field("model").value, field("nankaiCase").value), groundCorrection: field("groundCorrection").value };
      for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value;
      updateModelFields();
    });
    field("groundCorrection").addEventListener("change", updateModelFields);
    field("depthKm").addEventListener("input", updateModelFields);
    for (const name of ["magnitudeBasis", "assessmentCase"]) field(name).addEventListener("change", () => {
      const assessment = getFaultAssessment(selectedFault?.LTENAME ?? "");
      const row = assessment.rows.find(row => faultAssessmentCaseId(row) === field("assessmentCase").value);
      field("magnitude").value = field("magnitudeBasis").value === "herp-M"
        ? publishedMagnitudeDefault(row?.magnitude) ?? ""
        : selectedFault ? core.buildActiveFaultPreset(selectedFault).magnitudeValue ?? "" : "";
      updateModelFields();
    });
    field("assessmentMagnitude").addEventListener("change",()=>{
      field("magnitude").value=field("assessmentMagnitude").value;
      updateModelFields();
    });
    field("faultSearch").addEventListener("input", renderFaultChoices);
    field("activeFaultId").addEventListener("change", () => {
      selectedCaseId=field("activeFaultId").value;
      selectedFault=null;
      if(selectedCaseId) void loadSelectedFault(selectedCaseId); else updateModelFields();
    });
    modal.querySelector("[data-active-fault-retry]").addEventListener("click", () => {
      if(selectedCaseId && !selectedFault?.planes) void loadSelectedFault(selectedCaseId); else void loadFaultChoices();
    });
    modal.querySelector("[data-simulation-scenario-file]").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      scenarioIntensity = null;
      try {
        if (file.size > 16 * 1024 * 1024) throw new Error("Scenario too large");
        scenarioIntensity = core.validatePublicScenarioData(JSON.parse(await file.text()));
        updateScenarioStatus();
      } catch {
        updateScenarioStatus();
        modal.querySelector("[data-simulation-scenario-status]").textContent = text("想定データを読み込めません。出典・ケース条件・地表震度の形式を確認してください。", "Could not read scenario data. Check provenance, case conditions and surface-intensity format.");
      }
      event.target.value = "";
    });
    modal.querySelector("[data-simulation-scenario-clear]").addEventListener("click", () => {scenarioIntensity = null; updateScenarioStatus();});
    modal.querySelector("form").addEventListener("input", updateScenarioStatus);
    modal.querySelector("[data-simulation-without-ground]").addEventListener("click", () => {
      field("groundCorrection").value = "none";
      updateModelFields();
      void start();
    });
  }

  function updateScenarioStatus() {
    const status = modal.querySelector("[data-simulation-scenario-status]");
    if (!status) return;
    const link = modal.querySelector("[data-simulation-scenario-source]");
    link.hidden = !scenarioIntensity;
    modal.querySelector("[data-simulation-scenario-clear]").disabled = !scenarioIntensity;
    if (!scenarioIntensity) {status.textContent = text("公的想定データ未読込：震度は近似計算です。", "No published scenario data loaded: intensities use an approximation."); return;}
    let matches = false;
    try {matches = core.scenarioMatchesOptions(scenarioIntensity, core.normalizeSimulationOptions(readForm()));} catch {}
    status.textContent = `${scenarioIntensity.caseLabel} · ${scenarioIntensity.source.published} · ${matches
      ? text("条件一致：公的値を優先し、不足地点のみ近似計算します。地盤補正は重ねません。", "Matching conditions: prioritize published values; approximate missing sites. No duplicate ground amplification.")
      : text("条件不一致：適用しません。全割れ・半割れ等の公表条件を確認してください。", "Conditions differ: data will not apply. Check the published rupture case and other settings.")}`;
    link.href = scenarioIntensity.source.url;
    link.textContent = `${text("読み込んだデータの出典", "Imported data source")}: ${scenarioIntensity.source.title} ↗`;
  }

  function readForm() {
    const values = Object.fromEntries(["model", "nankaiCase", "latitude", "longitude", "magnitude", "depthKm", "ruptureOrigin", "ruptureSpeed", "groundCorrection"].map(name => [name, field(name)?.value]));
    return values.model === "active-fault" ? {...values, activeFault: selectedFault,
      magnitudeBasis: field("magnitudeBasis").value, assessmentCase: field("assessmentCase").value} : values;
  }

  function applyActiveFault(fault) {
    const preset = core.buildActiveFaultPreset(fault);
    selectedFault = preset.fault;
    for (const name of ["longitude", "latitude", "depthKm"]) field(name).value = preset[name];
    field("magnitude").value = preset.magnitudeValue ?? "";
    field("ruptureOrigin").value = "center";
    delete field("assessmentCase").dataset.faultCase;
  }

  function updateMagnitudeFields(assessment) {
    const active = field("model").value === "active-fault";
    const select = field("assessmentCase");
    if (active && select.dataset.faultCase !== selectedCaseId) {
      const restored = lastValues?.model === "active-fault" && lastValues.activeFault
        && core.activeFaultCaseId(lastValues.activeFault) === selectedCaseId ? lastValues : null;
      select.replaceChildren(new Option(text("公表ケースを選択してください", "Select a published case"), ""));
      for (const row of assessment.rows) {
        const option = new Option(`${row.caseName || row.name} · M${row.magnitude}`, faultAssessmentCaseId(row));
        option.disabled = !publishedMagnitudeBounds(row.magnitude);
        select.add(option);
      }
      field("magnitudeBasis").value = restored?.magnitudeBasis ?? "herp-M";
      select.value = restored?.assessmentCase ?? (assessment.matching ? faultAssessmentCaseId(assessment.matching) : "");
      select.dataset.faultCase = selectedCaseId;
      if (field("magnitudeBasis").value === "herp-M") {
        const row = assessment.rows.find(row => faultAssessmentCaseId(row) === select.value);
        field("magnitude").value = restored?.magnitudeBasis === "herp-M" && row
          ? restored.magnitude : publishedMagnitudeDefault(row?.magnitude) ?? "";
      }
    }
    const published = active && field("magnitudeBasis").value === "herp-M";
    const row = published ? assessment.rows.find(row => faultAssessmentCaseId(row) === select.value) : null;
    const bounds = row && publishedMagnitudeBounds(row.magnitude);
    select.disabled = !published;
    select.required = published;
    modal.querySelector("[data-assessment-case-label]").hidden = !published;
    const rangeSelect=field("assessmentMagnitude"),range=published&&bounds?.value===null;
    modal.querySelector("[data-assessment-value-label]").hidden=!range;
    const defaultNote=modal.querySelector("[data-assessment-default-note]");
    defaultNote.hidden=!range;
    if(range)defaultNote.textContent=text(`参考初期値はM${publishedMagnitudeDefault(row.magnitude).toFixed(1)}です（MeteoScope設定）。公表範囲の中央、または記載された境界値を使い、選択欄で変更できます。`,
      `Reference initial value: M${publishedMagnitudeDefault(row.magnitude).toFixed(1)} (set by MeteoScope). Uses the published range midpoint or stated bound; change it in the selector.`);
    rangeSelect.disabled=!range;rangeSelect.required=range;
    if(range){
      rangeSelect.replaceChildren(new Option(text("Mを選択してください", "Select M"),""));
      for(let tenth=Math.ceil(bounds.min*10);tenth<=Math.floor(bounds.max*10);tenth++)rangeSelect.add(new Option((tenth/10).toFixed(1),String(tenth/10)));
      rangeSelect.value=field("magnitude").value;
    }
    field("magnitude").readOnly = published && Boolean(bounds);
    field("magnitude").min = bounds?.min ?? 1;
    field("magnitude").max = bounds?.max ?? 9.5;
    const label = published ? text("公表M（近似計算）", "Published M (approximation)") : text("計算用Mw", "Calculation Mw");
    modal.querySelector("[data-magnitude-label]").textContent = label;
    field("magnitude").setAttribute("aria-label", published ? label : text("マグニチュード Mw", "Moment magnitude Mw"));
    modal.querySelector("[data-magnitude-basis-note]").textContent = published
      ? text("公表Mと同じ数値をMw前提の計算式へ与える学習用の感度試算です。MからMwへの換算でも、公的な想定震度の再現でもありません。活動区間が一致しない場合は形状との対応も未確認です。Mに幅・上限・下限がある場合は候補から選んでください。開いた境界での候補の端は計算上の入力限界（1～9.5）で、公的な上限・下限ではありません。", "Educational sensitivity run: the published M number is supplied to an Mw-based equation. This is neither M-to-Mw conversion nor an official intensity assessment. Geometry may not match the assessment section. Select an explicit value for a range or bound. Open bounds use the simulation limits (1–9.5), not additional official limits.")
      : text("計算用Mwを使用します。公表MをMwと同じ値とは扱いません。", "Uses calculation Mw; published M is not treated as an equivalent Mw.");
  }

  function renderFaultChoices() {
    const select = field("activeFaultId");
    if (!select) return;
    const query = field("faultSearch").value.normalize("NFKC").toLocaleLowerCase();
    const models=core.groupActiveFaultModels(faultCatalog).map(model=>model.plane);
    const matches = models.filter(fault => fault.LTENAME.normalize("NFKC").toLocaleLowerCase().includes(query));
    select.replaceChildren(new Option(text("活断層を選択してください", "Select a fault"), ""));
    const choices = [...matches];
    const selected=selectedFault??models.find(fault=>core.activeFaultCaseId(fault)===selectedCaseId);
    if (selected && !choices.some(fault => core.activeFaultCaseId(fault)===selectedCaseId)) choices.unshift(selected);
    for (const fault of choices) {
      select.add(new Option(fault.LTENAME,core.activeFaultCaseId(fault)));
    }
    select.value = selectedCaseId;
    if (faultCatalog.length) modal.querySelector("[data-active-fault-status]").textContent = text(`${matches.length}/${models.length}活動ケース（一覧は2022年版）`, `${matches.length}/${models.length} activity cases (2022 index)`);
  }

  async function loadSelectedFault(id) {
    faultModelController?.abort();
    const controller=new AbortController();faultModelController=controller;faultModelLoading=true;
    selectedFault=null;
    modal.querySelector("[data-active-model-status]").textContent=text("2024年版の全断層面を確認中…", "Checking the complete 2024 fault model…");
    updateModelFields();
    try {
      const {loadActiveFaultModel}=await import("../simulation/activeFaultCatalog.js");
      const fault=await loadActiveFaultModel(id,{signal:controller.signal});
      if(controller.signal.aborted||modal.hidden||selectedCaseId!==id)return;
      applyActiveFault(fault);
      modal.querySelector("[data-active-model-status]").textContent=text(`2024年版・${fault.planes.length}断層面（全件確認済み）`, `2024 model: all ${fault.planes.length} planes verified`);
      modal.querySelector("[data-active-fault-retry]").hidden=true;
    } catch {
      if(controller.signal.aborted)return;
      modal.querySelector("[data-active-model-status]").textContent=text("全断層面を確認できません。再読み込みしてください。単一面には切り替えません。", "Complete model unavailable. Reload to retry; no single-plane fallback.");
      modal.querySelector("[data-active-fault-retry]").hidden=false;
    } finally {
      if(faultModelController===controller){faultModelController=null;faultModelLoading=false;updateModelFields();}
    }
  }

  async function loadFaultChoices() {
    if (faultCatalogController || !field("activeFaultId")) return;
    if (faultCatalog.length) { renderFaultChoices(); return; }
    const controller = new AbortController(); faultCatalogController = controller;
    modal.querySelector("[data-active-fault-status]").textContent = text("活断層一覧を読み込み中…", "Loading active faults…");
    modal.querySelector("[data-active-fault-retry]").hidden = true;
    try {
      const {loadActiveFaultCatalog} = await import("../simulation/activeFaultCatalog.js");
      const faults = await loadActiveFaultCatalog({signal: controller.signal});
      if (controller.signal.aborted || modal.hidden) return;
      faultCatalog = faults; renderFaultChoices();
    } catch (error) {
      if (controller.signal.aborted || modal.hidden) return;
      console.warn("[MeteoScope] active-fault catalogue unavailable",error);
      modal.querySelector("[data-active-fault-status]").textContent = text("活断層一覧を取得できませんでした。再読み込みしてください。", "Could not load active faults. Reload to retry.");
      modal.querySelector("[data-active-fault-retry]").hidden = false;
    } finally { if (faultCatalogController === controller) faultCatalogController = null; }
  }

  function updateModelFields() {
    const activeFault = field("model").value === "active-fault";
    const preset = core.FAULT_MODEL_PRESETS[field("model").value] || activeFault;
    modal.querySelector(".simulation-active-fault").hidden = !activeFault;
    field("activeFaultId").required = activeFault;
    if (activeFault) {
      renderFaultChoices(); void loadFaultChoices();
      modal.querySelector("[data-active-fault-description]").textContent = selectedFault
        ? `${selectedFault.LTENAME} · ${selectedFault.MAG < 0 ? text(`2024年版モデルのMw ${-selectedFault.MAG}`, `2024 model Mw ${-selectedFault.MAG}`) : selectedFault.MAG > 0 ? text(`2024年版モデルのMj ${selectedFault.MAG}。計算用Mwは未確認です。`, `2024 model Mj ${selectedFault.MAG}; calculation Mw unavailable.`) : text("モデルのMwは未確認です。", "Model Mw unavailable.")}` : "";
      const name=selectedFault?.LTENAME??faultCatalog.find(fault=>core.activeFaultCaseId(fault)===selectedCaseId)?.LTENAME??"";
      const assessment=getFaultAssessment(name);
      updateMagnitudeFields(assessment);
      const published=modal.querySelector("[data-active-assessment]");
      published.textContent=assessment.rows.length
        ? text(`公表M（地震調査委員会、${assessment.checkedAt}確認）：${assessment.rows.map(row=>`${row.caseName||row.name} M${row.magnitude}`).join(" ／ ")}。${assessment.exact?"活動区間の名称一致。計算モデルと同じ評価年・形状を保証しません。":"断層帯の評価一覧です。選択モデルとの活動区間の一致は未確認です。"}`, `Published M (HERP; checked ${assessment.checkedAt}): ${assessment.rows.map(row=>`${row.caseName||row.name} M${row.magnitude}`).join(" / ")}. Activity sections and the 2024 calculation model may differ.`)
        : text("最新の公表Mと活動区間は未照合です。モデルのMwを最新評価のMとは表示しません。", "Latest published M and activity section not matched. Model Mw is not presented as the latest assessment M.");
      const link=modal.querySelector("[data-active-assessment-link]");
      link.hidden=false;link.href=assessment.sourceUrl;link.textContent=text("地震調査委員会の評価を確認 ↗", "Check HERP assessment ↗");
      const modelLink=modal.querySelector("[data-active-model-source]");
      modelLink.hidden=!selectedFault?.planes;
      if(selectedFault?.planes)modelLink.href=`https://www.j-shis.bosai.go.jp/map/api/pshm/Y2024/MAX/${selectedCaseId}/fltinfo.geojson?epsg=4326&lang=ja`;
    } else {
      faultCatalogController?.abort(); faultCatalogController = null;
      faultModelController?.abort();faultModelController=null;faultModelLoading=false;
      updateMagnitudeFields({rows: []});
    }
    const deepApproximation = Number(field("depthKm").value) > core.MAX_REFERENCE_INTENSITY_DEPTH_KM;
    modal.querySelector("[data-simulation-deep-warning]").hidden = !deepApproximation;
    modal.querySelector(".simulation-nankai-case").hidden = field("model").value !== "nankai-trough";
    modal.querySelector(".simulation-coordinate-fields").hidden = Boolean(preset);
    field("latitude").disabled = Boolean(preset);
    field("longitude").disabled = Boolean(preset);
    modal.querySelector("[data-simulation-pick]").hidden = Boolean(preset);
    modal.querySelector(".simulation-fault-fields").hidden = !preset;
    modal.querySelector(".simulation-model-note").textContent = activeFault
      ? text("深さの初期値は各断層面中央の面積加重平均（km単位に丸め）。規模は地震モデル全体に一度だけ適用します。最新評価の区分を再現するものではありません。", "Initial depth is the area-weighted plane-center depth, rounded to km. Magnitude applies once to the entire earthquake model. Revised assessment sections are not reproduced.") : preset
      ? text("想定震源域を選択中です。規模・深さ・破壊開始位置を変更できます。", "Using a preset source region. Magnitude, depth and rupture origin can be changed.")
      : text("地図で選択するか、緯度・経度を入力してください。", "Choose a point on the map or enter coordinates.");
    modal.querySelector("[data-simulation-reference]").textContent = deepApproximation
      ? text("深発近似（学習用・日本周辺）：増幅に使う深さを150kmで制限し、実際の震源距離と海溝からの距離で計算します。異常震域の正確な再現や590km付近の精度は保証できません。P/S波には入力した深さを使います。", "Educational deep approximation for Japan: amplification depth is capped at 150 km; actual source distance and distance to trenches are retained. Anomalous intensity patterns and accuracy near 590 km are not guaranteed. P/S waves use the entered depth.")
      : field("groundCorrection").value !== "none"
      ? text("初回は外部の地盤データ（約16MB）を取得します。補正後も参考値で、公的な想定震度分布の再現ではありません。", "The first use downloads external ground data (about 16 MB). Corrected intensities remain reference values, not official hazard maps.")
      : text("震度は地盤補正なしの参考値です。公的な想定震度分布の再現ではありません。", "Intensities are reference values without local ground corrections, not official hazard maps.");
    updateScenarioStatus();
    const seaPreset=activeFault?null:core.getFaultModelPreset({model:field("model").value,nankaiCase:field("nankaiCase").value});
    modal.querySelector("[data-simulation-published-magnitude]").textContent=seaPreset?.magnitudeContext
      ? text(seaPreset.magnitudeContext,seaPreset.magnitudeContextEn) : "";
    const nankai=field("model").value==="nankai-trough",longTerm=core.NANKAI_LONG_TERM_ASSESSMENT;
    const longTermNote=modal.querySelector("[data-simulation-long-term-assessment]"),longTermLink=modal.querySelector("[data-simulation-long-term-source]");
    longTermNote.hidden=longTermLink.hidden=!nankai;
    if(nankai){
      longTermNote.textContent=text(`地震調査委員会の長期評価：${longTerm.magnitude}（${longTerm.checkedAt}確認）。全割れ・東西半割れ別の単一Mを示すものではありません。内閣府の強震用・津波用Mwとは区別します。`,
        `HERP long-term assessment: M8–M9 class (checked ${longTerm.checkedAt}). This is not a single magnitude assigned separately to full/eastern/western ruptures. It is distinct from Cabinet Office strong-motion/tsunami Mw.`);
      longTermLink.href=longTerm.sourceUrl;longTermLink.textContent=text("地震調査委員会の南海トラフ評価 ↗", "HERP Nankai assessment ↗");
    }
    modal.querySelector(".simulation-start").disabled=activeFault&&(!selectedFault?.planes||faultModelLoading);
  }

  async function open({fault} = {}) {
    getMap()?.cancelSimulationEpicenterPick();
    picking = false;
    showNotice("");
    player?.pause();
    lastFocused = document.activeElement;
    updateModalLabels();
    if (!core) modalBody.innerHTML = `<p class="simulation-loading" role="status">${text("計算モデルを読み込み中…", "Loading the simulation model…")}</p>`;
    button.setAttribute("aria-expanded", "true");
    modal.hidden = false;
    document.body.classList.add("modal-open");
    try {
      core ??= await import("../simulation/earthquakeSimulation.js");
      if (modal.hidden) return;
      if (fault) {
        const preset = core.buildActiveFaultPreset(fault);
        selectedFault = preset.fault;
        lastValues = {...core.SIMULATION_DEFAULTS, model: "active-fault", activeFault: selectedFault,
          longitude: preset.longitude, latitude: preset.latitude, depthKm: preset.depthKm, magnitude: preset.magnitudeValue ?? "", groundCorrection: lastValues?.groundCorrection ?? "jshis-1km"};
      }
      renderForm();
      if(field("model").value==="active-fault" && selectedCaseId && !selectedFault?.planes) void loadSelectedFault(selectedCaseId);
      modal.querySelector("[data-simulation-close]")?.focus({ preventScroll: true });
    } catch (error) {
      console.warn("[MeteoScope] simulation settings unavailable", error);
      close();
      showNotice(text("計算モデルを読み込めませんでした。ボタンから再試行してください。", "Could not load the model. Open simulation to retry."));
    }
  }

  function close({ preservePreparation = false, returnFocus = true } = {}) {
    faultCatalogController?.abort(); faultCatalogController = null;
    faultModelController?.abort();faultModelController=null;faultModelLoading=false;
    if (!preservePreparation && preparation) stop();
    if (field("model") && !preservePreparation) lastValues = readForm();
    modal.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
    if (returnFocus) lastFocused?.focus?.({ preventScroll: true });
  }

  function setPlaybackMinimized(minimized, focus = true) {
    playbackMinimized = minimized;
    playback.classList.toggle("is-minimized", minimized);
    playback.querySelector("#simulation-playback-content").hidden = minimized;
    playback.querySelector(".simulation-playback-minimized").hidden = !minimized;
    const restore = playback.querySelector("[data-simulation-restore]");
    if (minimized) {
      playback.querySelector("#simulation-playback-options").hidden = true;
      playback.querySelector("[data-simulation-options]").setAttribute("aria-expanded", "false");
    }
    if (focus) (minimized ? restore : playback.querySelector("[data-simulation-minimize]")).focus({ preventScroll: true });
  }

  function togglePlayback() {
    if (!player) return;
    const state = player.snapshot();
    if (state.running) player.pause();
    else { if (state.completed) player.seek(0); player.play(); }
  }

  function renderPlayback() {
    const publishedM = lastValues?.magnitudeBasis === "herp-M";
    playback.innerHTML = `<div class="simulation-playback-minimized" hidden><button type="button" data-simulation-pause></button><button type="button" data-simulation-restore aria-label="${text("シミュレーションの再生パネルを戻す", "Restore simulation playback panel")}" aria-controls="simulation-playback-content"><strong>${text("シミュレーション", "Simulation")}</strong><span><output data-simulation-time aria-label="${text("経過時間", "Elapsed time")}"></output> ‹</span></button></div>
      <div id="simulation-playback-content"><header><strong>${text("シミュレーション", "Simulation")}</strong><span>${publishedM ? text("公表Mによる近似・実際の地震ではありません", "Published-M approximation; not a real earthquake") : text("実際の地震ではありません", "Not a real earthquake")}</span><button type="button" data-simulation-first-report aria-label="${text("初報まで進む", "Skip to first bulletin")}" hidden>${text("初報へ", "Skip wait")}</button><button type="button" data-simulation-options aria-expanded="false" aria-controls="simulation-playback-options">${text("操作", "More")}</button><button type="button" data-simulation-minimize aria-label="${text("再生パネルを最小化", "Minimize playback panel")}" title="${text("最小化", "Minimize")}">−</button></header>
      <div class="simulation-playback-controls"><button type="button" data-simulation-pause></button><input data-simulation-seek type="range" min="0" step="0.1" aria-label="${text("シミュレーション時刻", "Simulation time")}"><output data-simulation-time aria-label="${text("経過時間", "Elapsed time")}"></output><button type="button" data-simulation-stop aria-label="${text("終了", "End")}" title="${text("終了", "End")}">×</button></div>
      <p class="simulation-ground-coverage" data-simulation-interrupted hidden>${text("画面の中断により一時停止しました。再生ボタンで続きから再開できます。", "Playback paused after an interruption. Press Play to continue from here.")}</p>
      <div id="simulation-playback-options" hidden>
        <label class="simulation-display-label">${text("地図の自動調整", "Automatic map view")}<select data-simulation-camera><option value="manual">${text("手動", "Manual")}</option><option value="follow">${text("自動フォーカス・ズームアウト", "Auto focus / zoom out")}</option></select></label>
        <p class="simulation-ground-coverage">${text("揺れの広がりに合わせて表示範囲を広げます。手動で地図を動かすと解除します。", "The view expands as shaking spreads. Moving the map manually turns this off.")}</p>
        <label class="simulation-display-label">${text("観測点の表示", "Station display")}<select data-simulation-display><option value="current">${text("現在の揺れ", "Current shaking")}</option><option value="maximum">${text("記録最大", "Recorded maximum")}</option></select></label>
        <div class="simulation-playback-meta"><span data-simulation-name></span><span><i class="simulation-p-wave"></i>${text("P波", "P wave")} <i class="simulation-s-wave"></i>${text("S波", "S wave")}</span></div>
        ${lastValues?.depthKm > core.MAX_REFERENCE_INTENSITY_DEPTH_KM ? `<p class="simulation-ground-coverage">${intensityEstimateAvailable ? text("深発近似（学習用）：異常震域は海溝距離からの概算で、実際の分布を保証しません。", "Educational deep approximation: anomalous intensity is approximated from trench distance; actual distributions are not guaranteed.") : text("深発近似データ未取得：震度推定なし", "Deep approximation unavailable: intensity not estimated")}</p>` : ""}
        <p class="simulation-ground-coverage">${intensityEstimateAvailable && lastValues?.groundCorrection !== "none" && groundCoverage ? text(`地盤補正：${groundCoverage.corrected}/${groundCoverage.total}地点（1kmメッシュ・欠測は補正なし）`, `Ground correction: ${groundCoverage.corrected}/${groundCoverage.total} sites (1 km; missing sites uncorrected)`) : text("地盤補正なし", "Without ground correction")}</p>
        <p class="simulation-ground-coverage">${offshoreDetectionCount ? text(`検知：陸上＋海底観測点${offshoreDetectionCount}地点（S-net・DONET・N-net）`, `Detection: land stations + ${offshoreDetectionCount} offshore sites (S-net, DONET, N-net)`) : text("検知：陸上のみ（海底観測点データ未取得）", "Detection: land stations only (offshore catalogue unavailable)")}</p>
        <p class="simulation-ground-coverage">${firstReportElapsedSec == null ? text("初報：検知条件を満たす観測点なし", "First bulletin: no qualifying detection") : text(`初報：発生から${firstReportElapsedSec.toFixed(1)}秒（模擬時刻）`, `First bulletin: ${firstReportElapsedSec.toFixed(1)} s after origin (simulation time)`)}</p>
        <p class="simulation-ground-coverage" data-simulation-analysis-status></p>
        <p class="simulation-ground-coverage" data-simulation-scenario-coverage></p>
        <a data-simulation-playback-source target="_blank" rel="noopener noreferrer" hidden></a>
        <div class="simulation-playback-actions"><select data-simulation-speed aria-label="${text("再生速度", "Playback speed")}"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="5">5×</option></select><button type="button" data-simulation-focus>${text("震源を表示", "Show source")}</button><button type="button" data-simulation-overview aria-label="${text("ズームアウトして全体表示", "Zoom out to overview")}">${text("全体表示", "Overview")}</button><button type="button" data-simulation-settings>${text("設定", "Settings")}</button></div>
      </div></div>`;
    playback.querySelector("[data-simulation-minimize]").addEventListener("click", () => setPlaybackMinimized(true));
    playback.querySelector("[data-simulation-restore]").addEventListener("click", () => setPlaybackMinimized(false));
    setPlaybackMinimized(playbackMinimized, false);
    playback.querySelector("[data-simulation-first-report]").addEventListener("click", () => {
      if (player && firstReportElapsedSec != null && player.snapshot().elapsed < firstReportElapsedSec) {
        player.seek(firstReportElapsedSec);
        playback.querySelector("[data-simulation-seek]").focus({ preventScroll: true });
      }
    });
    playback.querySelector("[data-simulation-options]").addEventListener("click", event => {
      const options = playback.querySelector("#simulation-playback-options");
      options.hidden = !options.hidden;
      event.currentTarget.setAttribute("aria-expanded", String(!options.hidden));
    });
    for (const pause of playback.querySelectorAll("[data-simulation-pause]")) pause.addEventListener("click", togglePlayback);
    playback.querySelector("[data-simulation-speed]").addEventListener("change", event => player?.setSpeed(event.target.value));
    playback.querySelector("[data-simulation-display]").value = intensityDisplay;
    playback.querySelector("header > strong").textContent = intensityDisplay === "maximum" ? text("シミュレーション · 記録最大", "Simulation · Recorded max.") : text("シミュレーション", "Simulation");
    playback.querySelector("[data-simulation-display]").addEventListener("change", event => {
      intensityDisplay = event.target.value;
      playback.querySelector("header > strong").textContent = intensityDisplay === "maximum" ? text("シミュレーション · 記録最大", "Simulation · Recorded max.") : text("シミュレーション", "Simulation");
      if (player) player.seek(player.snapshot().elapsed);
    });
    playback.querySelector("[data-simulation-seek]").addEventListener("input", event => player?.seek(event.target.value));
    playback.querySelector("[data-simulation-settings]").addEventListener("click", () => void open());
    playback.querySelector("[data-simulation-stop]").addEventListener("click", () => stop());
    playback.querySelector("[data-simulation-camera]").value = camera.following ? "follow" : "manual";
    playback.querySelector("[data-simulation-camera]").addEventListener("change", event => event.target.value === "follow" ? camera.follow(lastFrame) : camera.stopFollowing());
    playback.querySelector("[data-simulation-focus]").addEventListener("click", () => camera.showSource());
    playback.querySelector("[data-simulation-overview]").addEventListener("click", () => camera.showOverview());
    if (lastValues) {
      const variant = lastValues.model === "nankai-trough" ? ({ full: text("全割れ", "Full"), east: text("半割れ・東側", "Eastern half"), west: text("半割れ・西側", "Western half") })[lastValues.nankaiCase] : "";
      playback.querySelector("[data-simulation-name]").textContent = `${text("設定", "Source")}: ${lastValues.model === "active-fault" ? lastValues.activeFault.LTENAME : modelNames().find(([id]) => id === lastValues.model)?.[1]}${variant ? ` (${variant})` : ""} · ${publishedM ? "M" : "Mw"}${Number(lastValues.magnitude).toFixed(1)} / ${lastValues.depthKm} km${publishedM ? ` · ${lastValues.magnitudeSource.caseName || lastValues.magnitudeSource.name} (${text("公表Mの近似", "published-M approximation")})` : ""}`;
    }
    const coverage = playback.querySelector("[data-simulation-scenario-coverage]");
    const sourceLink = playback.querySelector("[data-simulation-playback-source]");
    if (scenarioCoverage?.applied) {
      coverage.textContent = text(`公表想定：${scenarioCoverage.caseLabel} · ${scenarioCoverage.applied}/${scenarioCoverage.total}地点。残りは近似計算。公的値に地盤補正は重ねません。`,
        `Published scenario: ${scenarioCoverage.caseLabel} · ${scenarioCoverage.applied}/${scenarioCoverage.total} sites; others approximated. Published values receive no additional ground amplification.`);
      sourceLink.hidden = false; sourceLink.href = scenarioCoverage.source.url;
      sourceLink.textContent = `${scenarioCoverage.source.title} (${scenarioCoverage.source.published}) ↗`;
    } else coverage.textContent = scenarioCoverage?.mismatch
      ? text("公的想定の条件不一致：全地点を近似計算しています。", "Scenario conditions differ: all sites use approximations.")
      : text("近似計算（公的想定分布の適用なし）", "Approximation (no published distribution applied)");
  }

  async function start() {
    if (!modal.querySelector("form").reportValidity()) return;
    const status = modal.querySelector(".simulation-form-status");
    if (isRealEvent()) { status.textContent = text("実際のEEWを表示中です。終了後に開始できます。", "A real EEW is active. Simulation can start after it ends."); return; }
    stop();
    if (!activate()) { status.textContent = text("地震タブの「最近の地震」を表示してから開始してください。", "Open Recent earthquakes before starting."); return; }
    const token = ++sequence;
    const controller = new AbortController();
    preparation = controller;
    const timeout = setTimeout(() => controller.abort(new Error("Simulation data timeout")), field("groundCorrection").value !== "none" ? 45000 : 15000);
    modal.querySelector(".simulation-start").disabled = true;
    modal.querySelector(".simulation-start").textContent = text("シミュレーション開始", "Start simulation");
    modal.querySelector("[data-simulation-without-ground]").hidden = true;
    status.textContent = text("観測点を読み込み、計算しています…", "Loading stations and calculating…");
    showNotice("");
    try {
      const options = core.normalizeSimulationOptions(readForm());
      const readJson = async url => {
        const response = await fetch(url, { signal: controller.signal, cache: "force-cache" });
        if (!response.ok) throw new Error(`Simulation data HTTP ${response.status}`);
        return response.json();
      };
      const needsGround = options.groundCorrection !== "none";
      if (needsGround) status.textContent = text("観測点・地盤データを読み込み、計算しています…", "Loading stations and ground data, then calculating…");
      const load = (resource, loader) => loadSimulationResource(resource, loader, controller.signal);
      const stationsPromise = load("stations", () => readJson(JMA_ENDPOINTS.earthquakeStations));
      const [stations, groundModel, epicenterRegions, forecastAreas, detectionStations, plateBoundaries] = await Promise.all([
        stationsPromise,
        needsGround ? load("ground", () => stationsPromise.then(stations => core.loadSimulationGroundModel({ signal: controller.signal, coordinates: Object.values(stations).map(station => [Number(station.longitude), Number(station.latitude)]) }))) : null,
        options.model === "point" ? readJson(JMA_ENDPOINTS.earthquakeEpicenterRegions).catch(error => { controller.signal.throwIfAborted(); console.warn("[MeteoScope] epicenter names unavailable", error); return null; }) : null,
        load("areas", () => readJson(JMA_ENDPOINTS.earthquakeAreas)),
        core.loadSimulationDetectionStations({ signal: controller.signal }).catch(error => { controller.signal.throwIfAborted(); console.warn("[MeteoScope] offshore detection catalogue unavailable", error); return []; }),
        options.depthKm > core.MAX_REFERENCE_INTENSITY_DEPTH_KM ? readJson(MAP_DATA_ENDPOINTS.tectonicPlateBoundaries).catch(error => { controller.signal.throwIfAborted(); console.warn("[MeteoScope] deep approximation geometry unavailable", error); return null; }) : null
      ]);
      const simulation = await core.prepareEarthquakeSimulation(options, stations, { signal: controller.signal, groundModel, epicenterRegions, forecastAreas, detectionStations, plateBoundaries, scenarioIntensity });
      const { createSimulationPlayer } = await import("../simulation/simulationPlayer.js");
      if (token !== sequence || isRealEvent()) return;
      preparation = null;
      lastValues = options;
      groundCoverage = simulation.groundCoverage;
      scenarioCoverage = simulation.scenarioCoverage;
      intensityEstimateAvailable = simulation.intensityEstimateAvailable;
      offshoreDetectionCount = simulation.detectionStationCount;
      firstReportElapsedSec = simulation.reports[0]?.elapsedSec ?? null;
      close({ preservePreparation: true, returnFocus: false });
      playbackMinimized = false;
      renderPlayback();
      playback.hidden = false;
      const seek = playback.querySelector("[data-simulation-seek]");
      seek.max = simulation.duration;
      let latestSummaryKey = "";
      player = createSimulationPlayer({ duration: simulation.duration, frameInterval: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 100, onFrame(state) {
        if (isRealEvent()) { stop(text("実際のEEWを受信したためシミュレーションを終了しました。", "Simulation ended because a real EEW was received.")); return; }
        lastFrame = simulation.frame(state.elapsed, { intensityDisplay, renderOnly: true });
        playback.querySelector("[data-simulation-interrupted]").hidden = !state.interrupted;
        const summaryKey = `${lastFrame.event.serial}|${lastFrame.event.isFinal}|${lastFrame.event.simulationDetecting}`;
        onFrame(lastFrame, { updateSummary: summaryKey !== latestSummaryKey });
        camera.update(lastFrame);
        if (summaryKey !== latestSummaryKey) {
          const event = lastFrame.event;
          const analysis = event.simulationAnalysisStatus === "stable" ? text("推定安定・最終報", "Stable estimate / final bulletin")
            : event.simulationAnalysisStatus === "incomplete" ? text("観測候補が不足・推定未収束", "Insufficient observations / analysis incomplete")
            : event.simulationAnalysisStatus === "confirming" ? text("安定を確認中", "Confirming stability") : text("推定を更新中", "Updating estimates");
          playback.querySelector("[data-simulation-analysis-status]").textContent = event.serial
            ? text(`解析用の模擬観測：P波${event.simulationObservationCount}地点 / S波${event.simulationSObservationCount}地点 · ${analysis}`,
              `Synthetic analysis observations: P ${event.simulationObservationCount} / S ${event.simulationSObservationCount} sites · ${analysis}`)
            : text("初報を待っています。", "Waiting for the first bulletin.");
        }
        latestSummaryKey = summaryKey;
        playback.querySelector("[data-simulation-seek]").value = state.elapsed;
        const timeLabel = `${Math.floor(state.elapsed)}/${Math.ceil(simulation.duration)} s`;
        for (const output of playback.querySelectorAll("[data-simulation-time]")) output.textContent = timeLabel;
        playback.querySelector("[data-simulation-first-report]").hidden = firstReportElapsedSec == null || state.elapsed >= firstReportElapsedSec;
        const pauseLabel = state.running ? text("一時停止", "Pause") : state.completed ? text("再生し直す", "Replay") : text("再生", "Play");
        for (const pause of playback.querySelectorAll("[data-simulation-pause]")) {
          pause.textContent = state.running ? "Ⅱ" : "▶";
          pause.setAttribute("aria-label", pauseLabel);
          pause.title = pauseLabel;
        }
      } });
      camera.setScene(simulation.sources, simulation.stations, lastValues.model === "point" ? 6.8 : 5.6);
      getMap()?.setSimulationCameraInteractionHandler(() => camera.stopFollowing());
      player.play();
      playback.querySelector(".simulation-playback-controls [data-simulation-pause]").focus({ preventScroll: true });
    } catch (error) {
      if (token !== sequence) return;
      const resource = error instanceof SimulationPreparationError ? ({ stations: text("観測点データ", "Station data"), ground: text("地盤データ", "Ground data"), areas: text("地域データ", "Region data") })[error.resource] : null;
      status.textContent = resource
        ? error.timedOut ? text(`${resource}の読み込みがタイムアウトしました。再試行してください。`, `${resource} loading timed out. Please retry.`)
          : text(`${resource}を読み込めませんでした。通信状態を確認して再試行してください。`, `Could not load ${resource.toLowerCase()}. Check the connection and retry.`)
        : text("計算できませんでした。入力値と通信状態を確認し、再試行してください。", "Could not calculate. Check the values and connection, then retry.");
      modal.querySelector("[data-simulation-without-ground]").hidden = error.resource !== "ground";
      modal.querySelector(".simulation-start").textContent = text("再試行", "Retry");
      controller.abort(error);
      console.warn("[MeteoScope] simulation preparation failed", error);
    } finally {
      clearTimeout(timeout);
      if (token === sequence) {
        preparation = null;
        const startButton = modal.querySelector(".simulation-start");
        if (startButton) startButton.disabled = false;
      }
    }
  }

  function stop(reason = "") {
    const hadWork = Boolean(player || preparation || lastFrame);
    sequence++;
    preparation?.abort(); preparation = null;
    player?.dispose(); player = null;
    lastFrame = null;
    camera.reset();
    getMap()?.setSimulationCameraInteractionHandler(null);
    playback.hidden = true;
    getMap()?.cancelSimulationEpicenterPick();
    picking = false;
    if (hadWork) onStop();
    const startButton = modal.querySelector(".simulation-start");
    if (startButton) startButton.disabled = false;
    showNotice(reason);
    if (reason && !modal.hidden) close();
  }

  button.addEventListener("click", () => void open());
  document.getElementById("locate-button")?.addEventListener("click", () => camera.stopFollowing());
  window.addEventListener("meteoscope-simulation-fault", event => void open({fault: event.detail}));
  modal.addEventListener("click", event => {
    if (event.target.closest("[data-simulation-close]")) close();
    if (!event.target.closest("[data-simulation-pick]")) return;
    lastValues = readForm();
    close({ returnFocus: false });
    picking = getMap()?.pickSimulationEpicenter(coordinates => {
      picking = false;
      lastValues = { ...lastValues, longitude: Number(coordinates[0].toFixed(4)), latitude: Number(coordinates[1].toFixed(4)) };
      showNotice("");
      void open();
    }) ?? false;
    showNotice(text("地図をタップして震源を選択（Escでキャンセル）", "Tap the map to select an epicenter (Esc to cancel)"));
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (picking) { getMap()?.cancelSimulationEpicenterPick(); picking = false; showNotice(""); void open(); }
      else if (!modal.hidden) close();
    }
    if (event.key === "Tab" && !modal.hidden) {
      const focusable = [...modal.querySelectorAll("button:not([disabled]), input, select, summary, a")].filter(el => el.getClientRects().length);
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  const suspend = () => {
    if (preparation) stop(text("準備を中断しました。再度開始してください。", "Preparation was interrupted. Start again to retry."));
    else player?.suspend();
    getMap()?.cancelSimulationEpicenterPick();
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });
  window.addEventListener("pagehide", suspend);
  window.addEventListener("meteoscope-language-change", () => {
    updateModalLabels();
    if (!modal.hidden && core && !preparation) { lastValues = readForm(); renderForm(); }
    if (player) { const state = player.snapshot(); player.pause(); renderPlayback(); playback.querySelector("[data-simulation-seek]").max = state.duration; playback.querySelector("[data-simulation-speed]").value = state.speed; player.seek(state.elapsed); }
  });
  return { stop, pause: () => player?.pause(), get active() { return Boolean(player || preparation || picking || !modal.hidden); } };
}
