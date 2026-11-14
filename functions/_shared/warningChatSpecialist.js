// Reviewed paraphrases of the linked JMA sources, 2026-11-14. These are
// general explanations, never evidence that an advisory is currently active.
const KNOW = "https://www.jma.go.jp/jma/kishou/know/";
export const SEISMIC_ADVISORY_SOURCES = Object.freeze({
  nankai: {title: "気象庁 南海トラフ地震に関連する情報", url: "https://www.data.jma.go.jp/eew/data/nteq/index.html"},
  hokkaido: {title: "気象庁 北海道・三陸沖後発地震注意情報", url: "https://www.data.jma.go.jp/eew/data/nceq/index.html"}
});
const records = [
  {id: "nankai-meaning", kind: "nankai", facet: "meaning", title: "南海トラフ地震臨時情報の意味", url: KNOW + "jishin/nteq/info_criterion.html",
    text: "正式名称は南海トラフ地震臨時情報で、調査中・巨大地震警戒・巨大地震注意・調査終了というキーワードが付きます。異常な現象を評価し、大規模地震の可能性が平常時より相対的に高い場合などに知らせます。日時や場所を特定する地震予知でも、気象の注意報でもありません。関連解説情報には、異常後の経過だけでなく定例の評価もあります。"},
  {id: "nankai-criteria", kind: "nankai", facet: "criteria", title: "巨大地震警戒と巨大地震注意の違い", url: KNOW + "jishin/nteq/info_criterion.html",
    text: "巨大地震警戒は想定震源域内のプレート境界でMw8.0以上と評価した場合。巨大地震注意は監視領域内のMw7.0以上（警戒の場合を除き、太平洋プレートの深い地震は除外）、または通常と異なるゆっくりすべりを評価した場合です。速報的なM6.8以上などは調査開始の条件であり、注意・警戒の確定条件ではありません。MとMw、地震の位置・仕組みの評価を区別します。"},
  {id: "nankai-period", kind: "nankai", facet: "period", title: "南海トラフの防災対応期間", url: KNOW + "jishin/nteq/info_criterion.html",
    text: "地震を受けた巨大地震注意では、原則として先発地震から1週間、備えを再確認します。巨大地震警戒では原則1週間警戒し、その後さらに1週間注意します。通常と異なるゆっくりすべりの場合は一律1週間ではなく、変化が収まってから変化していた期間と概ね同程度の期間までが対象です。具体的な対応は政府・自治体の呼びかけを確認し、期間経過を安全宣言と解釈しません。"},
  {id: "nankai-action", kind: "nankai", facet: "action", title: "臨時情報を受けた行動", url: KNOW + "jishin/nteq/bosai.html",
    text: "家具固定・備蓄・連絡方法・避難場所を再確認します。巨大地震注意だけで全員に事前避難を求めるものではありません。巨大地震警戒では、地震後の避難では間に合わない住民などの事前避難を自治体の対象区域・呼びかけに沿って行います。この資料から個人の対象区域や避難所開設は判定できません。現に津波警報等がある場合は津波への防災行動を優先します。"},
  {id: "hokkaido-meaning", kind: "hokkaido", facet: "meaning", title: "北海道・三陸沖後発地震注意情報", url: KNOW + "jishin/nceq/info_guide.html",
    text: "北海道・三陸沖後発地震注意情報は、日本海溝・千島海溝沿いの大規模地震の後、さらに大規模な地震の可能性が平常時より相対的に高まったことを知らせます。想定震源域内のMw7.0以上、または外側でMw7.0以上が発生し想定震源域への影響があると評価した場合が対象です。先発地震より大きな地震も含み、日時・場所の予知でも、津波警報そのものでもありません。"},
  {id: "hokkaido-period", kind: "hokkaido", facet: "period", title: "後発地震への注意期間と再発表", url: KNOW + "jishin/nceq/bosai.html",
    text: "防災対応を呼びかける期間は、情報の発表からではなく先発地震の発生から1週間です。期間内に再び基準を満たす地震が起きると情報が再発表され、その地震から1週間後まで延長されます。気象庁は防災対応の解除を知らせる情報を出しません。期間の長さは可能性の時間的低下と対応を続けられる限度等を考慮したもので、1週間後に地震の可能性がなくなる意味ではありません。"},
  {id: "hokkaido-action", kind: "hokkaido", facet: "action", title: "後発地震注意情報を受けた行動", url: KNOW + "jishin/nceq/bosai.html",
    text: "社会経済活動を継続しながら備えを再確認し、揺れや津波警報等の際に直ちに避難できる態勢を整えます。この情報に伴う国・自治体からの事前避難の呼びかけはありません。ただし実際の強い揺れ・長い揺れや津波警報等への避難行動とは別です。現在の自治体の避難指示や個々の避難経路の安全性をこのチャットが確認したわけではありません。"},
  {id: "slow-slip", kind: "nankai", facet: "mechanism", title: "ゆっくりすべりと情報の関係", url: KNOW + "jishin/nteq/info_criterion.html",
    text: "ゆっくりすべりはプレート境界が通常の地震よりゆっくりずれる現象です。従来から繰り返す深部の短期的・長期的ゆっくりすべりが観測されただけでは巨大地震注意とは限りません。場所や規模・変化の速さ等が通常と異なり、固着状態の変化を示すかを気象庁が評価します。アプリが独自に観測から注意情報を判定することはできません。"},
  {id: "advisory-uncertainty", kind: "both", facet: "uncertainty", title: "相対的な可能性と地震予知の違い", url: KNOW + "faq/faq32.html",
    text: "大規模地震後に周辺で次の大規模地震が起こりやすくなるという統計や観測に基づく情報です。相対的な可能性の上昇は、必ず発生することや特定の市町村で起こる確率を示しません。情報がなくても突発的に起こり得ます。長期評価の確率を短期間へ比例配分したり、Mwや震度から個人の発生確率・安全性を計算したりすることはできません。"}
];
export const WARNING_CHAT_SPECIALIST_RECORDS = Object.freeze(records);

const NANKAI = /南海(?:トラフ)?|巨大地震(?:注意|警戒)|臨時情報|nankai|megathrust earthquake (?:alert|advisory)/iu;
const HOKKAIDO = /後発地震|三陸沖.*注意情報|北海道.*注意情報|hokkaido.*(?:advisory|subsequent)|sanriku.*(?:advisory|subsequent)|subsequent earthquake advisory/iu;
export function warningChatSpecialistPlan(input) {
  let question = input.question.normalize("NFKC");
  if (!NANKAI.test(question) && !HOKKAIDO.test(question)
    && /^(?:それ|その|では|じゃあ|いつまで|なぜ|どうして|もっと|詳しく|比較|違い|避難|what about|why|how long|tell me more|compare|does (?:it|that))/iu.test(question)) {
    const previous = [...(input.history ?? [])].reverse().find(item => item.role === "user");
    if (previous && (NANKAI.test(previous.content) || HOKKAIDO.test(previous.content))) question += ` ${previous.content}`;
  }
  const kinds = [NANKAI.test(question) && "nankai", HOKKAIDO.test(question) && "hokkaido"].filter(Boolean);
  if (!kinds.length) return null;
  const current = /現在|今(?:は|も|の|、|出|[?？]|$)|発表中|最新|出て(?:い|る)|まだ|この地域|ここ|current|latest|in effect|active|has .*issued|is .*issued/iu.test(question)
    || /発表され(?:て|た)|解除され/iu.test(question) && !/場合|とき|時は|なら|if |when .*issued/iu.test(question);
  const facets = [
    /違い|比較|基準|条件|M[0-9]|Mw|difference|compar|criteria|threshold/iu.test(question) && "criteria",
    /期間|いつまで|何日|1週間|一週間|解除|延長|until|period|week|how long|expir/iu.test(question) && "period",
    /ゆっくり|slow.?slip|固着/iu.test(question) && "mechanism",
    /避難|備え|対応|行動|どうす|evacuat|prepar|what should/iu.test(question) && "action",
    /なぜ|理由|根拠|確率|予知|予測|必ず|安全|why|reason|probabilit|predict|safe|certain/iu.test(question) && "uncertainty"
  ].filter(Boolean);
  const preferred = facets.length ? facets : ["meaning", "criteria"];
  const relevant = records.filter(item => kinds.includes(item.kind) || item.kind === "both");
  // Interleave concepts across both advisories; one topic must not crowd out
  // the other. Bound evidence before model inference, not by truncating facts.
  const selected = [];
  const limit = current ? 3 : 4;
  for (const facet of [...preferred, "meaning", "uncertainty"]) for (const kind of kinds) {
    const item = relevant.find(item => (item.kind === kind || item.kind === "both") && item.facet === facet)
      ?? (facet === "criteria" ? relevant.find(item => item.kind === kind && item.facet === "meaning") : null);
    if (item && !selected.includes(item) && selected.length < limit) selected.push(item);
  }
  return {kinds, current, records: selected};
}
