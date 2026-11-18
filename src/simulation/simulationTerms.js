// Increment when the simulation terms materially change. This consent is
// separate from general app consent and never grants server-side permissions.
export const SIMULATION_TERMS_VERSION = "2026-11-18-v1";
export const SIMULATION_TERMS_KEY = "meteoscope:simulation-terms";

export function createSimulationTermsConsent(getStorage = () => globalThis.localStorage) {
  let acceptedInSession = false;
  return {
    isAccepted() {
      if (acceptedInSession) return true;
      try { return getStorage()?.getItem(SIMULATION_TERMS_KEY) === SIMULATION_TERMS_VERSION; }
      catch { return false; }
    },
    accept() {
      acceptedInSession = true;
      try { getStorage()?.setItem(SIMULATION_TERMS_KEY, SIMULATION_TERMS_VERSION); }
      catch { /* Current page can continue when persistent storage is blocked. */ }
    }
  };
}

export function simulationTermsMarkup(english, review = false) {
  const t = (ja,en) => english ? en : ja;
  const sections = [
    [t("学習用の独自近似です", "An educational approximation"),
      t("実際の地震・緊急地震速報ではありません。表示する震度、揺れの広がり・収まり方、P/S波の到達、速報の値・報数・更新時刻は模擬計算であり、実際の地震が同じ経過をたどることを保証しません。", "This is not a real earthquake or emergency warning. Intensities, shaking spread and decay, P/S arrivals, and bulletin values, counts and timing are simulated. A real earthquake will not necessarily follow the same sequence.")],
    [t("公的な想定・解析の再現ではありません", "Not a reproduction of official assessments"),
      t("J-SHISなどの公的データを一部使用していても、公的機関による予測・認定ではありません。簡略震源列や点群への距離近似では、断層面・強震動生成域（SMGA）・すべり分布・波形を完全には再現しません。南海トラフの全割れ・半割れや各海溝のモデルは別の条件で、相互に置き換えられません。", "Using some public data, including J-SHIS, does not make these results official forecasts or endorsements. Simplified sources and point-distance approximations do not fully reproduce fault surfaces, SMGA, slip or waveforms. Nankai full and half ruptures and the different trench models have distinct conditions and are not interchangeable.")],
    [t("低い震度表示は安全を意味しません", "A lower displayed intensity does not mean safety"),
      t("公的想定や実測より低く、または高く出ることがあります。巨大地震では震度計算用Mwを8.3に制限する従来仮定があり、深発地震は別の学習用近似です。1km地盤データや地盤補正の欠測も結果に影響します。建物被害・津波・地盤の非線形性は計算していません。実際の震度予測、避難の要否、防災上の安全判定には使用しないでください。", "Results may be lower or higher than official assessments or observations. Giant-event intensity calculations retain an Mw8.3 cap, and deep events use a separate educational approximation. The 1 km ground data and missing ground corrections also affect results. Building damage, tsunami and nonlinear soil behavior are not modeled. Do not use these results for real intensity forecasts, evacuation decisions or safety assessments.")],
    [t("M表示・模擬EEWの意味", "Magnitude notation and simulated bulletins"),
      t("内部計算はMwです。要約のM表記は、元のMwの数値または条件付きの換算参考値であり、気象庁のMjを算出したものではありません。換算方法は再生中に切り替えません。模擬EEWはMeteoScope独自の学習用処理で、気象庁の実際の解析手法・精度を再現しません。", "Calculations use Mw. The summary's M notation shows either the original Mw value or a conditional empirical reference, not a calculated JMA Mj. The display method does not switch during playback. Simulated EEW uses MeteoScope's educational logic and does not reproduce JMA's actual analysis or accuracy.")],
    [t("読込データの出典と条件を確認してください", "Check imported data and conditions"),
      t("端末から読み込むファイルは、出典URLや形式が合っていても内容の真正性まで自動保証しません。公的想定値を読み込んだ場合も、不足地点は独自近似となることがあります。元データの利用条件を確認し、公的値と独自計算を混同しないでください。", "A matching file format or source URL does not authenticate imported content. Even when published scenario values are imported, missing sites may use an approximation. Check the source's usage conditions and distinguish published values from MeteoScope calculations.")],
    [t("共有時もシミュレーションと明記してください", "Label shared results as simulations"),
      t("画面や結果を共有する際は、シミュレーション・学習用の近似であることが分かる表示を残し、実際の地震情報や公的想定として共有しないでください。実際の災害時は気象庁などの公式情報を確認してください。", "When sharing screens or results, keep labels that identify them as an educational simulation. Do not present them as real earthquake information or an official assessment. During a real disaster, consult official information such as JMA bulletins.")]
  ];
  return `<section class="simulation-terms" aria-label="${t("シミュレーション利用規約", "Simulation terms of use")}">
    <p class="simulation-disclaimer">${t("開始前に、計算の限界と利用条件をご確認ください。", "Please review the limitations and usage conditions before continuing.")}</p>
    ${sections.map(([title,body],i)=>`<section><h3>${i+1}. ${title}</h3><p>${body}</p></section>`).join("")}
    <p class="simulation-terms-version">${t("規約の版", "Terms version")}: ${SIMULATION_TERMS_VERSION}</p>
    ${review ? `<button type="button" class="simulation-secondary" data-simulation-terms-back>${t("設定に戻る", "Back to settings")}</button>` : `
    <label class="simulation-terms-check"><input type="checkbox" data-simulation-terms-check><span>${t("内容を確認し、学習用の近似として利用することに同意します。", "I have read these terms and agree to use this as an educational approximation.")}</span></label>
    <p class="simulation-terms-version">${t("同意はこの端末・ブラウザーに保存します。規約の変更時は再確認します。保存できない環境では、ページの再読込後に再表示します。", "Agreement is saved in this browser on this device. Changes require renewed agreement. If storage is unavailable, these terms appear again after reloading.")}</p>
    <div class="simulation-terms-actions"><button type="button" class="simulation-secondary" data-simulation-close>${t("同意せず閉じる", "Close without agreeing")}</button><button type="button" class="simulation-start" data-simulation-terms-accept disabled>${t("同意して設定へ", "Agree and open settings")}</button></div>`}
  </section>`;
}
