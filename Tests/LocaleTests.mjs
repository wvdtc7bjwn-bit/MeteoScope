import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localizeText, localizeVolcanoText } from "../src/ui/locale.js";
import { TIDE_STATION_NAME_TRANSLATIONS } from "../src/ui/tideStationNamesEn.js";

const cases = new Map([
  ["最大震度", "Max."],
  ["発表中の警報・注意報", "Active warnings and advisories"],
  ["雷注意報", "Thunderstorm Advisory"],
  ["種別", "Type"],
  ["土砂災害", "Landslide"],
  ["濃霧", "Dense fog"],
  ["00時-03時", "00:00–03:00"],
  ["今後の見通し", "Outlook"],
  ["乾燥", "Dry air"],
  ["瀬戸内側", "Seto Inland Sea side"],
  ["気温", "Temperature"],
  ["気温未発表", "Temperature unavailable"],
  ["奈良地方気象台", "Nara Local Meteorological Office"],
  ["積雪量", "Snow depth"],
  ["プレート等深線", "Depth contours"],
  ["晴時々曇", "Sunny, occasionally cloudy"],
  ["曇時々晴", "Cloudy, occasionally sunny"],
  ["晴れ時々くもり", "Sunny, occasionally cloudy"],
  ["くもり時々晴れ", "Cloudy, occasionally sunny"],
  ["雨で暴風を伴う", "Rain with storm"],
  ["雪一時みぞれ", "Snow, briefly sleet"],
  ["西北西 20 km/h", "WNW 20 km/h"],
  ["活動度4", "Activity level 4"],
  ["現在地へ移動。長押しで現在地マーカーを非表示", "Move to current location. Press and hold to hide the location marker"],
  ["現在地へ移動。長押しで現在地マーカーを表示", "Move to current location. Press and hold to show the location marker"],
  ["津波注意報を解除しました。", "The tsunami advisory has been lifted."],
  ["観測点を選択してください", "Select an observation station"],
  ["現在地と凡例を活用する", "Use your location and the map legend"],
  ["現在地の様子を投稿", "Report local conditions"],
  ["現在地の発表状況", "Local warnings"],
  ["表示する日付", "Display date"],
  ["東京都の潮位と警報基準", "Tokyo tide levels and warning thresholds"],
  ["気象庁 潮位観測", "JMA tide observations"],
  ["新潟西港", "Niigata West Port"],
  ["港湾局 / 7/31 09:29", "Port authority / 7/31 09:29"],
  ["現在地付近の警報・注意報", "Near current location warnings and advisories"],
  ["偏差 +15cm", "Anomaly +15cm"],
  ["実測潮位", "Observed tide"],
  ["天文潮位", "Predicted tide"],
  ["実測", "Observed"],
  ["天文", "Predicted"],
  ["レベル4基準", "Level 4 threshold"],
  ["レベル5基準", "Level 5 threshold"],
  ["レベル4危険警報基準", "Level 4 danger-warning threshold"],
  ["レベル5特別警報基準", "Level 5 emergency-warning threshold"],
  ["レベル5特別警報基準 190cm", "Level 5 emergency-warning threshold 190cm"],
  ["レベル4危険警報基準 140cm", "Level 4 danger-warning threshold 140cm"],
  ["過去最高潮位 192cm", "Historical maximum tide level 192cm"],
  ["潮位偏差", "Tide anomaly"],
  ["実測潮位 − 天文潮位", "Observed tide − predicted tide"],
  [
    "観測値は速報値です。機器や通信の状態により異常値を含む場合があります。",
    "Observations are preliminary and may include anomalies caused by equipment or communication conditions."
  ],
  ["収録90日間の日別総地震回数", "Daily earthquake count for 90 recorded days"],
  ["各国予想・6モデル・発達候補30件", "Global forecasts · 6 models · 30 development candidates"],
  ["伊豆諸島北部", "Northern Izu Islands"],
  ["管理者", "Administrator"],
  ["会津", "Aizu"],
  ["中通り", "Nakadori"],
  ["浜通り", "Hamadori"],
  ["沿岸南部", "Southern Coast"],
  ["中・西部", "Central and Western Area"],
  ["宗谷地方", "Soya Region"],
  ["天売焼尻", "Teuri and Yagishiri"],
  ["飛騨地方", "Hida Region"],
  ["隠岐", "Oki Islands"],
  ["中予", "Chuyo"],
  ["南部平野部", "Southern Plains"],
  ["鹿児島県（奄美地方除く）", "Kagoshima Prefecture (excluding Amami)"],
  ["石狩・空知・後志地方", "Ishikari, Sorachi and Shiribeshi Region"],
  ["現在地・早期注意情報", "Current location · Early warning information"],
  ["現在地・指定河川洪水予報", "Current location · Designated river flood forecast"],
  ["現在地周辺の指定河川情報はありません。", "No designated river flood information is available near your current location."],
  ["指定河川洪水予報", "Designated river flood forecast"],
  ["現在、指定河川洪水予報は発表されていません", "No designated river flood forecast is currently in effect."],
  ["観測所の水位実況・予測", "Observed and forecast river levels"],
  ["流域雨量", "Basin rainfall"],
  ["氾濫により浸水が想定される地区", "Areas expected to flood"],
  ["レベル5 氾濫特別警報・発生情報", "Level 5 Flood emergency warning / occurrence information"],
  ["レベル4 氾濫危険警報", "Level 4 Flood danger warning"],
  ["レベル3 氾濫警報", "Level 3 Flood warning"],
  ["レベル2 氾濫注意報", "Level 2 Flood advisory"],
  ["早期注意情報（警報級の可能性）", "Early warning information (potential for warning-level conditions)"],
  ["期間別の可能性", "Potential by period"],
  ["早期注意情報は発表されていません", "No early warning information is currently in effect."],
  ["現在地に発表中の早期注意情報はありません。", "No early warning information is currently in effect for your location."],
  ["災害切迫", "Imminent disaster"],
  ["今後の情報等に留意", "Monitor further information"],
  ["土砂キキクル", "Landslide Risk Map"],
  ["浸水キキクル", "Flood Risk Map"],
  ["現在地を確認しています", "Checking current location"],
  ["気象庁の最新予報を読み込んでいます。", "Loading the latest JMA forecast."],
  ["更新時刻: 未取得", "Updated: Unavailable"],
  ["表示レイヤー", "Layer"],
  ["土砂", "Landslide"],
  ["浸水", "Flooding"],
  ["波浪", "High waves"],
  ["火山防災情報", "Volcano safety information"],
  ["警戒範囲の目安", "Approximate precaution area"],
  ["レベル別の行動", "Actions by alert level"],
  ["噴火警戒レベル2", "Volcanic Alert Level 2"],
  ["火山の状況に関する解説情報（第31号）", "Volcano activity commentary (No. 31)"],
  ["桜島", "Sakurajima"],
  ["霧島山（新燃岳）", "Kirishimayama (Shinmoedake)"],
  ["阿武火山群", "Abu Volcanoes"],
  ["由布岳", "Yufudake"],
  ["鳴子", "Naruko"],
  ["伊豆東部火山群", "Izu-Tobu Volcanoes"],
  ["海徳海山", "Kaitoku Seamount"],
  ["火口内", "Inside the crater"]
]);

assert.equal(TIDE_STATION_NAME_TRANSLATIONS.size, 166);
for (const [japanese, english] of TIDE_STATION_NAME_TRANSLATIONS) {
  assert.equal(localizeText(japanese, "en"), english, `tide station: ${japanese}`);
  assert.doesNotMatch(english, /[\u3040-\u30ff\u3400-\u9fff]/u, `tide station English: ${japanese}`);
}

for (const [japanese, expected] of cases) {
  assert.equal(localizeText(japanese, "en"), expected, japanese);
  assert.equal(localizeText(japanese, "ja"), japanese, `${japanese} should remain Japanese`);
}

assert.equal(
  localizeText("気象庁の雷活動度と、直前5分間の落雷・雲放電を地図上に重ねています。観測位置には誤差や未検知が生じる場合があります。", "en"),
  "Overlaying JMA lightning activity and cloud-to-ground and cloud discharges from the previous five minutes. Locations may contain errors and some discharges may not be detected."
);

assert.equal(
  localizeText("\u718a\u672c\u5357\u533a\u57ce\u5357\u753a\uff0a", "en"),
  "Kumamoto Minami-ku Jonan"
);
assert.equal(
  localizeText("\u718a\u672c\u5357\u533a", "en"),
  "Kumamoto Minami-ku"
);
assert.equal(
  localizeText("\u672d\u5e4c\u4e2d\u592e\u533a\u5317\uff12\u6761", "en"),
  "Sapporo Chuo-ku station"
);
assert.equal(
  localizeText("\u82a6\u5317\u753a\u82a6\u5317", "en"),
  "Ashikita"
);
assert.equal(
  localizeText("\u82a6\u5317\u753a\u7530\u6d66\u753a\uff0a", "en"),
  "Ashikita"
);
assert.equal(
  localizeText("\u516b\u4ee3\u5e02\u5e73\u5c71\u65b0\u753a", "en"),
  "Yatsushiro City Hirayama-shinmachi"
);
assert.equal(
  localizeText("\u9e7f\u5150\u5cf6\u7a7a\u6e2f", "en"),
  "Kagoshima Airport"
);
assert.equal(
  localizeText("\u85a9\u6469\u5ddd\u5185\u5e02", "en"),
  "Satsumasendai City"
);
assert.equal(
  localizeText("\u9e7f\u5150\u5cf6\u770c\u85a9\u6469\u5730\u65b9", "en"),
  "Satsuma Region, Kagoshima Prefecture"
);
assert.equal(localizeText("かつらぎ", "en"), "Katsuragi");
assert.equal(localizeText("熊本県熊本地方", "en"), "Kumamoto Region");
assert.equal(
  localizeText("\u718a\u672c\u770c", "en"),
  "Kumamoto Prefecture"
);
assert.equal(
  localizeVolcanoText(
    "次の火山の状況に関する解説情報は、31日（金）16時頃に発表の予定です。なお、火山活動の状況に変化があった場合には、随時お知らせします。",
    "",
    "en"
  ),
  "The next volcano activity commentary is scheduled for around 16:00 on the 31st. Updates may be issued sooner if volcanic activity changes."
);
assert.equal(
  localizeVolcanoText(
    "岩手山では火山性地震が観測されています。",
    "Detailed volcanic activity is available in the original JMA bulletin.",
    "en"
  ),
  "Detailed volcanic activity is available in the original JMA bulletin."
);
assert.equal(
  localizeVolcanoText(
    "火山性地震は概ね少なく経過しています。",
    "",
    "en"
  ),
  "Volcanic earthquake activity has generally remained low."
);
assert.equal(
  localizeVolcanoText(
    "噴火が発生し、噴煙が火口縁上の高さ約２００ｍまで上がりました。その後、新たな噴火は発生していません。",
    "",
    "en"
  ),
  "The bulletin describes an eruption in the source text. The bulletin also states that no new eruption was observed for a period described in the source text. The volcanic plume rose to about 200 m above the crater rim."
);
assert.equal(
  localizeVolcanoText(
    "火山ガス（二酸化硫黄）の放出量は、１日あたり１００トンで、前回は１日あたり２００トンでした。",
    "",
    "en"
  ),
  "Sulfur dioxide emission measurements cited in the bulletin include 100 tons per day and 200 tons per day."
);
assert.equal(
  localizeVolcanoText(
    "火口から約５００ｍの範囲では、大きな噴石に警戒してください。危険な地域には立ち入らないでください。風下側では火山灰に注意してください。",
    "",
    "en"
  ),
  "Beware of large ballistic rocks around the crater. Do not enter hazardous areas; follow instructions from local authorities. Downwind areas may be affected by volcanic ash and small rocks."
);
assert.equal(
  localizeVolcanoText(
    "次の火山の状況に関する解説情報は、３１日（金）１６時頃に発表の予定です。なお、火山活動の状況に変化があった場合には、随時お知らせします。",
    "",
    "en"
  ),
  "The next volcano activity commentary is scheduled for around 16:00 on the 31st. Updates may be issued sooner if volcanic activity changes."
);
assert.equal(
  localizeVolcanoText(
    "火口から概ね１ｋｍの範囲に影響を及ぼす噴火が発生する可能性があります。",
    "",
    "en"
  ),
  "An eruption could affect an area within about 1 km of the crater."
);
assert.doesNotMatch(
  localizeVolcanoText(
    "火砕流は観測されていません。",
    "Detailed volcanic activity is available in the original JMA bulletin.",
    "en"
  ),
  /Stay alert/u
);
assert.doesNotMatch(
  localizeVolcanoText(
    "今後、噴火が発生する可能性があります。",
    "",
    "en"
  ),
  /describes an eruption/u
);

const volcanoFixture = JSON.parse(await readFile(
  new URL("../public/data/jma-volcano-latest-info.json", import.meta.url),
  "utf8"
));
const actualEruptionPattern = /(?:噴火を確認しました|噴火を観測しました|噴火が発生(?:しました|した(?:と推定されます)?|し[、て]|しています))/u;
const hypotheticalEruptionPattern = /(?:発生する可能性|発生するおそれ|発生した場合|発生が予想|警戒してください)/u;
let auditedVolcanoFields = 0;

for (const report of volcanoFixture.reports ?? []) {
  for (const field of ["headline", "volcanoHeadline", "activity", "prevention", "nextAdvisory"]) {
    const source = String(report?.[field] ?? "").trim();
    if (!source) continue;
    auditedVolcanoFields += 1;
    const summary = localizeVolcanoText(
      source,
      "See the original JMA bulletin for the complete information.",
      "en"
    );
    assert.ok(summary, `${report.volcanoName ?? report.volcanoCode} ${field} should produce a summary`);
    assert.doesNotMatch(
      summary,
      /[\u3040-\u30ff\u3400-\u9fff]/u,
      `${report.volcanoName ?? report.volcanoCode} ${field} should not retain Japanese text`
    );
    const summarySentences = summary
      .split(/(?<=[.!?])\s+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    assert.equal(
      new Set(summarySentences).size,
      summarySentences.length,
      `${report.volcanoName ?? report.volcanoCode} ${field} should not repeat summary sentences`
    );
    const reportsActualEruption = source
      .split(/[。\n]/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .some((sentence) =>
        actualEruptionPattern.test(sentence) && !hypotheticalEruptionPattern.test(sentence)
      );
    if (!reportsActualEruption) {
      assert.doesNotMatch(
        summary,
        /describes an eruption/u,
        `${report.volcanoName ?? report.volcanoCode} ${field} must not turn a hypothetical eruption into an observed eruption`
      );
    }
  }
}

console.log(`Locale tests passed (${cases.size + 21} cases, ${auditedVolcanoFields} live volcano fields audited).`);
