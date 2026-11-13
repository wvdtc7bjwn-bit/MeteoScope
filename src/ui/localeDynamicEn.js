// Controlled UI templates only. Source bulletins and user messages must never
// be translated by replacing isolated words inside arbitrary prose.
export function translateDynamicUiEn(text, translate) {
  let match;
  if ((match = text.match(/^(縦長|正方形|横長)\s+(\d+)\s*×\s*(\d+)px(?:・(\d+)地点掲載)?$/u))) return `${({縦長:"Portrait", 正方形:"Square", 横長:"Landscape"})[match[1]]} ${match[2]} × ${match[3]}px${match[4] ? ` · ${match[4]} stations included` : ""}`;
  if ((match = text.match(/^実況・(高い順|低い順)\s+(\d+)地点$/u))) return `Current · ${match[1] === "高い順" ? "Highest first" : "Lowest first"} · ${match[2]} stations`;
  if ((match = text.match(/^(.+)の再現時刻$/u))) return `Replay time for ${translate(match[1])}`;
  if ((match = text.match(/^([56])(弱|強)$/u))) return `${match[1]}${match[2] === "弱" ? "−" : "+"}`;
  if ((match = text.match(/^(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)(?:頃|ごろ)?発生$/u))) return `Occurred ${match[1]} JST`;
  if ((match = text.match(/^深さ\s*(\d+(?:\.\d+)?)\s*km$/u))) return `Depth ${match[1]} km`;
  if ((match = text.match(/^(\d+(?:\.\d+)?)時間予想$/u))) return `${match[1]}-hour forecast`;
  if ((match = text.match(/^(アジア太平洋|アジア|極東|北太平洋|北半球|日本)\s+([\d・hPa地上]+)(予報)?$/u))) return `${({アジア太平洋:"Asia–Pacific",アジア:"Asia",極東:"Far East",北太平洋:"North Pacific",北半球:"Northern Hemisphere",日本:"Japan"})[match[1]]}: ${match[2].replace("地上", "surface").replaceAll("・", " / ")}${match[3] ? " forecast" : ""}`;
  if ((match = text.match(/^(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})(発生|発表) · (.+?)(（期限切れの資料）|（解除・取消の資料）)?$/u))) return `${match[2] === "発生" ? "Occurred" : "Issued"} ${match[1]} JST · ${translate(match[3])}${match[4] ? ` ${translate(match[4])}` : ""}`;
  if ((match = text.match(/^(最新の地震|選択した地震)で(.+)の観測震度は？$/u))) return `What intensity was observed in ${translate(match[2])} in the ${match[1] === "最新の地震" ? "latest" : "selected"} earthquake?`;
  if ((match = text.match(/^([A-Za-z][A-Za-z .,()'-]*)(北部|南部|東部|西部|中部)$/u))) return `${translate(match[2])}, ${match[1].trim()}`;
  if ((match = text.match(/^(\d{1,2})時$/u))) return `${match[1].padStart(2, "0")}:00`;
  if (/^\d{4}年[\d年月日・〜～約間\s]+$/u.test(text)) return text.replace(/年/gu, "/").replace(/月/gu, "/").replace(/日/gu, "").replace(/[〜～]/gu, "–").replace(/・/gu, " & ").replace(/約(\d+)\/間/u, "about $1 years").replace(/\/(?:–|$)/gu, value => value.endsWith("–") ? "–" : "");
  if ((match = text.match(/^基本雲形 (\d+) \/ (\d+) ・ 専門分類 (\d+) \/ (\d+)$/u))) return `Genera ${match[1]} / ${match[2]} · Detailed classes ${match[3]} / ${match[4]}`;
  if ((match = text.match(/^(\d[\d,]*)地域$/u))) return `${match[1]} areas`;
  if ((match = text.match(/^(.+)\s*[（(](南岳山頂火口|昭和火口|新燃岳|硫黄山)[）)]$/u))) return `${translate(match[1].trim())} (${({南岳山頂火口: "Minamidake summit crater", 昭和火口: "Showa crater", 新燃岳: "Shinmoedake", 硫黄山: "Ioyama"})[match[2]]})`;
  if ((match = text.match(/^位置情報オフ。週間天気予報を開く$/u))) return "Location off. Open weekly forecast";
  if ((match = text.match(/^震度\s*([0-7](?:弱|強|[-+])?)以上$/u))) return `Intensity ${match[1].replace("弱", "−").replace("強", "+")} or higher`;
  if ((match = text.match(/^(過去の地震|震央分布|震源近傍・震度3以上)・(.+)$/u))) return `${translate(match[1])} · ${match[2].split("・").map(translate).join(" · ").replaceAll("〜", "–")}`;
  if ((match = text.match(/^(対象時刻|表示時刻|更新時刻)\s*[:：]\s*(.+)$/u))) return `${({対象時刻: "Valid time", 表示時刻: "Display time", 更新時刻: "Updated"})[match[1]]}: ${translate(match[2])}`;
  if ((match = text.match(/^地図上の観測点をタップすると、(.+)を表示します。$/u))) return `Tap a station on the map to view ${translate(match[1]).toLowerCase()}.`;
  if ((match = text.match(/^(平年最高|平年最低)\s*(.+)$/u))) return `${match[1] === "平年最高" ? "Normal high" : "Normal low"} ${match[2]}`;
  if ((match = text.match(/^(最低|最高)(気温|湿度|気圧|積雪量|Humidity|Pressure|Snow depth)?\s*(.+)$/u))) return `${match[1] === "最低" ? "Low" : "High"}${match[2] ? ` ${translate(match[2]).toLowerCase()}` : ""} ${match[3]}`;
  if ((match = text.match(/^解析対象：(.+?)（日本時間）\s*(.+)$/u))) return `Analysis event: ${match[1]} JST · ${translate(match[2])}`;
  if ((match = text.match(/^セントロイド時刻：(.+?)（日本時間）(?:\s*／\s*深さ(.+))?$/u))) return `Centroid time: ${match[1]} JST${match[2] ? ` / Depth ${match[2]}` : ""}`;
  if ((match = text.match(/^北 ↑ ・東 → ／ (青|黒)：押し、白：引き。(USGS|気象庁)の(.+)。下半球等積投影。$/u))) return `N ↑ · E → / ${match[1] === "青" ? "Blue" : "Black"}: compression; white: dilatation. Rendered from ${match[2] === "気象庁" ? "JMA" : "USGS"} ${match[3].includes("モーメントテンソル") ? "moment tensor (full tensor)" : "nodal planes (double-couple component)"}. Lower-hemisphere equal-area projection.`;
  if ((match = text.match(/^下半球等積投影の発震機構図。上が北、右が東。(青|黒)は押し、白は引き。$/u))) return `Lower-hemisphere equal-area focal mechanism. North up, east right. ${match[1] === "青" ? "Blue" : "Black"}: compression; white: dilatation.`;
  if ((match = text.match(/^プレート境界：(.+?)。断面は(囲み範囲|表示範囲)内の(.+)に沿う簡易表示で、プレート境界そのものの断面ではありません。$/u))) return `${translate(`プレート境界：${match[1]}`)}. This simplified section follows ${translate(match[3]).toLowerCase()} within the ${match[2] === "囲み範囲" ? "selected" : "visible"} area; it is not a cross-section of the plate boundary itself.`;
  if ((match = text.match(/^(囲み範囲|表示範囲)の地震解析$/u))) return `Earthquake analysis · ${match[1] === "囲み範囲" ? "Selected area" : "Visible area"}`;
  if ((match = text.match(/^相対湿度\s*(.+)$/u))) return `Relative humidity ${match[1]}`;
  if ((match = text.match(/^露点差\s*(.+)$/u))) return `Dew-point depression ${match[1]}`;
  if ((match = text.match(/^地上気温 (.+?)℃、露点差 (.+?)℃です。露点差が小さいほど、地上付近の空気は湿っています。$/u))) return `Surface temperature ${match[1]}°C; dew-point depression ${match[2]}°C. A smaller depression indicates moister near-surface air.`;
  if ((match = text.match(/^約 (.+) の湿りの目安です。露点差が小さいほど、この高度で飽和に近い状態を示します。$/u))) return `Moisture near ${match[1]}. A smaller dew-point depression indicates air closer to saturation at this height.`;
  if ((match = text.match(/^この層では高度とともに気温が (.+?)℃ 上がっています。霧・低い雲・煙霧などをみる際の一材料になります。$/u))) return `Temperature rises by ${match[1]}°C with height in this layer. This is one factor to consider when assessing fog, low clouds or haze.`;
  if ((match = text.match(/^約\s+(.+)$/u))) return `Approx. ${translate(match[1]).replaceAll("〜", "–")}`;
  if ((match = text.match(/^(\d[\d,]*)時点$/u))) return `${match[1]} times`;
  if ((match = text.match(/^(\d+)層(?:・(.+)まで)?$/u))) return `${match[1]} levels${match[2] ? ` · up to ${match[2]}` : ""}`;
  if ((match = text.match(/^(\d+)\s*cm以上$/u))) return `${match[1]} cm or more`;
  if ((match = text.match(/^(\d+)時間後$/u))) return `+${match[1]} hours`;
  if ((match = text.match(/^(\d+)[〜–](\d+)時間後$/u))) return `+${match[1]}–${match[2]} hours`;
  if ((match = text.match(/^(\d+)分$/u))) return `${match[1]} min`;
  if ((match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日[〜～](?:(\d{1,2})月)?(\d{1,2})日$/u))) return `${match[1]}/${match[2]}/${match[3]}–${match[4] ? `${match[4]}/` : ""}${match[5]}`;
  // JMA archive titles have a fixed wrapper; translate the event name as a unit.
  if ((match = text.match(/^(?:令和|平成|昭和)\d+年\((\d{4})年\)\s*(.+?)の事例[（(](.+)[）)]$/u))) {
    const date = match[2].replace(/(\d+)月/gu, "$1/").replace(/日/gu, "").replace(/[〜～]/gu, "–");
    return `${match[1]}/${date} · ${translate(match[3])}`;
  }
  if ((match = text.match(/^台風第(\d+)号と前線による大雨$/u))) return `Heavy rain from Typhoon No. ${match[1]} and a front`;
  if (text === "低気圧と前線による大雨") return "Heavy rain from a low-pressure system and a front";
  if ((match = text.match(/^(.+)を中心$/u))) return `Mainly ${translate(match[1])}`;
  if (text.includes("・") && text.split("・").every(part => !/[。]/u.test(part) && !/[ぁ-んァ-ヶ一-龯]/u.test(translate(part)))) return text.split("・").map(translate).join(" · ");
  return null;
}
