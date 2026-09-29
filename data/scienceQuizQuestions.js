const sources = Object.freeze({
  jma: Object.freeze({ label: "気象庁 気象の知識", url: "https://www.jma.go.jp/jma/kishou/know/yougo_hp/" }),
  jmaRadar: Object.freeze({ label: "気象庁 気象レーダー", url: "https://www.jma.go.jp/jma/kishou/know/radar/kaisetsu.html" }),
  nasa: Object.freeze({ label: "NASA Heliophysics", url: "https://science.nasa.gov/heliophysics/" }),
  noaa: Object.freeze({ label: "NOAA Space Weather Prediction Center", url: "https://www.swpc.noaa.gov/phenomena" })
});

// Each fact is sourced from a public scientific authority. The catalog uses
// university-introductory wording and discriminates among adjacent concepts,
// rather than asking only for a single-word recollection.
const facts = Object.freeze({
  beginner: [
    ["気温", "空気の温かさ・冷たさを表す量", "気象の基礎", "jma"],
    ["気圧", "空気が単位面積を押す力", "気象の基礎", "jma"],
    ["湿度", "空気中の水蒸気の多さを表す割合", "気象の基礎", "jma"],
    ["露点", "空気を冷やしたときに飽和して結露が始まる温度", "気象の基礎", "jma"],
    ["飽和", "空気がその温度で含める最大量の水蒸気を含む状態", "気象の基礎", "jma"],
    ["雲", "空気中で水滴や氷晶が集まって浮かぶもの", "気象の基礎", "jma"],
    ["凝結", "水蒸気が冷えて液体の水滴になる変化", "水の循環", "jma"],
    ["蒸発", "液体の水が水蒸気になる変化", "水の循環", "jma"],
    ["前線", "性質の異なる気団どうしが接する境界", "天気図", "jma"],
    ["高気圧", "周囲より気圧が高く、一般に下降気流が卓越しやすい領域", "天気図", "jma"],
    ["低気圧", "周囲より気圧が低く、一般に上昇気流が生じやすい領域", "天気図", "jma"],
    ["風", "気圧差によって空気が移動する現象", "気象の基礎", "jma"],
    ["海陸風", "昼夜の陸と海の温まり方の差で生じる局地的な風", "局地風", "jma"],
    ["季節風", "季節により卓越方向が変わる広い範囲の風", "大気循環", "jma"],
    ["台風", "北西太平洋で発達した熱帯低気圧", "熱帯気象", "jma"],
    ["雷", "積乱雲などで起こる大気中の放電現象", "気象災害", "jma"],
    ["虹", "太陽光が雨粒で屈折・反射・分散して見える光学現象", "大気光学", "jma"],
    ["気象衛星", "雲や水蒸気などを宇宙から継続観測する人工衛星", "観測", "jma"],
    ["気象レーダー", "電波の反射を利用して降水域を観測する装置", "観測", "jmaRadar"],
    ["アメダス", "気温や降水量、風などを自動観測する地域観測網", "観測", "jma"],
    ["日射", "太陽から地球へ届く電磁放射によるエネルギー", "地球と宇宙", "jma"],
    ["温室効果", "大気が地表からの赤外線の一部を吸収して暖かさに寄与する働き", "気候", "jma"],
    ["地球の自転", "地球が約一日で自らの軸の周りを回る運動", "地球と宇宙", "nasa"],
    ["地球の公転", "地球が太陽の周りを一年かけて回る運動", "地球と宇宙", "nasa"],
    ["月の満ち欠け", "太陽に照らされた月の見える部分が位置関係で変わる現象", "地球と宇宙", "nasa"]
  ],
  intermediate: [
    ["気団", "広い範囲で気温や湿度がほぼ一様な空気のかたまり", "総観気象", "jma"],
    ["温暖前線", "暖かい空気が冷たい空気の上にゆるやかに進む前線", "前線", "jma"],
    ["寒冷前線", "冷たい空気が暖かい空気の下にもぐり込みながら進む前線", "前線", "jma"],
    ["閉塞前線", "寒冷前線が温暖前線に追いついて形成される前線", "前線", "jma"],
    ["停滞前線", "前線がほとんど移動せず同じ地域にとどまる状態", "前線", "jma"],
    ["梅雨前線", "初夏に日本付近で長く停滞しやすい前線", "季節気象", "jma"],
    ["対流圏", "雲や降水など多くの気象現象が起こる大気の最下層", "大気の鉛直構造", "jma"],
    ["成層圏", "対流圏の上にあり、高度とともに気温が上がる層を含む大気層", "大気の鉛直構造", "jma"],
    ["ジェット気流", "対流圏上部付近を吹く非常に強い西向きの帯状の風", "大気循環", "jma"],
    ["偏西風", "中緯度で西から東へ吹く卓越風", "大気循環", "jma"],
    ["エルニーニョ現象", "中部から東部の熱帯太平洋で海面水温が平年より高い状態が続く現象", "海洋と気候", "jma"],
    ["ラニーニャ現象", "中部から東部の熱帯太平洋で海面水温が平年より低い状態が続く現象", "海洋と気候", "jma"],
    ["線状降水帯", "発達した積乱雲が帯状に連なり同じ場所へ大雨をもたらす現象", "大雨", "jma"],
    ["積乱雲", "強い上昇気流で大きく発達し、雷や短時間強雨を伴いやすい雲", "雲と降水", "jma"],
    ["ダウンバースト", "積乱雲からの冷たい下降気流が地上付近で四方に吹き出す現象", "突風", "jma"],
    ["竜巻", "発達した積乱雲などに伴う、激しく回転する空気の柱", "突風", "jma"],
    ["降水確率", "ある時間帯に一定量以上の降水がある確からしさを百分率で表したもの", "予報", "jma"],
    ["降水量", "一定時間に地表へ降った雨や雪を水の深さで表した量", "観測", "jma"],
    ["気圧配置", "高気圧・低気圧・前線などの広がりを示す大気の状態", "天気図", "jma"],
    ["等圧線", "同じ気圧の地点を結んだ天気図上の線", "天気図", "jma"],
    ["赤外画像", "雲頂や地表が放射する赤外線をもとにした気象衛星画像", "衛星観測", "jma"],
    ["水蒸気画像", "主に中上層の水蒸気分布を表現する気象衛星画像", "衛星観測", "jma"],
    ["太陽黒点", "太陽表面で周囲より低温に見える強い磁場をもつ領域", "太陽物理", "nasa"],
    ["太陽風", "太陽から宇宙空間へ絶えず流れ出す荷電粒子の流れ", "宇宙天気", "nasa"],
    ["オーロラ", "磁気圏に導かれた粒子が高層大気と衝突して生じる発光現象", "宇宙天気", "nasa"]
  ],
  advanced: [
    ["相当温位", "水蒸気の凝結で放出される熱も考慮して空気塊の熱的性質を表す量", "熱力学", "jma"],
    ["CAPE", "上昇する空気塊が得られる浮力のエネルギーを表す指標", "熱力学", "jma"],
    ["逆転層", "高度が上がるほど気温が高くなる大気層", "大気の鉛直構造", "jma"],
    ["鉛直シア", "高度による風向や風速の変化", "大気力学", "jma"],
    ["露点温度", "空気を冷却して飽和に達する温度", "熱力学", "jma"],
    ["地衡風", "気圧傾度力とコリオリ力がつり合うときに等圧線にほぼ平行に吹く風", "大気力学", "jma"],
    ["コリオリ力", "地球の自転する座標系で運動する物体が受ける見かけの力", "大気力学", "jma"],
    ["温度風", "上下層の地衡風の差として表される、水平温度傾度と関係する風", "大気力学", "jma"],
    ["渦度", "流れの回転の強さを表す量", "大気力学", "jma"],
    ["可降水量", "大気中の水蒸気がすべて凝結したと仮定したときの水の深さ", "水蒸気", "jma"],
    ["ドップラーレーダー", "反射波の周波数変化を利用して雨粒などの動きも観測するレーダー", "観測", "jmaRadar"],
    ["ブライトバンド", "融解層付近でレーダー反射が強く見える現象", "観測", "jmaRadar"],
    ["数値予報", "大気の物理法則をコンピューターで計算して将来の状態を予測する手法", "予報", "jma"],
    ["データ同化", "観測値と予報モデルを組み合わせて初期状態を改善する手法", "予報", "jma"],
    ["アンサンブル予報", "初期条件などを少しずつ変えた複数の予報で不確実性を評価する手法", "予報", "jma"],
    ["スケール解析", "現象の大きさや時間の尺度を比較して支配的な物理過程を調べる考え方", "大気力学", "jma"],
    ["太陽フレア", "太陽大気で磁気エネルギーが急激に解放され強い電磁放射が生じる現象", "宇宙天気", "nasa"],
    ["コロナ質量放出", "太陽コロナから磁化したプラズマが大量に宇宙空間へ放出される現象", "宇宙天気", "nasa"],
    ["磁気圏", "地球の磁場が太陽風との相互作用で形づくる宇宙空間の領域", "宇宙天気", "nasa"],
    ["電離圏", "太陽放射で原子や分子が電離し、電子とイオンが多い高層大気の領域", "宇宙天気", "nasa"],
    ["地磁気嵐", "太陽風の変化により地球磁場が大きく乱れる現象", "宇宙天気", "noaa"],
    ["Kp指数", "地磁気の乱れの全球的な大きさを0から9で表す指標", "宇宙天気", "noaa"],
    ["電離圏嵐", "電離圏の状態が大きく乱れ、無線通信や測位へ影響し得る現象", "宇宙天気", "noaa"],
    ["放射線嵐", "太陽起源の高エネルギー粒子が増加する宇宙天気現象", "宇宙天気", "noaa"],
    ["GNSS", "衛星からの電波を利用して位置や時刻を求める全球衛星測位システム", "宇宙利用", "nasa"]
  ]
});

const TARGET_COUNTS = Object.freeze({ beginner: 334, intermediate: 333, advanced: 333 });

const templates = Object.freeze([
  (term, definition) => [`次の説明にあてはまる用語はどれですか。${definition}`, "term"],
  (term) => [`「${term}」の説明として最も適切なのはどれですか。`, "definition"],
  (term, definition) => [`${definition}。この現象・概念の名称はどれですか。`, "term"],
  (term) => [`学習カード「${term}」の要点として正しいものはどれですか。`, "definition"],
  (term, definition) => [`${definition}と説明されるのはどれですか。`, "term"],
  (term) => [`「${term}」について正しい記述はどれですか。`, "definition"],
  (term, definition) => [`次のうち、${definition}ものはどれですか。`, "term"],
  (term) => [`気象・宇宙科学でいう「${term}」とは何ですか。`, "definition"],
  (term, definition) => [`${definition}という特徴をもつ用語を選んでください。`, "term"],
  (term) => [`「${term}」を最も適切に説明しているものはどれですか。`, "definition"],
  (term, definition) => [`${definition}。この説明に対応する語はどれですか。`, "term"],
  (term) => [`「${term}」の科学的な意味として適切なのはどれですか。`, "definition"],
  (term, definition) => [`${definition}ことを表す用語はどれですか。`, "term"],
  (term) => [`「${term}」に関する説明として正しいものを選んでください。`, "definition"]
]);

function buildDifficultyQuestions(difficulty, items, target) {
  const questions = [];
  for (let templateIndex = 0; questions.length < target; templateIndex += 1) {
    const template = templates[templateIndex % templates.length];
    for (let index = 0; index < items.length && questions.length < target; index += 1) {
      const [term, definition, topic, sourceKey] = items[index];
      const [question, answerKind] = template(term, definition);
      const sameTopic = items.filter((item, candidateIndex) => candidateIndex !== index && item[2] === topic);
      const fallback = items.filter((item, candidateIndex) => candidateIndex !== index && !sameTopic.includes(item));
      const distractors = [...sameTopic, ...fallback].slice(0, 3);
      const choices = answerKind === "term"
        ? [term, ...distractors.map(([candidate]) => candidate)]
        : [definition, ...distractors.map(([, candidate]) => candidate)];
      const source = sources[sourceKey];
      questions.push(Object.freeze({
        id: `science-${difficulty}-${templateIndex + 1}-${index + 1}`,
        difficulty,
        topic,
        question,
        choices: Object.freeze(choices),
        correctIndex: 0,
        explanation: `正解は「${term}」です。${definition}。`,
        sourceLabel: source.label,
        sourceURL: source.url
      }));
    }
  }
  return questions;
}

export default Object.freeze(Object.entries(facts).flatMap(([difficulty, items]) =>
  buildDifficultyQuestions(difficulty, items, TARGET_COUNTS[difficulty])
));
