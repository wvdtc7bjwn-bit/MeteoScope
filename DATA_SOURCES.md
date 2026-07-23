# MeteoScope データソース台帳

最終確認日: 2026-07-19

この台帳は、Web版とiOS版が直接または同梱ファイル経由で利用するデータ、地図、ライブラリの出所と再利用条件を追跡するためのものです。

## 確認済み

| 対象 | 提供者・取得URL | 条件 | MeteoScopeでの加工 |
| --- | --- | --- | --- |
| 気象庁JSON・XML・CSV・タイル | 気象庁。`https://www.jma.go.jp/bosai/`、`https://www.data.jma.go.jp/developer/xml/`、`https://www.data.jma.go.jp/stats/` | [気象庁ホームページ利用規約](https://www.jma.go.jp/jma/kishou/info/coment.html)。政府標準利用規約2.0相当の公共データ利用規約第1.0版。出典表示と、編集・加工した場合の明示が必要。国が作成したような態様での公表は禁止。第三者権利がある素材は別途確認が必要。 | 区域照合、XML/JSON解析、地図重ね合わせ、配色変換、ランキング、時系列整理、通知状態の差分比較。アプリ内と規約ページに非公式・加工内容・公式情報確認を表示する。 |
| 日々の震源リスト・震央分布 | 気象庁。`https://www.data.jma.go.jp/eqev/data/daily_map/index.html`、日付別HTML | [気象庁ホームページ利用規約](https://www.jma.go.jp/jma/kishou/info/coment.html)。震源要素は暫定値であり、後日変更される場合がある。 | Workerが日付別HTMLを解析し、1日分を1つのJSON行としてD1へ最大731日（うるう年を含む24か月相当）保存。通常の公開時差に合わせてJSTの2日前を期待最新日とし、Workers FreeのCPU上限を超えないよう、初回補完は1分ごとに1日だけ取得する。直近8日、保存期間内の欠損、古い未取得日の順に補完し、731日を超えた場合だけ最古日を削除する。Web/iOSは保持した日付を切り替え、地図には選択した1日分だけを深さ別に配色して表示する。規模・深さで絞り込み可能。1日5,000件または1.5 MBを超える日は安全のため保存しない。最終確認日: 2026-07-22。 |
| 気象庁防災情報XML（地震・津波） | [気象庁防災情報XML](https://xml.kishou.go.jp/) の地震火山フィード（`eqvol.xml`、`eqvol_l.xml`）とVXSE51/52/53・VTSE41/51/52電文。 | [気象庁ホームページについて](https://www.jma.go.jp/jma/kishou/info/coment.html)を確認。行政機関の公式アプリと誤認されない表示を行い、配信を保証しない。 | Web/iOSが同じXMLフィードを取得し、履歴・震源・規模・深さ・最大震度・細分区域・観測点・津波警報等・沿岸／沖合観測をEventID単位で統合する。取得不能を「津波の心配なし」と判定せず、未確認として表示する。 |
| 気象庁 火山情報 | [噴火警報・噴火速報](https://www.jma.go.jp/bosai/volcano/) の全国現況JSON・火山一覧JSONと、気象庁防災情報XMLのVFVO50/51/52/53/54/55/56電文。 | [気象庁ホームページについて](https://www.jma.go.jp/jma/kishou/info/coment.html)を確認。公式アプリと誤認されない表示を行い、避難・規制は自治体等の公式発表も確認するよう案内する。 | 全国の火山一覧と現在の警戒状況をコードで照合し、同一火山を1件に統合して警戒度順に表示する。地図記号は塗りつぶし三角形。選択火山に有効な降灰予報がある場合だけ、降灰と小さな噴石の予測範囲を地図へ重ね、要約バーの時刻スライダーで予測時間を手動選択する。直近XMLは関連発表として併記し、取得不能を平常とみなさない。 |
| `jma-tsunami-forecast-areas.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」の津波予報区。取得元は`20240520_AreaTsunami_GIS.zip`。2026-07-15取得時の原ZIP SHA-256は`735e2ed36befa8d9511f01e6a0e503e01e7824b5125a71326f3f623d808a7eb9`。 | 気象庁ホームページ利用規約。元データはJGD2011で、同ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | Mapshaperで`-clean -simplify 2% keep-shapes -filter 'code != "0"' -filter-fields code,name -o format=geojson precision=0.0001`を適用し、帰属未定4線を除いた66予報区の線形GeoJSONへ変換。生成物SHA-256は`e8c53fe6e3d4069e9caacf3570a9f8e0d02492674071343f401bf0ffdb658373`。電文の予報区コードと照合して地図上の海岸線を配色する。 |
| `jma-weather-warning-municipalities.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」が公式配布する市町村等（気象警報等）。2026-07-14に同庁の最新`area.json`と照合し、現行`class20s`の1,805区域コードをすべて含むことを確認した。 | 気象庁ホームページ利用規約。元データはJGD2011で、気象庁ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | ShapefileからGeoJSONへ変換し、警報区域コード・名称をアプリ用プロパティへ整理。現ファイルを作った配布ZIPの版、取得日、原ZIPのハッシュ、変換コマンドは未記録のため、提供元・利用条件とは別の再現性課題として次回更新時に生成工程へ取り込む。 |
| `earthquake-areas.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」が公式配布する地震情報／細分区域。提供元と適用される利用条件は確認済み。 | 気象庁ホームページ利用規約。元データはJGD2011で、気象庁ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | ShapefileからGeoJSONへ変換し、地震区域コード・名称と表示用属性を付加。現ファイルを作った配布ZIPの版、取得日、原ZIPのハッシュ、変換コマンドは未記録のため、提供元・利用条件とは別の再現性課題として次回更新時に生成工程へ取り込む。 |
| `japan-prefectures.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」の地震情報／都道府県等。取得元は`20190125_AreaInformationPrefectureEarthquake_GIS.zip`。2026-07-14取得時のSHA-256は`5f36a66e2a2bbdc2eb04d4c7be0dc9d710903040d4b721716a0b1368d80da235`。 | 気象庁ホームページ利用規約。元データはJGD2011で、気象庁ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | `scripts/update-jma-static-data.mjs`がShapefileをMapshaperでトポロジーを保ちながら2%へ簡略化し、47都道府県のコード・名称を検証してGeoJSONへ変換する。 |
| `jma-intensity-stations.json` | 気象庁「[震度観測点](https://www.data.jma.go.jp/eqev/data/intens-st/)」の[公開観測点JSON](https://www.data.jma.go.jp/eqev/data/intens-st/stations.json)と、[防災情報XML技術資料](https://xml.kishou.go.jp/tec_material.html)の2026-07-07版個別コード表（表24、4,360コード）を使用する。公開観測点JSONは4,368地点、SHA-256は`44a5add85563edbc87c3572bfe246a4837fb02c2803723ba8aabdcd89ebdbed6`。気象庁、地方公共団体、防災科研の観測点を含む。 | 気象庁ホームページ利用規約。観測点のコード、名称、表示用座標、都道府県コード、所属区分を利用する。 | `scripts/update-jma-static-data.mjs`が両資料を検証し、正規化した地点名が完全一致する4,326地点だけにコードを付与する。地点名が更新中などでコードと座標を安全に結合できない地点は、市町村内の別観測点へ推測置換せず未プロットにする。公式コード参照は`scripts/data/jma-intensity-station-codes-20260707.json`へ版固定し、WebとiOSで同じ生成物を使用する。 |
| 地理院タイル（標準地図） | 国土地理院。`https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` | [地理院タイル利用規約](https://maps.gsi.go.jp/help/termsofuse.html)および[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)。出典「国土地理院」を表示し、該当する基本測量成果の利用条件を守る。 | `public/map-style.json`の背景地図として表示。データ自体の改変はせず、気象情報を上に重ねる。 |
| MapLibre GL JS | MapLibre。[GitHub](https://github.com/maplibre/maplibre-gl-js)、npm `maplibre-gl` | BSD 3-Clause。配布物に著作権表示・条件・免責を保持する。 | Web地図描画ライブラリとして利用。 |
| MapLibre Native / Swift | MapLibre。[MapLibre Native](https://github.com/maplibre/maplibre-native)、Swift Package `maplibre-native-distribution` | MapLibre NativeはBSD 2-Clause。依存パッケージに含まれる第三者ライセンスも配布前にXcodeのライセンス表示で確認する。 | iOS地図描画ライブラリとして利用。 |
| `demotiles.maplibre.org` | MapLibre [demo tiles repository](https://github.com/maplibre/demotiles) | リポジトリはBSD 3-Clauseだが、READMEはデモ・hello world・CI向けのサービスと説明しており、本番SLAや恒久利用を保証していない。 | iOSのスタイルURLは自前配信の`/map-style.json`へ置換済み。Webの文字グリフURLにはまだ残存するため、一般公開前の未解決事項。 |

## 外部GISレイヤー

### J-SHIS 主要活断層帯

- 提供者: 国立研究開発法人 防災科学技術研究所。仕様は[J-SHIS Web API 主要活断層帯](https://www.j-shis.bosai.go.jp/api-vectortile-majorfault)を参照する。
- 使用URL: `https://www.j-shis.bosai.go.jp/map/xyz/major_fault/Y2022/MAX/{z}/{x}/{y}.mvt?lang=ja`。2022年版の最大ケースを、地震タブのズーム4以上11未満でJ-SHISから直接取得する。MVTはリポジトリへ同梱・再配布しない。
- 利用条件: [J-SHIS利用規約](https://www.j-shis.bosai.go.jp/agreement)。画面内に「主要活断層帯: J-SHIS（防災科研）」を表示する。
- 加工内容: `major_fault`レイヤーの面形状をMeteoScopeの配色で重ね、クリック時に`LTENAME`、`MAG`、`MAX_T30P`から断層帯名、想定規模、最大ケースの30年確率を表示する。負の`MAG`はAPI仕様に従い絶対値をモーメントマグニチュード（Mw）として表示する。

### USGS プレート境界

- 提供者: U.S. Geological Survey（USGS）。[USGS Tectonic Plate Boundaries MapServer](https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer)の`Plates`レイヤーを使用する。
- 原典: サービスの著作権欄に、USGS Seismicity of the Earth Map Series、Bird, P. (2003)「An updated digital model of plate boundaries」([DOI](https://doi.org/10.1029/2001GC000252))、DeMets et al. (2010) が記載されている。
- 利用条件: USGS作成のデータ・情報は、別記がない限り米国内でパブリックドメインで、USGSは出典表示を求めている。[USGSの著作権案内](https://www.usgs.gov/faqs/are-usgs-reportspublications-copyrighted)を参照する。第三者由来部分を含む可能性を考慮し、USGSとBird (2003) の両方を表示する。USGSロゴは使用しない。
- 取得・加工: 2026-07-19にWGS84の範囲`118,15,160,55`と交差するフィーチャをGeoJSONで取得し、`public/data/usgs-plate-boundaries-japan.geojson`へ静的保存した。19形状、15,027 bytes、SHA-256 `ddbe6c7e2c0911bfbe42a5facd5e61b510bb86a9e186627f772c36bd7c626c25`。`NAME`と`LABEL`だけを保持し、収束境界、横ずれ境界、その他をMeteoScopeが配色・線種変換して表示する。利用者ごとのUSGS APIアクセスやD1保存は行わない。
- 注意: 境界はBird (2003)の全球概略モデルであり、詳細な断層位置、境界幅、地点別の危険度を示すものではない。日本周辺のプレート区分には複数の学説・細分モデルがあるため、表示名と線位置を唯一の確定情報として扱わない。

### USGS Slab2 プレート面・等深線

- 提供者: U.S. Geological Survey（USGS）。[Slab2: A Comprehensive Subduction Zone Geometry Model](https://www.usgs.gov/data/slab2-a-comprehensive-subduction-zone-geometry-model)（[ScienceBase item / DOI 10.5066/F7PV6JNV](https://doi.org/10.5066/F7PV6JNV)）を使用する。
- 利用条件: USGSのScienceBase配布ページでCC0として公開されている。画面内に「プレート面・等深線: USGS Slab2」を表示する。USGSロゴは使用しない。
- 取得・加工: 2026-07-19に公式`Slab2_depth.kmz`を取得し、Kuril、Izu-Bonin、Ryukyuの深度コンターを抽出した。範囲`118,15,160,55`で切り出し、表示負荷を抑えるため0.012度の許容値で線形状を簡略化した。KurilとIzu-Boninの地域モデル境界（北緯35度）ではKuril側を基準にIzu-Bonin側を、Izu-Bonin内部の分割境界（北緯約27度）では南側を基準に北側を、同じ深さの端点間が12km以内の場合に限って一致させ、表示上の空白を解消している。12kmを超える線は誤接続を避けるため調整しない。新たな補間線は追加せず、20km間隔・深さ20〜660kmの117形状を`public/data/usgs-slab2-depth-contours-japan.geojson`へ静的保存した。75,881 bytes、SHA-256 `d90214969b6fa4a4411d244694c0d337d073ba080c32b03edc66d47821a3d0f9`。
- 面データ: USGS Tectonic Plate Boundariesの収束境界を0km側の端として、同一地域内の隣接する等深線間を三角形へ分割した。全深度帯で端点から端点まで到達できる最小距離の三角形経路を計算し、線全体を隙間なく覆う。端点まで安全に到達できない場合だけ、両線の最接近点から根拠のある範囲を形状追跡する。同一地域・同一深度・同一プレートで端点間1km以内の区間は先に1本へ結合し、区間境界で三角形の隙間や重なりが見えないようにする。線のペア判定は双方の最近傍距離のうち良い側の中央値を用い、真に分離した枝も重なる範囲だけ親線へ対応させる。等深線の分岐・合流は最寄りの線だけを再利用し、深度差40km以内、通常の線対応距離180km以内、0km境界との対応距離520km以内の条件を維持する。各頂点間の許容距離は浅部220kmのまま、平均深度100kmから段階的に広げ、500km以深では最大320kmとする。地域間や根拠のない遠距離は接続せず空白を残す。106帯・9,766三角形を`public/data/usgs-slab2-surface-japan.geojson`へ静的保存した。1,023,194 bytes、SHA-256 `7bcf026d7309cf1bf47cb02ff8ba2074ec8a562b7229fd312efe8704f3d1f294`。Web版は深さを3倍に強調した3D面、iOS版は深さ帯ごとに画面方向へずらした2.5D面として表示する。利用者ごとのUSGS APIアクセス、Worker処理、D1保存は行わない。
- 表示: 深さ属性を連続補間し、浅い側を赤、深い側を青のグラデーションで配色する。地震タブでのみ表示し、プレート境界とは独立してオン／オフできる。
- 注意: Slab2は観測・解析に基づく0.05度格子のモデルで、等深線は沈み込むスラブ上面の推定深度を表す。地点ごとの地下構造や地震危険度を確定するものではなく、後日のモデル更新で変わる場合がある。

### ArcGIS 指定河川洪水予報河川

- 使用URL: `https://services.arcgis.com/wlVTGRSYTzAbjjiC/ArcGIS/rest/services/flood_risk_all/FeatureServer/0/query`
- ArcGISレイヤー名: 「指定河川洪水予報河川」
- Service Item ID: [`dd9f222b9b61428abd2d26414c10928f`](https://www.arcgis.com/home/item.html?id=dd9f222b9b61428abd2d26414c10928f&sublayer=0)
- 所有者: ArcGIS Onlineの`Esri_JP_Content`。アイテムのクレジットは「ESRIジャパン株式会社, 気象庁」。
- 原典: 気象業務支援センターが公開する流路データ（2024年6月5日差替）と河川番号・河川名対応表、気象庁防災情報XMLの個別コード表。ESRIジャパンが名称情報を結合している。
- 利用条件: 親アイテムの`licenseInfo`に「このデータは無料で利用できます」と明記されている。コンテンツは予告なく変更・削除・移転される場合があり、利用による損害は保証されない。流路データは[気象庁 技術情報第489号](https://www.data.jma.go.jp/add/suishin/jyouhou/pdf/489.pdf)の留意事項にも従う。
- レイヤーREST定義の`copyrightText`と`description`は空欄だが、利用条件と原典は親のArcGISアイテムに登録されている。レイヤー単体の空欄だけを根拠に「未確認」とは扱わない。
- MeteoScopeではGeoJSONとして取得し、気象庁XMLの予報区域コードと照合して配色・発表情報を付加する。画面内に「河川形状: ESRIジャパン株式会社・気象庁」と加工表示である旨を明示する。
- ArcGIS Onlineの公開サービスであり、永続提供や可用性は保証されない。商用化、データの再配布、サービスへの高頻度アクセスを行う場合は、個別アイテム条件に加えてEsriの最新規約を再確認し、必要に応じてESRIジャパンへ確認する。

## 地図配信の公開前条件

- iOSは`https://meteoscope.pages.dev/map-style.json`から、国土地理院の標準地図を参照する構成に変更した。
- WebはMapLibreの文字グリフを`demotiles.maplibre.org`から取得している。一般公開前に、使用フォントの再配布ライセンスを確認したうえでグリフを自前配信するか、外部グリフを必要としないレイヤー構成へ変更する。
- APIキーや配信サービスの秘密情報は、ソース、地図スタイル、Git履歴へ保存しない。
- 外部URLの可用性は保証されない。取得失敗時は古い情報を最新として扱わず、取得状態を表示する。

## 更新手順

都道府県境界と震度観測点は`npm run data:update:jma`で更新する。データの追加・差し替え時は、提供者、一次取得URL、取得日、ライセンスURL、原ファイルの版またはハッシュ、加工スクリプト、アプリ内表示箇所をこの台帳へ追記する。根拠を確認できない場合は「確認済み」と記載しない。
