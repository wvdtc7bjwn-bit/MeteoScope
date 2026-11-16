// Public products used by MeteoScope. A question selects a fixed adapter, never a URL.
export const WARNING_CHAT_DATA_PRODUCTS = Object.freeze({
  models: {label:"海外モデルの台風予測", match:/ECMWF|\bIFS\b|\bAIFS\b|\bGEFS\b|NOAA|海外モデル|アンサンブル/iu},
  amedas: {label:"アメダス観測", match:/アメダス|観測(?:気温|雨量|風速)|(?:現在|今)の(?:気温|雨量|降水量|風速|風)|湿度|積雪|気圧|全国.*(?:暑|寒|気温)|AMeDAS|current temperature|humidity|snow depth/iu},
  typhoon: {label:"台風情報", match:/台風|熱帯低気圧|typhoon|tropical cyclone/iu},
  volcano: {label:"火山情報", match:/火山|噴火|降灰|桜島|阿蘇山|新燃岳|volcano|eruption|ashfall/iu},
  tide: {label:"潮位観測", match:/潮位|満潮|干潮|潮汐|tide level|high tide|low tide/iu},
  river: {label:"指定河川洪水予報", match:/指定河川|氾濫(?:情報|警戒|危険|発生)|河川.*(?:水位|洪水)|川の水位|flood bulletin|river level/iu},
  radar: {label:"雨雲レーダー・降水短時間予報", match:/雨雲|レーダー|降水短時間|radar|rain cloud|rainfall nowcast/iu},
  lightning: {label:"雷ナウキャスト", match:/雷ナウキャスト|雷活動|雷の状況|lightning|thunder nowcast/iu},
  satellite: {label:"雲画像", match:/ひまわり|雲画像|衛星画像|satellite|Himawari/iu},
  kikikuru: {label:"キキクル", match:/キキクル|危険度分布|Kikikuru/iu},
  hazard: {label:"自治体ハザードマップ", match:/ハザードマップ|防災マップ|hazard map/iu},
  geology: {label:"活断層・プレート・推計震度分布", match:/活断層|プレート|推計震度分布|震央分布|発震機構|\bCMT\b|地盤補正|地盤増幅|active fault|tectonic plate|focal mechanism/iu},
  simulation: {label:"地震シミュレーション", match:/シミュレーション|simulation/iu},
  community: {label:"利用者の投稿", match:/利用者の投稿|周辺の投稿|みんなの投稿|天気投稿|community report/iu}
});

export function warningChatDataProduct(input) {
  const q = String(input.question ?? "").normalize("NFKC");
  // Existing reviewed definitions and general evacuation explanations retain priority.
  if (/とは|意味|違い|仕組み|what (?:is|does)|define|meaning/iu.test(q)
    && !/現在|最新|今日|今の|current|latest|today/iu.test(q)) return "";
  if (/避難|evacuat/iu.test(q)) return "";
  if (/シミュレーション|simulation/iu.test(q)) return "simulation";
  if (/津波|tsunami/iu.test(q)) return "";
  // An ordinary weather/early-warning question keeps those dedicated sources.
  if (/早期注意情報|警報級(?:の)?可能性|天気予報|明日の天気|降水確率/iu.test(q) && !/台風|火山|噴火/iu.test(q)) return "";
  return Object.entries(WARNING_CHAT_DATA_PRODUCTS).find(([,product]) => product.match.test(q))?.[0] ?? "";
}
