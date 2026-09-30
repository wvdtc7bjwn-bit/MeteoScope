const genera = [
  {
    name: "巻雲", latin: "Cirrus", code: "Ci", family: "上層雲", height: "およそ5〜13 km（中緯度の目安）", shape: "cirrus",
    appearance: "細い繊維、釣り針状の先端、または白い房として現れる。雲片は分離して見え、影はほとんど作らない。",
    process: "上層の氷晶雲。強い風で繊維が伸びたり、対流雲の頂部から広がったりする。濃密なものは積乱雲のかなとこ由来のことがある。",
    weather: "前線や低気圧接近の初期に増えることがあるが、巻雲だけで天気変化を断定できない。風向・雲量の時間変化と併せて観察する。",
    distinguish: "巻層雲は空を広く覆う薄い膜状。巻積雲は粒や波の列が見える。"
  },
  {
    name: "巻積雲", latin: "Cirrocumulus", code: "Cc", family: "上層雲", height: "およそ5〜13 km（中緯度の目安）", shape: "cirrocumulus",
    appearance: "白い粒や小さな雲片が群れ、列や波状に並ぶ。個々の要素は腕を伸ばした先の指幅より小さく、通常は陰影が目立たない。",
    process: "上層の氷晶、または過冷却水滴からなる。波状・レンズ状の流れや、巻雲・巻層雲の変形で生じる。",
    weather: "上層の湿りや波動を示す。魚のうろこ状に見えても、それだけで雨の前兆とはいえない。",
    distinguish: "要素が大きく陰影を伴う高積雲とは、雲片の見かけの幅と高度で区別する。"
  },
  {
    name: "巻層雲", latin: "Cirrostratus", code: "Cs", family: "上層雲", height: "およそ5〜13 km（中緯度の目安）", shape: "cirrostratus",
    appearance: "空を薄く覆う白いベール。太陽や月が透け、氷晶による22度ハロや幻日を伴うことがある。",
    process: "広い範囲で上層が湿ると形成される氷晶雲。温暖前線前面で厚さ・雲量が増す場合がある。",
    weather: "前線性雲域の接近を示すことがある。ハロは氷晶の光学現象で、降水開始時刻を直接示すものではない。",
    distinguish: "巻雲の細い筋より連続した膜状。高層雲は厚く、太陽がすりガラス越しのようにぼやける。"
  },
  {
    name: "高積雲", latin: "Altocumulus", code: "Ac", family: "中層雲", height: "およそ2〜7 km（中緯度の目安）", shape: "altocumulus",
    appearance: "白〜灰色の丸みを帯びた雲片や層。雲片は巻積雲より大きく、陰影が見えることが多い。",
    process: "中層の水滴・氷晶の雲。波状、レンズ状、塔状など複数の種・変種をとる。",
    weather: "塔状の高積雲（castellanus）は中層の対流不安定を示すことがある。上空の湿度・風や下層の状態を確認して判断する。",
    distinguish: "積雲は通常、雲底がそろった独立した鉛直発達。層積雲はより低く、雲片が大きい。"
  },
  {
    name: "高層雲", latin: "Altostratus", code: "As", family: "中層雲", height: "およそ2〜7 km（中緯度の目安）", shape: "altostratus",
    appearance: "灰色〜青灰色の広い層。太陽はすりガラス越しのように見え、通常は明瞭なハロを作らない。",
    process: "広域上昇流で中層の雲層が発達・厚化して形成される。厚くなると下層雲を伴うことがある。",
    weather: "前線に伴う持続性降水の前段階となり、乱層雲へ移ることがある。雲底の低下と降水の有無を追う。",
    distinguish: "巻層雲より不透明で、太陽の輪郭がぼやける。乱層雲はさらに厚く、広い降水域を伴いやすい。"
  },
  {
    name: "乱層雲", latin: "Nimbostratus", code: "Ns", family: "中層雲・鉛直発達雲", height: "雲頂は中層〜上層、雲底は低層に達することがある", shape: "nimbostratus",
    appearance: "空を広く覆う厚い暗灰色の雲層。太陽は見えにくく、雲底にはちぎれ雲（pannus）が現れることがある。",
    process: "大規模な上昇流で厚い雲域が維持され、雲粒・氷晶が成長して降水に至る。",
    weather: "広域で比較的持続する雨や雪と結び付きやすい。積乱雲のような短時間の強い対流性降水とは時間・空間構造が異なる。",
    distinguish: "積乱雲の雷雨・急な強雨より、層状で持続する降水が特徴。"
  },
  {
    name: "層積雲", latin: "Stratocumulus", code: "Sc", family: "下層雲", height: "地表付近〜およそ2 km（中緯度の目安）", shape: "stratocumulus",
    appearance: "低い位置に広がる灰白色の塊状・ロール状の層。雲片の幅は比較的大きく、隙間があることも多い。",
    process: "境界層の乱流や弱い対流、前線通過後の寒気、地形の影響などで形成される。",
    weather: "曇天が続くことがあるが、通常は降水が弱い。厚い雲域では弱い雨や雪を伴う。",
    distinguish: "層雲より塊状の凹凸が明瞭。高積雲より低く、雲片が大きい。"
  },
  {
    name: "層雲", latin: "Stratus", code: "St", family: "下層雲", height: "地表付近〜およそ2 km（中緯度の目安）", shape: "stratus",
    appearance: "低い高度に一様に広がる灰色の雲層。地面に接すると霧として観測される。",
    process: "夜間の放射冷却、湿った空気の移流、弱い上昇流などで下層が飽和してできる。",
    weather: "霧雨や弱い雪を伴うことがある。視程への影響は雲底高度と地表の霧の有無で大きく変わる。",
    distinguish: "層積雲のような大きな雲塊の起伏が少なく、比較的なめらかな一様層。"
  },
  {
    name: "積雲", latin: "Cumulus", code: "Cu", family: "鉛直発達雲", height: "雲底は低層、雲頂は発達度により上昇", shape: "cumulus",
    appearance: "離れて浮かぶ輪郭のはっきりした雲塊。底は比較的平らで、日射下では上部がカリフラワー状に盛り上がる。",
    process: "地表加熱や地形による浮力上昇で発生。humilis、mediocris、congestusなど鉛直発達の段階を種で表す。",
    weather: "小さい積雲は降水を伴わないことが多い。congestusまで発達するとにわか雨や雷雨へ進む可能性がある。",
    distinguish: "層積雲は横に広い雲塊の集合。積雲は独立した上昇流と平らな雲底が目立つ。"
  },
  {
    name: "積乱雲", latin: "Cumulonimbus", code: "Cb", family: "鉛直発達雲", height: "雲底は低層、雲頂は対流圏界面付近に達することがある", shape: "cumulonimbus",
    appearance: "大きく発達した塔状の雲。成熟すると上部がかなとこ（incus）状に広がり、雲底は暗く、降水軸や乳房雲を伴う場合がある。",
    process: "強い浮力と水蒸気供給による深い対流。氷相を含む混合相雲で、上昇流・下降流が共存する。",
    weather: "雷、突風、雹、短時間強雨、局地的な突風などを伴う可能性がある。雲から離れていても雷や突風の影響に注意する。",
    distinguish: "雲頂のかなとこ、急な鉛直発達、雷活動などが手掛かり。見た目だけで危険度や発生位置を断定しない。"
  }
];

const terms = [
  { category: "種", name: "繊維状", latin: "fibratus", applies: "巻雲・巻層雲", detail: "ほぼ直線または緩く湾曲した繊維が、互いに交差せず伸びる形。巻雲の基本的な形態のひとつ。" },
  { category: "種", name: "鉤状", latin: "uncinus", applies: "巻雲", detail: "先端が鉤や房状に曲がった巻雲。上層風による氷晶の流れを示すが、単独で前線位置を決めることはできない。" },
  { category: "種", name: "濃密", latin: "spissatus", applies: "巻雲", detail: "雲体が厚く、太陽を部分的に隠すほど濃い巻雲。積乱雲のかなとこ由来で現れることもある。" },
  { category: "種", name: "塔状", latin: "castellanus", applies: "高積雲・巻積雲", detail: "共通の基底から塔や小櫓のような突起が立ち並ぶ形。中層に現れる場合は対流不安定の観測サインとなる。" },
  { category: "種", name: "房状", latin: "floccus", applies: "巻雲・巻積雲・高積雲", detail: "小さな房や綿くず状の雲片で、基部が比較的水平となり、下に尾流雲を伴うことがある。" },
  { category: "種", name: "層状", latin: "stratiformis", applies: "巻積雲・高積雲・層積雲", detail: "雲片が広がり、層またはシート状に見える形。雲塊が群れる場合も空を一様に覆う場合もある。" },
  { category: "種", name: "霧状", latin: "nebulosus", applies: "巻層雲・層雲", detail: "明瞭な個々の雲要素や輪郭がなく、霧・ベールのように一様な形。" },
  { category: "種", name: "レンズ状", latin: "lenticularis", applies: "巻積雲・高積雲・層積雲", detail: "レンズや木の葉に似た輪郭。山岳波の定在波で山の風下に形成されることがあり、雲自体が静止して見えても風は強い場合がある。" },
  { category: "種", name: "断片状", latin: "fractus", applies: "層雲・積雲", detail: "不規則にちぎれた小雲片。降水雲の下にできる場合と、積雲・層雲の崩れた部分とがある。" },
  { category: "種", name: "扁平積雲", latin: "humilis", applies: "積雲", detail: "横幅に比べて鉛直の厚みが小さい積雲。晴天時の対流雲の典型だが、雲底高度や環境で意味は変わる。" },
  { category: "種", name: "並積雲", latin: "mediocris", applies: "積雲", detail: "中程度の鉛直発達を示す積雲。上部の盛り上がりが明瞭だが、通常は著しい繊維状の氷雲頂を持たない。" },
  { category: "種", name: "雄大積雲", latin: "congestus", applies: "積雲", detail: "強い鉛直発達を示す積雲で、上部はカリフラワー状。シャワー性降水を生むことがあり、さらに発達すれば積乱雲へ移行する。" },
  { category: "種", name: "ロール状", latin: "volutus", applies: "高積雲・層積雲", detail: "水平な軸を持つ長い円筒状の雲塊が、母雲から分離して見える形。棚雲（arcus）とは分類が異なる。" },
  { category: "種", name: "無毛状", latin: "calvus", applies: "積乱雲", detail: "氷晶雲の毛羽立ちがまだ目立たない若い積乱雲。頂部の輪郭は丸みを保つことがある。" },
  { category: "種", name: "毛状", latin: "capillatus", applies: "積乱雲", detail: "上部に明瞭な繊維状・筋状の氷晶雲が広がる成熟した積乱雲。かなとこを伴うことが多い。" },
  { category: "変種", name: "放射状", latin: "radiatus", applies: "複数の雲形", detail: "ほぼ平行な雲帯が遠近法で一点に収束して見える配置。実際の雲列は広い範囲に延びている。" },
  { category: "変種", name: "脊椎状", latin: "vertebratus", applies: "巻雲", detail: "主軸の両側に雲片が配置され、魚の骨格のような形を作る。" },
  { category: "変種", name: "もつれ状", latin: "intortus", applies: "巻雲", detail: "巻雲の繊維が不規則に曲がり、絡み合うように見える配置。" },
  { category: "変種", name: "二重層状", latin: "duplicatus", applies: "巻雲・高積雲・高層雲", detail: "同じ種の雲が上下に複数の層として重なる配置。風向・風速が高度で異なる場の手掛かりになる。" },
  { category: "変種", name: "波状", latin: "undulatus", applies: "複数の雲形", detail: "雲層に波紋状の起伏が繰り返し現れる。安定層付近の波動や風のシアーで形成される。" },
  { category: "変種", name: "穴あき状", latin: "lacunosus", applies: "巻積雲・高積雲", detail: "薄い雲層に丸い穴や網目状の隙間が並ぶ。雲粒の凍結・沈降などに関係するが、成因は状況により異なる。" },
  { category: "変種", name: "透光状", latin: "translucidus", applies: "高積雲・高層雲・層積雲", detail: "雲層の薄い部分を通して太陽・月の位置が分かるほど透ける。" },
  { category: "変種", name: "半透明雲片状", latin: "perlucidus", applies: "高積雲・層積雲", detail: "雲片の間に明瞭な隙間があり、その隙間から空や太陽・月が見える。" },
  { category: "変種", name: "不透明状", latin: "opacus", applies: "高積雲・高層雲・層積雲", detail: "雲層が厚く、太陽・月の位置が雲を通して分からない。" },
  { category: "付随雲・特殊形", name: "棚雲", latin: "arcus", applies: "主に積乱雲・強い対流雲", detail: "雲の前縁に沿う低く水平な弧状の雲。冷気外出流と周囲の暖湿気流の境界に形成されることがある。" },
  { category: "付随雲・特殊形", name: "波状雲（アスペリタス）", latin: "asperitas", applies: "主に高積雲・層積雲", detail: "雲底が荒れた海面のような不規則な波状面を示す。見た目は印象的だが、形だけで地上の荒天を意味しない。" },
  { category: "付随雲・特殊形", name: "尾雲", latin: "cauda", applies: "積乱雲", detail: "メソサイクロン側から壁雲へ流れ込む水平な雲の尾。スーパーセルで見られることがある。" },
  { category: "付随雲・特殊形", name: "流入帯", latin: "flumen", applies: "積乱雲", detail: "スーパーセルへ流入する風に沿って並ぶ帯状の積雲群。『ビーバーテイル』と呼ばれる形を含む。" },
  { category: "付随雲・特殊形", name: "穴あき雲", latin: "cavum", applies: "巻積雲・高積雲", detail: "雲層に大きな円形または楕円形の穴が開き、内部に落下する尾流雲を伴うことがある。航空機通過がきっかけとなる例もある。" },
  { category: "付随雲・特殊形", name: "波頭雲", latin: "fluctus", applies: "巻雲・高積雲・層積雲など", detail: "雲の上端に砕ける波のような短命の巻き上がりが並ぶ。ケルビン・ヘルムホルツ不安定の可視例。" },
  { category: "付随雲・特殊形", name: "かなとこ雲", latin: "incus", applies: "積乱雲", detail: "対流圏界面付近で上昇流が抑えられ、氷晶雲頂が風下へ広がった形。成熟した積乱雲の代表的特徴。" },
  { category: "付随雲・特殊形", name: "乳房雲", latin: "mamma", applies: "巻雲・高積雲・高層雲・層積雲・積乱雲など", detail: "雲底に袋状の突起が多数垂れ下がる形。積乱雲のかなとこに限らず現れ、出現だけで竜巻などを意味しない。" },
  { category: "付随雲・特殊形", name: "壁雲", latin: "murus", applies: "積乱雲", detail: "強い対流雲の無降水域の下にできる局地的な雲底低下。回転を伴う場合があり、急な変化に注意する。" },
  { category: "付随雲・特殊形", name: "ちぎれ雲", latin: "pannus", applies: "高層雲・乱層雲・積乱雲などの下", detail: "降水雲の下にできる不規則で低い雲片。母雲の下で合体し、雲底を暗く見せることがある。" },
  { category: "付随雲・特殊形", name: "頭巾雲", latin: "pileus", applies: "積雲・積乱雲", detail: "急上昇する雲頂の上にかぶさる薄い帽子状の雲。湿った空気が上昇流に押し上げられ、頂上で断熱冷却して形成される。" },
  { category: "付随雲・特殊形", name: "降水雲", latin: "praecipitatio", applies: "複数の雲形", detail: "雲から地面へ達する雨・雪・霰などの降水筋。地面に届かず蒸発・昇華するものは尾流雲（virga）。" },
  { category: "付随雲・特殊形", name: "漏斗雲・竜巻", latin: "tuba", applies: "積雲・積乱雲", detail: "雲底から垂れ下がる柱状・漏斗状の雲。地面や水面に達しているかを観測して竜巻・水上竜巻と区別する。" },
  { category: "付随雲・特殊形", name: "雲のベール", latin: "velum", applies: "積雲・積乱雲", detail: "発達する雲の中腹を横切る薄い水平な雲層。上昇流が周囲の湿潤安定層に達した位置にできることがある。" },
  { category: "付随雲・特殊形", name: "尾流雲", latin: "virga", applies: "巻積雲・高積雲・高層雲など", detail: "雲から落下する降水粒子が地面に達する前に蒸発・昇華した筋。乾燥層や下層の湿度差を示す。" },
  { category: "特殊な雲", name: "真珠母雲", latin: "Nacreous cloud", applies: "極域成層圏", detail: "極域の冬、成層圏の非常に低温な環境にできる極成層圏雲。日没後などに鮮やかな虹色を示すことがある。" },
  { category: "特殊な雲", name: "夜光雲", latin: "Noctilucent cloud", applies: "高緯度の中間圏（約80 km前後）", detail: "夏季の高緯度で、中間圏界面付近の氷晶が薄明の太陽光を散乱して青白く輝く。通常の対流圏雲よりはるかに高い。" },
  { category: "特殊な雲", name: "飛行機雲", latin: "Contrail / homogenitus", applies: "上層大気・人工起源", detail: "航空機排気中の水蒸気が低温環境で凝結・凍結してできる雲。湿度が高い上層では長時間残り、巻雲状に広がることがある。" },
  { category: "特殊な雲", name: "火災積雲", latin: "flammagenitus", applies: "火災・火山活動に伴う雲", detail: "大規模火災などの熱源で強い上昇流が生じて発達する積雲・積乱雲。煙・灰を含む場合があり、通常の積乱雲と同じとは限らない。" },
  { category: "分類の読み方", name: "種（species）", latin: "雲体の形・内部構造", applies: "雲形を細分", detail: "雲の形や内部構造を示す分類。ひとつの雲に同時に付ける種は原則ひとつ。例：高積雲 castellanus、積雲 congestus。" },
  { category: "分類の読み方", name: "変種（variety）", latin: "配列・透明度", applies: "複数の雲形に共通", detail: "雲要素の並び方や透明度を表す。条件が合えば複数の変種が同時に記録される。例：高積雲 stratiformis undulatus。" },
  { category: "分類の読み方", name: "母雲由来（genitus / mutatus）", latin: "成長と変化を記録", applies: "雲の発生・変質", detail: "別の雲から生じた部分には genitus、雲全体が別の雲形へ変化した場合は mutatus を付ける。例：積雲から生じた層積雲 stratocumulus cumulogenitus。" }
];

const filterNames = ["すべて", "上層雲", "中層雲", "下層雲", "鉛直発達雲"];

// Wikimedia Commons の再利用可能な写真。ページ側で作者・ライセンスを明記する。
const cloudPhotos = {
  Ci: { file: "Cirrus Clouds.jpg", author: "kevinlyfellow", license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", page: "https://commons.wikimedia.org/wiki/File:Cirrus_Clouds.jpg" },
  Cc: { file: "Cirrocumulus Clouds 03.jpg", author: "Indrajit Das", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:Cirrocumulus_Clouds_03.jpg" },
  Cs: { file: "2024-03-01 - Cirrostratus - halo (22 deg) centered on sun - DSN2151-1.jpg", author: "Franz van Duns", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", page: "https://commons.wikimedia.org/wiki/File:2024-03-01_-_Cirrostratus_-_halo_(22_deg)_centered_on_sun_-_DSN2151-1.jpg" },
  Ac: { file: "Altocumulusclouds.jpg", author: "Rollcloud", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", page: "https://commons.wikimedia.org/wiki/File:Altocumulusclouds.jpg" },
  As: { file: "Altostratus clouds.jpg", author: "Anoushka Trivedi", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Altostratus_clouds.jpg" },
  Ns: { file: "Nimbostratus cloud.jpg", author: "Noellamankaah", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Nimbostratus_cloud.jpg" },
  Sc: { file: "Stratocumulus clouds.JPG", author: "Делфина", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Stratocumulus_clouds.JPG" },
  St: { file: "Stratus Cloud.jpg", author: "Natasha2006", license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", page: "https://commons.wikimedia.org/wiki/File:Stratus_Cloud.jpg" },
  Cu: { file: "A single cumulus cloud in a clear daytime sky.jpg", author: "WarmaFiesta", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", page: "https://commons.wikimedia.org/wiki/File:A_single_cumulus_cloud_in_a_clear_daytime_sky.jpg" },
  Cb: { file: "A Cumulonimbus cloud.jpg", author: "Minueditor", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", page: "https://commons.wikimedia.org/wiki/File:A_Cumulonimbus_cloud.jpg" }
};
let initialized = false;
let lastFocusedElement = null;

function svgNode(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function addIllustration(svg, shape) {
  const line = (d, className = "cloud-illustration-line") => svg.append(svgNode("path", { d, class: className }));
  const ellipse = (cx, cy, rx, ry, className = "cloud-illustration-puff") => svg.append(svgNode("ellipse", { cx, cy, rx, ry, class: className }));
  switch (shape) {
    case "cirrus":
      line("M20 63 C52 51 73 45 103 49 S162 42 201 21"); line("M50 68 C76 57 88 53 112 55 S153 45 178 32"); line("M126 47 C143 38 153 28 154 18 M170 36 C185 32 193 26 197 16"); break;
    case "cirrocumulus":
      [0, 1, 2].forEach((row) => [0, 1, 2, 3, 4, 5].forEach((col) => ellipse(30 + col * 31 + (row % 2) * 10, 35 + row * 16, 10, 5, "cloud-illustration-small-puff"))); break;
    case "cirrostratus":
      line("M12 36 Q110 16 208 36 L208 48 Q110 30 12 50 Z", "cloud-illustration-veil");
      svg.append(svgNode("circle", { cx: 110, cy: 33, r: 20, class: "cloud-illustration-halo" })); break;
    case "altocumulus":
      [35, 76, 117, 158, 193].forEach((x, i) => ellipse(x, 59 + (i % 2) * 5, 25, 15)); line("M13 72 Q100 66 207 73"); break;
    case "altostratus":
      line("M12 43 Q55 39 100 42 T208 40 L208 70 Q160 67 110 70 T12 68 Z", "cloud-illustration-layer"); break;
    case "nimbostratus":
      line("M12 34 Q46 30 68 39 Q92 26 116 38 Q151 25 175 37 L208 34 L208 72 L12 72 Z", "cloud-illustration-heavy");
      [44, 75, 110, 146, 178].forEach((x) => line(`M${x} 73 l-4 12`, "cloud-illustration-rain")); break;
    case "stratocumulus":
      [25, 65, 105, 145, 185].forEach((x, i) => ellipse(x, 55 + (i % 2) * 8, 29, 18)); line("M10 70 Q107 66 210 70"); break;
    case "stratus":
      line("M12 50 Q45 45 76 49 T140 48 T208 50 L208 65 Q160 62 110 65 T12 64 Z", "cloud-illustration-layer");
      line("M20 74 Q110 70 200 74", "cloud-illustration-mist"); break;
    case "cumulus":
      ellipse(110, 52, 38, 28); ellipse(80, 62, 25, 20); ellipse(139, 62, 26, 19); line("M52 77 Q110 74 168 77", "cloud-illustration-base"); break;
    case "cumulonimbus":
      ellipse(108, 48, 35, 38); ellipse(75, 61, 26, 24); ellipse(141, 61, 27, 24); line("M53 33 Q75 29 85 33 Q104 19 131 31 Q154 28 173 36 L166 44 Q110 39 59 46 Z", "cloud-illustration-anvil");
      [77, 108, 139, 168].forEach((x) => line(`M${x} 81 l-6 10`, "cloud-illustration-rain")); break;
  }
}

function createIllustration(shape, label) {
  const svg = svgNode("svg", { class: "cloud-illustration", viewBox: "0 0 220 104", role: "img", "aria-label": `${label}の形を示す模式図` });
  svg.append(svgNode("line", { x1: 10, y1: 88, x2: 210, y2: 88, class: "cloud-illustration-ground" }));
  addIllustration(svg, shape);
  return svg;
}

function createField(label, value, className) {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  const title = document.createElement("dt");
  title.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  wrapper.append(title, detail);
  return wrapper;
}

function createCloudPhoto(cloud) {
  const figure = document.createElement("figure");
  figure.className = "cloud-atlas-figure cloud-atlas-photo";
  const photo = cloudPhotos[cloud.code];
  const image = document.createElement("img");
  image.className = "cloud-atlas-photo-image";
  image.src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(photo.file)}?width=900`;
  image.alt = `${cloud.name}（${cloud.latin}）の実際の写真`;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  const caption = document.createElement("figcaption");
  caption.className = "cloud-atlas-photo-credit";
  const source = document.createElement("a");
  source.href = photo.page;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = `写真：${photo.author}`;
  const license = document.createElement("a");
  license.href = photo.licenseUrl;
  license.target = "_blank";
  license.rel = "noopener noreferrer";
  license.textContent = photo.license;
  caption.append(source, document.createTextNode(" · "), license);
  image.addEventListener("error", () => {
    image.remove();
    figure.classList.add("cloud-atlas-photo-fallback");
    figure.insertBefore(createIllustration(cloud.shape, cloud.name), caption);
    caption.prepend(document.createTextNode("写真を取得できないため図解を表示 · "));
  }, { once: true });
  figure.append(image, caption);
  return figure;
}

function createGenusCard(cloud) {
  const article = document.createElement("article");
  article.className = "cloud-atlas-card";
  article.dataset.family = cloud.family;
  article.dataset.search = `${cloud.name} ${cloud.latin} ${cloud.code} ${cloud.family} ${cloud.appearance} ${cloud.process} ${cloud.weather} ${cloud.distinguish}`.toLocaleLowerCase("ja-JP");
  const photoFigure = createCloudPhoto(cloud);
  const heading = document.createElement("header");
  heading.className = "cloud-atlas-card-heading";
  const name = document.createElement("h3");
  name.textContent = cloud.name;
  const latin = document.createElement("span");
  latin.className = "cloud-atlas-code";
  latin.textContent = `${cloud.code}  ${cloud.latin}`;
  const family = document.createElement("span");
  family.className = "cloud-atlas-family";
  family.textContent = cloud.family;
  heading.append(name, latin, family);
  const facts = document.createElement("dl");
  facts.className = "cloud-atlas-facts";
  facts.append(
    createField("高度の目安", cloud.height, "cloud-atlas-height"),
    createField("見た目", cloud.appearance, "cloud-atlas-description"),
    createField("生成・構造", cloud.process, "cloud-atlas-description"),
    createField("天気との関係", cloud.weather, "cloud-atlas-description"),
    createField("見分ける点", cloud.distinguish, "cloud-atlas-description")
  );
  article.append(photoFigure, heading, facts);
  return article;
}

function createTermCard(term) {
  const article = document.createElement("article");
  article.className = "cloud-atlas-term-card";
  article.dataset.search = `${term.category} ${term.name} ${term.latin} ${term.applies} ${term.detail}`.toLocaleLowerCase("ja-JP");
  const category = document.createElement("small");
  category.textContent = `${term.category} · ${term.applies}`;
  const heading = document.createElement("h3");
  heading.textContent = term.name;
  const latin = document.createElement("span");
  latin.className = "cloud-atlas-term-latin";
  latin.textContent = term.latin;
  const detail = document.createElement("p");
  detail.textContent = term.detail;
  article.append(category, heading, latin, detail);
  return article;
}

function openModal() {
  const modal = document.getElementById("cloud-classification-modal");
  if (!modal || !modal.hidden) return;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("cloud-classification-button")?.setAttribute("aria-expanded", "true");
  modal.querySelector("[data-cloud-atlas-close]")?.focus({ preventScroll: true });
}

function closeModal() {
  const modal = document.getElementById("cloud-classification-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("cloud-classification-button")?.setAttribute("aria-expanded", "false");
  if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
  lastFocusedElement?.focus?.({ preventScroll: true });
}

function buildBody(body) {
  const intro = document.createElement("section");
  intro.className = "cloud-atlas-intro";
  const introText = document.createElement("p");
  introText.textContent = "雲を形・高度・でき方から調べる図鑑です。まず10の基本雲形を見て、種・変種・付随雲へ進めます。雲の見た目だけでは天気や危険度を断定できません。";
  const reference = document.createElement("a");
  reference.href = "https://cloudatlas.wmo.int/en/cloud-classification-summary.html";
  reference.target = "_blank";
  reference.rel = "noopener noreferrer";
  reference.textContent = "WMO 国際雲図帳・分類一覧 ↗";
  intro.append(introText, reference);

  const tools = document.createElement("div");
  tools.className = "cloud-atlas-tools";
  const searchLabel = document.createElement("label");
  searchLabel.htmlFor = "cloud-atlas-search";
  searchLabel.textContent = "雲の名前・特徴を検索";
  const search = document.createElement("input");
  search.type = "search";
  search.id = "cloud-atlas-search";
  search.placeholder = "例：ハロ、尾流雲、castellanus";
  search.autocomplete = "off";
  const filters = document.createElement("div");
  filters.className = "cloud-atlas-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "基本雲形の高度別絞り込み");
  const count = document.createElement("p");
  count.className = "cloud-atlas-result-count";
  count.setAttribute("aria-live", "polite");
  tools.append(searchLabel, search, filters, count);

  const basicHeading = document.createElement("h3");
  basicHeading.className = "cloud-atlas-section-title";
  basicHeading.textContent = "基本雲形 — WMOの10属";
  const grid = document.createElement("div");
  grid.className = "cloud-atlas-grid";
  const genusCards = genera.map(createGenusCard);
  grid.append(...genusCards);

  const termHeading = document.createElement("h3");
  termHeading.className = "cloud-atlas-section-title cloud-atlas-term-heading";
  termHeading.textContent = "専門分類 — 種・変種・付随雲・特殊な雲";
  const termIntro = document.createElement("p");
  termIntro.className = "cloud-atlas-term-intro";
  termIntro.textContent = "雲の分類名は組み合わせて記録します。種は形態、変種は配列や透明度、付随雲・特殊形は雲の一部や周辺に現れる特徴を表します。";
  const termGrid = document.createElement("div");
  termGrid.className = "cloud-atlas-term-grid";
  const termCards = terms.map(createTermCard);
  termGrid.append(...termCards);

  let activeFilter = "すべて";
  let activeButton = null;
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase("ja-JP");
    let visibleGenera = 0;
    genusCards.forEach((card) => {
      const visible = (activeFilter === "すべて" || card.dataset.family.includes(activeFilter.replace("雲", "")))
        && (!query || card.dataset.search.includes(query));
      card.hidden = !visible;
      if (visible) visibleGenera += 1;
    });
    let visibleTerms = 0;
    termCards.forEach((card) => {
      const visible = !query || card.dataset.search.includes(query);
      card.hidden = !visible;
      if (visible) visibleTerms += 1;
    });
    basicHeading.hidden = Boolean(query) && visibleGenera === 0;
    termHeading.hidden = visibleTerms === 0;
    termIntro.hidden = visibleTerms === 0;
    count.textContent = `基本雲形 ${visibleGenera} / ${genera.length} ・ 専門分類 ${visibleTerms} / ${terms.length}`;
  };

  filterNames.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = filter;
    button.setAttribute("aria-pressed", String(filter === activeFilter));
    if (filter === activeFilter) activeButton = button;
    button.addEventListener("click", () => {
      activeButton?.setAttribute("aria-pressed", "false");
      activeFilter = filter;
      button.setAttribute("aria-pressed", "true");
      activeButton = button;
      update();
    });
    filters.append(button);
  });
  search.addEventListener("input", update);
  update();
  body.replaceChildren(intro, tools, basicHeading, grid, termHeading, termIntro, termGrid);
}

export function setupCloudClassificationModal() {
  if (initialized) return;
  const button = document.getElementById("cloud-classification-button");
  const modal = document.getElementById("cloud-classification-modal");
  const body = document.getElementById("cloud-classification-body");
  if (!button || !modal || !body) return;
  initialized = true;
  buildBody(body);
  button.addEventListener("click", openModal);
  modal.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-cloud-atlas-close]")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

export const cloudClassificationCatalog = { genera, terms, photos: cloudPhotos };
