import { JMA_ENDPOINTS } from "../config.js";
import { getCurrentLanguage } from "./locale.js";

const text = (ja, en) => getCurrentLanguage() === "en" ? en : ja;
const modelNames = () => [
  ["point", text("任意震源", "Custom epicenter")],
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
  let simulationCoordinates = [];
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
          <label>${text("震源モデル", "Source model")}<select name="model">${modelNames().map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label class="simulation-nankai-case" hidden>${text("南海トラフの破壊ケース", "Nankai rupture case")}<select name="nankaiCase"><option value="full">${text("全割れ", "Full rupture")}</option><option value="east">${text("半割れ・東側", "Eastern half")}</option><option value="west">${text("半割れ・西側", "Western half")}</option></select></label>
          <div class="simulation-coordinate-fields simulation-fields">
            <label>${text("緯度", "Latitude")}<input name="latitude" type="number" min="-85" max="85" step="0.0001" required inputmode="decimal"></label>
            <label>${text("経度", "Longitude")}<input name="longitude" type="number" min="-180" max="180" step="0.0001" required inputmode="decimal"></label>
          </div>
          <button class="simulation-secondary" type="button" data-simulation-pick>${text("地図で震源を選ぶ", "Choose epicenter on map")}</button>
          <div class="simulation-fields">
            <label>${text("マグニチュード Mw", "Moment magnitude Mw")}<input name="magnitude" type="number" min="1" max="9.5" step="0.1" required inputmode="decimal"></label>
            <label>${text("深さ（km）", "Depth (km)")}<input name="depthKm" type="number" min="0" max="700" step="1" required inputmode="numeric"></label>
          </div>
          <div class="simulation-fault-fields simulation-fields" hidden>
            <label>${text("破壊開始位置", "Rupture origin")}<select name="ruptureOrigin"><option value="center">${text("中央", "Center")}</option><option value="start">${text("始点側", "Start")}</option><option value="end">${text("終点側", "End")}</option></select></label>
            <label>${text("破壊速度（km/s）", "Rupture speed (km/s)")}<input name="ruptureSpeed" type="number" min="0.5" max="4" step="0.1" required inputmode="decimal"></label>
          </div>
          <p class="simulation-model-note"></p>
          <p class="simulation-reference-note">${text("震度は地盤補正なしの参考値です。公的な想定震度分布の再現ではありません。", "Intensities are reference values without local ground corrections, not a reproduction of official hazard maps.")}</p>
          <details><summary>${text("計算モデル・出典", "Model and sources")}</summary><p>${text("観測点の位置は実データですが、揺れは計算値です。地盤差・津波は計算しません。想定震源域はWE-Simulatorの近似です。", "Station locations are real; shaking is simulated. Local ground effects and tsunami are not modeled. Source regions are WE-Simulator approximations.")}</p><p>WE-Simulator · JMA2001 · ${text("司・翠川(1999)式（Mw8.3上限）", "Si & Midorikawa (1999), capped at Mw8.3")}</p><a href="https://github.com/itachi-kun-itc/WE-Simulator" target="_blank" rel="noopener noreferrer">WE-Simulator ↗</a></details>
          <p class="simulation-form-status" role="status"></p>
          <button class="simulation-start" type="submit">${text("シミュレーション開始", "Start simulation")}</button>
          <aside class="simulation-recommendation">
            <p>${text("もっと地震シミュレーションを試したい方には、WE-Simulatorをおすすめします。", "For more earthquake simulation options, try WE-Simulator.")}</p>
            <a href="https://itachi-kun-itc.github.io/WE-Simulator/" target="_blank" rel="noopener noreferrer">${text("WE-Simulatorを開く（別タブ）", "Open WE-Simulator (new tab)")} ↗</a>
          </aside>
        </form>`;
    const values = lastValues ?? core.getSimulationPresetOptions("point");
    for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value;
    updateModelFields();
    modal.querySelector("form").addEventListener("submit", event => { event.preventDefault(); void start(); });
    field("model").addEventListener("change", () => {
      const values = core.getSimulationPresetOptions(field("model").value);
      for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value;
      updateModelFields();
    });
    field("nankaiCase").addEventListener("change", () => {
      const values = core.getSimulationPresetOptions(field("model").value, field("nankaiCase").value);
      for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value;
      updateModelFields();
    });
  }

  function readForm() {
    return Object.fromEntries(["model", "nankaiCase", "latitude", "longitude", "magnitude", "depthKm", "ruptureOrigin", "ruptureSpeed"].map(name => [name, field(name)?.value]));
  }

  function updateModelFields() {
    const preset = core.FAULT_MODEL_PRESETS[field("model").value];
    modal.querySelector(".simulation-nankai-case").hidden = field("model").value !== "nankai-trough";
    modal.querySelector(".simulation-coordinate-fields").hidden = Boolean(preset);
    modal.querySelector("[data-simulation-pick]").hidden = Boolean(preset);
    modal.querySelector(".simulation-fault-fields").hidden = !preset;
    modal.querySelector(".simulation-model-note").textContent = preset
      ? text("想定震源域を選択中です。規模・深さ・破壊開始位置を変更できます。", "Using a preset source region. Magnitude, depth and rupture origin can be changed.")
      : text("地図で選択するか、緯度・経度を入力してください。", "Choose a point on the map or enter coordinates.");
  }

  async function open() {
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
      renderForm();
      modal.querySelector("[data-simulation-close]")?.focus({ preventScroll: true });
    } catch {
      close();
      showNotice(text("計算モデルを読み込めませんでした。ボタンから再試行してください。", "Could not load the model. Open simulation to retry."));
    }
  }

  function close({ preservePreparation = false, returnFocus = true } = {}) {
    if (!preservePreparation && preparation) stop();
    if (field("model")) lastValues = readForm();
    modal.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
    if (returnFocus) lastFocused?.focus?.({ preventScroll: true });
  }

  function renderPlayback() {
    playback.innerHTML = `<header><strong>${text("シミュレーション", "Simulation")}</strong><span>${text("実際の地震ではありません", "Not a real earthquake")}</span></header>
      <div class="simulation-playback-meta"><span data-simulation-name></span><span><i class="simulation-p-wave"></i>${text("P波", "P wave")} <i class="simulation-s-wave"></i>${text("S波", "S wave")}</span><button type="button" data-simulation-focus>${text("震源を表示", "Show source")}</button></div>
      <label class="simulation-progress-label">${text("経過時間", "Elapsed time")} <output data-simulation-time></output><input data-simulation-seek type="range" min="0" step="0.1" aria-label="${text("シミュレーション時刻", "Simulation time")}"></label>
      <div class="simulation-playback-actions"><button type="button" data-simulation-pause></button><select data-simulation-speed aria-label="${text("再生速度", "Playback speed")}"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="5">5×</option></select><button type="button" data-simulation-settings>${text("設定", "Settings")}</button><button type="button" data-simulation-stop>${text("終了", "End")}</button></div>`;
    playback.querySelector("[data-simulation-pause]").addEventListener("click", () => {
      if (player.snapshot().running) player.pause();
      else { if (player.snapshot().completed) player.seek(0); player.play(); }
    });
    playback.querySelector("[data-simulation-speed]").addEventListener("change", event => player?.setSpeed(event.target.value));
    playback.querySelector("[data-simulation-seek]").addEventListener("input", event => player?.seek(event.target.value));
    playback.querySelector("[data-simulation-settings]").addEventListener("click", () => void open());
    playback.querySelector("[data-simulation-stop]").addEventListener("click", () => stop());
    playback.querySelector("[data-simulation-focus]").addEventListener("click", () => getMap()?.fitToCoordinates(simulationCoordinates, { maxZoom: lastValues?.model === "point" ? 6.8 : 5.6, duration: 0 }));
    if (lastValues) {
      const variant = lastValues.model === "nankai-trough" ? ({ full: text("全割れ", "Full"), east: text("半割れ・東側", "Eastern half"), west: text("半割れ・西側", "Western half") })[lastValues.nankaiCase] : "";
      playback.querySelector("[data-simulation-name]").textContent = `${modelNames().find(([id]) => id === lastValues.model)?.[1]}${variant ? ` (${variant})` : ""} · M${Number(lastValues.magnitude).toFixed(1)} / ${lastValues.depthKm} km`;
    }
  }

  async function start() {
    if (!modal.querySelector("form").reportValidity()) return;
    const status = modal.querySelector(".simulation-form-status");
    if (isRealEvent()) { status.textContent = text("実際のEEWを表示中です。終了後に開始できます。", "A real EEW is active. Simulation can start after it ends."); return; }
    stop();
    if (!activate()) return;
    const token = ++sequence;
    const controller = new AbortController();
    preparation = controller;
    const timeout = setTimeout(() => controller.abort(new Error("Simulation data timeout")), 15000);
    modal.querySelector(".simulation-start").disabled = true;
    status.textContent = text("観測点を読み込み、計算しています…", "Loading stations and calculating…");
    showNotice("");
    try {
      const options = core.normalizeSimulationOptions(readForm());
      const response = await fetch(JMA_ENDPOINTS.earthquakeStations, { signal: controller.signal, cache: "force-cache" });
      if (!response.ok) throw new Error(`Stations HTTP ${response.status}`);
      const simulation = await core.prepareEarthquakeSimulation(options, await response.json(), { signal: controller.signal });
      const { createSimulationPlayer } = await import("../simulation/simulationPlayer.js");
      if (token !== sequence || isRealEvent()) return;
      preparation = null;
      lastValues = options;
      close({ preservePreparation: true, returnFocus: false });
      renderPlayback();
      playback.hidden = false;
      const seek = playback.querySelector("[data-simulation-seek]");
      seek.max = simulation.duration;
      let latestSummaryKey = "";
      player = createSimulationPlayer({ duration: simulation.duration, frameInterval: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 100, onFrame(state) {
        if (isRealEvent()) { stop(text("実際のEEWを受信したためシミュレーションを終了しました。", "Simulation ended because a real EEW was received.")); return; }
        lastFrame = simulation.frame(state.elapsed);
        const summaryKey = `${Math.floor(state.elapsed)}|${lastFrame.event.serial}|${lastFrame.event.isFinal}`;
        onFrame(lastFrame, { updateSummary: summaryKey !== latestSummaryKey });
        latestSummaryKey = summaryKey;
        playback.querySelector("[data-simulation-seek]").value = state.elapsed;
        playback.querySelector("[data-simulation-time]").textContent = `${state.elapsed.toFixed(1)} / ${simulation.duration.toFixed(0)} s`;
        playback.querySelector("[data-simulation-pause]").textContent = state.running ? text("一時停止", "Pause") : state.completed ? text("再生し直す", "Replay") : text("再生", "Play");
      } });
      simulationCoordinates = simulation.sources.map(s => s.coordinates);
      player.play();
      playback.querySelector("[data-simulation-pause]").focus({ preventScroll: true });
    } catch (error) {
      if (token !== sequence) return;
      status.textContent = text("計算できませんでした。入力値と通信状態を確認し、再試行してください。", "Could not calculate. Check the values and connection, then retry.");
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
    simulationCoordinates = [];
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
    else player?.pause();
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
