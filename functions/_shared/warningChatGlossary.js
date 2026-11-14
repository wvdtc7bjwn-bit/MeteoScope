// Short, reviewed paraphrases of JMA sources (2026-11-14). These describe
// terminology, never the current warning status or a new local forecast.
const jma = "https://www.jma.go.jp/jma/kishou/know/";
export const WARNING_CHAT_GLOSSARY = [
  {id: "ground-motion", topic: "earthquake", match: /地盤|増幅|異常震域|震源.*距離|(?:小さ|小さい).*揺れ|ground amplification|soft ground|shaking.*(?:distance|depth|magnitude)/iu, title: "揺れの強さと地盤・距離・深さ", enTitle: "Shaking, ground conditions, distance and depth", url: jma + "faq/faq27.html",
    text: "地点の揺れは地震の規模だけで決まらず、震源からの距離・深さ・地下構造や地盤によって異なります。近くで起きる小規模の地震でも強く揺れることがあり、同じ距離でも軟らかな地盤で増幅される場合があります。深い地震では沈み込むプレートを伝わった波により震央から離れた場所が強く揺れる異常震域も生じます。Mだけからその地点の震度や建物の安全性は決められません。",
    en: "Shaking depends on distance, depth, underground structure and local ground as well as magnitude. A small nearby earthquake can cause strong shaking; soft ground can amplify waves. Deep earthquakes can shake distant areas through the subducting plate. Magnitude alone cannot determine a site's intensity or building safety."},
  {id: "long-period", topic: "earthquake", match: /長周期|共振|固有周期|高層ビル|long.period|resonan|high.rise|tall buildings?|buildings?.*sway/iu, title: "長周期地震動と共振", enTitle: "Long-period ground motion and resonance", url: jma + "jishin/choshuki/choshuki_eq1.html",
    text: "大きな地震で生じる周期の長い波は遠くまで伝わることがあります。建物には揺れやすい固有周期があり、長周期の波と高層ビルの周期が近いと共振して大きく長く揺れます。地表付近の震度と高層階の揺れは同一ではなく、長周期地震動階級は別の指標です。個々の建物の階数や震度だけで内部の揺れ・被害・安全性を断定できません。",
    en: "Long-period waves from large earthquakes can travel far. When their period is close to a high-rise building's natural period, resonance can cause large, prolonged motion. Ground-level intensity differs from shaking on upper floors; long-period ground-motion class is a separate measure. Floor count or intensity alone cannot establish individual damage or safety."},
  {id: "moment-magnitude", topic: "earthquake", match: /モーメントマグニチュード|\bMw\b|気象庁マグニチュード|moment magnitude/iu, title: "MとモーメントマグニチュードMw", enTitle: "Magnitude M and moment magnitude Mw", url: jma + "jishin/nteq/info_criterion.html",
    text: "Mwは断層のずれの規模を示す地震モーメントから求めるマグニチュードです。地震波の振幅から速報的に求めるMと値や算出にかかる時間が異なる場合があります。南海トラフ等の情報ではMwで評価する条件があるため、速報のMをそのままMwとして条件判定してはいけません。両者の差だけで誤報とも、後発地震の発生とも判断できません。",
    en: "Moment magnitude Mw uses seismic moment, which represents fault slip. It can differ in value and calculation time from preliminary amplitude-based magnitude M. Some advisory criteria use Mw; do not substitute preliminary M. A difference alone does not establish an erroneous report or a future earthquake."},
  {id: "predicted-intensity", topic: "earthquake", match: /予想震度|予測震度|predicted intensity/iu, title: "予想震度と観測震度", enTitle: "Predicted and observed intensity", url: jma + "jishin/eew/shikumi/shikumi.html",
    text: "予想震度は、緊急地震速報などで今後の揺れの強さを推定した値です。観測震度は、震度計で実際に捉えた揺れの強さです。予測には誤差があり、予想震度と後から発表される観測震度が一致するとは限りません。",
    en: "Predicted intensity estimates upcoming shaking, for example in EEW. Observed intensity is measured by an instrument. Predictions have uncertainty and need not match the observed intensity announced later."},
  {id: "intensity", topic: "earthquake", match: /震度|[56][弱強＋+−-]|shindo|seismic intensity/iu, title: "震度", enTitle: "Seismic intensity", url: jma + "shindo/",
    text: "震度は、その場所で観測された揺れの強さです。同じ地震でも場所によって異なります。気象庁の階級は0、1、2、3、4、5弱、5強、6弱、6強、7の10段階です。5−は5弱、5＋は5強を表します。",
    en: "Seismic intensity describes shaking at a particular place. JMA has ten categories: 0, 1, 2, 3, 4, 5 Lower, 5 Upper, 6 Lower, 6 Upper and 7. 5− means 5 Lower; 5+ means 5 Upper. Intensity varies between locations."},
  {id: "magnitude", topic: "earthquake", match: /マグニチュード|magnitude|\bMw\b|地震のエネルギー|(?:^|\s)M(?:って|とは|の意味|が|は|と|[?？])/iu, title: "マグニチュード", enTitle: "Magnitude", url: jma + "faq/faq27.html",
    text: "マグニチュード（M）は地震そのものの規模です。震度が各場所の揺れの強さを表すのに対し、Mは地震全体の規模を表します。標準的にはMが1増えると地震波のエネルギーは約32倍、2増えると約1000倍になります。これはエネルギーの比較であり、各地点の揺れや被害が同じ倍率になる意味ではありません。",
    en: "Magnitude (M) measures earthquake size; intensity measures local shaking. A one-unit increase corresponds to roughly 32 times the seismic-wave energy and two units to roughly 1000 times. These energy ratios are not ratios of local shaking or damage."},
  {id: "hypocenter", topic: "earthquake", match: /震源|震央|hypocent(?:er|re)|epicent(?:er|re)/iu, title: "震源と震央", enTitle: "Hypocenter and epicenter", url: "https://www.jma-net.go.jp/nagoya/shosai/info/mini-jishin/singen.html",
    text: "震源は地下で岩石の破壊が始まった点です。震央はその真上の地表の点、震源の深さは地表から震源までの深さです。震源域は破壊が広がった範囲で、震源という1点とは区別します。",
    en: "The hypocenter is where rupture begins underground. The epicenter is the point at the surface directly above it. Depth describes how far below the surface the hypocenter lies; the rupture area is broader than that single point."},
  {id: "eew", topic: "earthquake", match: /緊急地震速報|\bEEW\b|earthquake early warning/iu, title: "緊急地震速報（予報・警報）", enTitle: "Earthquake Early Warning (forecast and warning)", url: jma + "jishin/eew/shikumi/shousai.html",
    text: "緊急地震速報は地震発生後の観測から、強い揺れをできるだけ早く知らせる情報です。地震予知ではありません。予報と警報は発表条件や対象が異なり、警報は予想最大震度5弱以上、または予想最大長周期地震動階級3以上の場合などに発表されます。震源に近い場所では揺れに間に合わない場合があります。",
    en: "EEW uses observations after an earthquake begins to warn of strong shaking; it is not earthquake prediction. Forecasts and warnings have different criteria. Warnings include cases with predicted intensity 5 Lower or greater, or long-period ground-motion class 3 or greater. Alerts may be too late near the source."},
  {id: "plum", topic: "earthquake", match: /PLUM/iu, title: "PLUM法", enTitle: "PLUM method", url: "https://www.data.jma.go.jp/eew/data/nc/plum/",
    text: "PLUM法は、近くの観測点で捉えた揺れから周辺の揺れを予測する、気象庁の緊急地震速報の手法です。震源や規模を推定する方法とは異なります。予測から揺れまでの時間が短い場合があり、仮定震源要素の使用だけでPLUM法と断定はできません。",
    en: "PLUM is a JMA EEW method that estimates nearby shaking from observed shaking, rather than estimating a hypocenter and magnitude. Warning time can be short. Assumed source parameters alone do not establish that PLUM was used."},
  {id: "waves", topic: "earthquake", match: /[PS][ -]?波|[PS][ -]?waves?/iu, title: "P波とS波", enTitle: "P and S waves", url: jma + "jishin/eew/shikumi/shikumi.html",
    text: "P波とS波は地震で生じる波です。P波の方が速く伝わり、通常はS波より先に届きます。地図の概算円は実際の地下構造やすべての揺れを再現するものではなく、気象庁が発表した正式な到達時刻と区別する必要があります。",
    en: "P and S waves are seismic waves. P waves travel faster and usually arrive before S waves. Approximate map circles do not reproduce all underground structures or shaking, and are separate from official JMA arrival forecasts."},
  {id: "mechanism", topic: "earthquake", match: /発震機構|発振機構|\bCMT\b|モーメントテンソル|focal mechanism|moment tensor/iu, title: "発震機構・CMT解", enTitle: "Focal mechanism and CMT solution", url: "https://www.data.jma.go.jp/eqev/data/mech/kaisetu/cmt_kaisetu.html",
    text: "発震機構は断層がどの向きにずれたかを表します。CMT解は地震波形から断層運動全体を代表する位置・時刻・規模・発震機構を解析したものです。破壊の始まりを調べる初動解とは異なる場合があり、図にある2つの面だけで実際の断層面を一意に決めることはできません。",
    en: "A focal mechanism describes fault motion. A CMT solution represents the overall rupture using seismic waveforms, whereas a first-motion solution describes its beginning. They may differ. The two nodal planes alone do not identify which plane was the actual fault."},
  {id: "weather-alerts", topic: "weather", match: /警報|注意報|warning|advisory/iu, title: "気象警報・注意報", enTitle: "Weather warnings and advisories", url: jma + "yougo_hp/keihou.html",
    text: "気象警報は重大な災害のおそれ、注意報は災害のおそれについて注意や警戒を呼びかける情報です。危険警報は重大な災害のおそれが大きい危険な状況、特別警報は異常な現象により重大な災害のおそれが著しく大きい状況を知らせます。現在の発表状況とは別の用語の説明です。",
    en: "Weather advisories indicate a risk of disaster; warnings concern serious disaster. Danger warnings describe a dangerous situation with a high risk of serious disaster, and emergency warnings concern exceptionally severe phenomena with a very high risk. These are definitions, not current local announcements."},
  {id: "outlook", topic: "weather", match: /いつまで|解除|時間帯|until|cancel|outlook/iu, title: "時系列の見通しと解除", enTitle: "Outlook time bands and cancellation", url: jma + "bosai/warning_irowake.html",
    text: "時系列表示は基準を超える現象が見込まれる時間帯です。その終わりは警報・注意報の解除時刻の確約ではありません。雨がやんでも土砂災害などのおそれが残る場合があります。",
    en: "Outlook time bands show when criteria may be exceeded. Their end is not a guaranteed cancellation time. Landslide and other risks can persist after rain stops."},
  {id: "kikikuru", topic: "weather", match: /キキクル|危険度分布|kikikuru/iu, title: "キキクル", enTitle: "Kikikuru risk maps", url: jma + "bosai/riskmap.html",
    text: "キキクルは、大雨による土砂災害・浸水害・洪水災害の危険度を地図で示す情報です。雨水が地中や地表、川をどう動くかを表した指数などを使います。今降っている雨量だけを色分けした図ではありません。",
    en: "Kikikuru maps the risk of landslides, inundation and flooding from heavy rain. It uses indices representing water in the soil, on the surface and in rivers, rather than simply colouring current rainfall amounts."},
  {id: "rainband", topic: "weather", match: /線状降水帯|linear rainband/iu, title: "線状降水帯", enTitle: "Linear rainband", url: jma + "bosai/kishojoho_senjoukousuitai.html",
    text: "線状降水帯は、積乱雲が次々と発生して並び、ほぼ同じ場所に強い雨を長く降らせるものです。災害の危険性が急に高まることがあります。用語の説明だけでは、選択地域で今発生しているかは判断できません。",
    en: "A linear rainband forms when successive cumulonimbus clouds produce prolonged heavy rain over roughly the same area. Disaster risk can rise rapidly. This definition does not establish whether one is currently occurring locally."},
  {id: "precipitation-probability", topic: "weather", match: /降水確率|precipitation probability|chance of rain/iu, title: "降水確率", enTitle: "Precipitation probability", url: jma + "yougo_hp/yoho.html",
    text: "降水確率は、対象の区域・時間に1mm以上の雨や雪が降る確率です。降る量の多さや、対象時間の何割で雨が降るかを示す値ではありません。例えば30%は、同様の予報100回のうち約30回で1mm以上の降水があるという意味です。",
    en: "Precipitation probability is the chance of at least 1 mm of rain or snow in the specified area and period. It is not rainfall amount or the fraction of time it will rain. A 30% forecast means precipitation in roughly 30 of 100 comparable cases."},
  {id: "forecast-circle", topic: "weather", match: /予報円|forecast circle/iu, title: "予報円", enTitle: "Forecast circle", url: jma + "typhoon/7-1.html",
    text: "予報円は、予報時刻に台風などの中心が入ると予想される範囲です。中心が円内に入る確率は70%で、台風自体の大きさを表しません。円の外が安全という意味でも、中心が線に沿って進むという意味でもありません。",
    en: "A forecast circle shows where the cyclone centre is expected at a forecast time, with a 70% probability of lying inside. It does not show the cyclone's size, guarantee safety outside, or guarantee that the centre follows the connecting line."},
  {id: "wind-areas", topic: "weather", match: /強風域|暴風域|暴風警戒域|storm.warning area|gale.wind area/iu, title: "強風域・暴風域・暴風警戒域", enTitle: "Gale, storm and storm-warning areas", url: jma + "yougo_hp/haichi2.html",
    text: "強風域は平均風速15m/s以上、暴風域は25m/s以上の風が吹く、または地形の影響がなければ吹く可能性のある範囲です。暴風警戒域は台風の中心が予報円内に進んだ場合に暴風域に入るおそれのある範囲で、現在の暴風域とは区別します。",
    en: "Gale and storm wind areas correspond to mean winds of at least 15 m/s and 25 m/s respectively, including potential winds without terrain effects. The storm-warning area is where storm winds could occur if the centre travels within the forecast circle; it differs from the current storm wind area."},
  {id: "tsunami-alerts", topic: "tsunami", match: /(?:大)?津波(?:警報|注意報)|tsunami (?:warning|advisory)/iu, title: "津波警報・津波注意報", enTitle: "Tsunami warnings and advisories", url: jma + "jishin/joho/tsunamiinfo.html",
    text: "津波注意報は、予想される最大波が高いところで0.2m以上1m以下で災害のおそれがある場合、津波警報は1mを超え3m以下、大津波警報は3mを超える場合に発表されます。注意報でも流れに巻き込まれる危険があり、高さだけで安全を判断してはいけません。",
    en: "JMA tsunami advisories concern expected maximum heights of 0.2–1 m with a disaster risk; tsunami warnings concern over 1 m up to 3 m; major tsunami warnings concern over 3 m. Advisories can still involve dangerous currents. Height alone does not establish safety."},
  {id: "tsunami", topic: "tsunami", match: /津波|第一波|最大波|tsunami/iu, title: "津波の予想高さ・到達時刻・観測値", enTitle: "Tsunami heights, arrival times and observations", url: jma + "jishin/joho/tsunamiinfo.html",
    text: "津波の予想高さと、観測された高さは別の情報です。到達予想時刻は予報区内で最も早い第一波の到達の見込みで、その時刻まで安全という意味ではありません。津波は繰り返し来て、後の波が高くなることがあります。第一波は最初の波、最大波は観測期間で最も高い波です。",
    en: "Expected tsunami height differs from observed height. Arrival time is the earliest expected first wave within a forecast region, not a safe waiting period. Later waves can be higher: the first wave arrives first, while the maximum wave is the highest observed during the observation period."}
];

export function findWarningChatTerms(question) {
  const query = question.normalize("NFKC");
  let terms = WARNING_CHAT_GLOSSARY.filter(item => item.match.test(query));
  if (/\bintensity\b/iu.test(query) && /earthquake|magnitude|shaking/iu.test(query) && !terms.some(item => item.id === "intensity")) terms.unshift(WARNING_CHAT_GLOSSARY.find(item => item.id === "intensity"));
  if (terms.some(item => item.id === "predicted-intensity") && !/観測震度|observed intensity/iu.test(query)) terms = terms.filter(item => item.id !== "intensity");
  // Compound names must not accidentally retrieve a generic weather warning.
  if ((/緊急地震速報|\bEEW\b|津波|tsunami|earthquake early warning/iu.test(query)) && !/気象警報|weather warning/iu.test(query)) terms = terms.filter(item => item.id !== "weather-alerts");
  return terms;
}

// Explanations need the reviewed mechanisms, not an unrelated current bulletin
// or a fixed dictionary answer. Live/local questions still use live evidence.
export function warningChatKnowledgeQuestion(input) {
  let query = input.question.normalize("NFKC");
  if (/^(?:それ|その|もっと|もう少し|詳しく|why|tell me more|explain (?:it|that))/iu.test(query)) {
    const previous = [...(input.history ?? [])].reverse().find(item => item.role === "user");
    if (previous) query += ` ${previous.content}`;
  }
  if (/現在|最新|発表中|この地震|その地震|ここ|当地|この地域|観測した|発表され|current|latest|here|this earthquake|issued|occurred/iu.test(query)) return null;
  if (!/なぜ|どうして|理由|仕組み|原理|関係|根拠|計算|比較|詳しく|why|how (?:does|do|can)|mechanism|relationship|compare|explain|tell me more/iu.test(query)) return null;
  const terms = findWarningChatTerms(query).filter(term => term.id !== "outlook").slice(0, 3);
  return terms.length ? terms : null;
}

export function warningChatDefinition(input) {
  const query = input.question.normalize("NFKC");
  const meaning = /とは|って(?:何(?:[?？。、\s]|です|なの|$)|なに)|意味|違い|どう違|何です|何なの|what (?:is|are|does)|define|difference between/iu;
  if (isDefinitionRefinement(query)) {
    const previous = [...(input.history ?? [])].reverse().find(item => item.role === "user" && meaning.test(item.content) && findWarningChatTerms(item.content).length);
    if (previous) return warningChatDefinition({...input, question: previous.content, history: []});
  }
  if (!meaning.test(query)) return null;
  if (/現在|発表中|最新|この地震|その地震|ここ|当地|いつ|何時|どこ|何件|何回|どうすれば|対処|行動|安全|大丈夫|発表され|観測した|current|latest|here|this earthquake|when|where|how many|what should|safe|issued|occurred/iu.test(query)) return null;
  const scoped = input.topic === "earthquake" && /警報.*予報|予報.*警報/u.test(query) && !/気象/iu.test(query) ? `緊急地震速報 ${query}` : query;
  const terms = findWarningChatTerms(scoped).slice(0, 3);
  return terms.length ? terms : null;
}

export function isDefinitionRefinement(question) {
  return /^(?:それを|その用語を|もう少し|もっと|詳しく|簡単に|tell me more|explain (?:it|that)|make it simpler)/iu.test(question);
}
