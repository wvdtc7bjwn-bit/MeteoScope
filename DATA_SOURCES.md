# MeteoScope データソース台帳

最終確認日: 2026-07-14

この台帳は、Web版とiOS版が直接または同梱ファイル経由で利用するデータ、地図、ライブラリの出所と再利用条件を追跡するためのものです。

## 確認済み

| 対象 | 提供者・取得URL | 条件 | MeteoScopeでの加工 |
| --- | --- | --- | --- |
| 気象庁JSON・XML・CSV・タイル | 気象庁。`https://www.jma.go.jp/bosai/`、`https://www.data.jma.go.jp/developer/xml/`、`https://www.data.jma.go.jp/stats/` | [気象庁ホームページ利用規約](https://www.jma.go.jp/jma/kishou/info/coment.html)。政府標準利用規約2.0相当の公共データ利用規約第1.0版。出典表示と、編集・加工した場合の明示が必要。国が作成したような態様での公表は禁止。第三者権利がある素材は別途確認が必要。 | 区域照合、XML/JSON解析、地図重ね合わせ、配色変換、ランキング、時系列整理、通知状態の差分比較。アプリ内と規約ページに非公式・加工内容・公式情報確認を表示する。 |
| `jma-weather-warning-municipalities.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」の市町村等（気象警報等）。提供元はプロジェクト管理者確認済み。 | 気象庁ホームページ利用規約。元データはJGD2011で、気象庁ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | ShapefileからGeoJSONへ変換し、警報区域コード・名称をアプリ用プロパティへ整理。現ファイルを作った配布ZIPの版、取得日、ハッシュ、変換コマンドは未記録のため、次回更新時に再現可能な生成工程へ置き換える。 |
| `earthquake-areas.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」の地震情報／細分区域。提供元はプロジェクト管理者確認済み。 | 気象庁ホームページ利用規約。元データはJGD2011で、気象庁ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | ShapefileからGeoJSONへ変換し、地震区域コード・名称と表示用属性を付加。現ファイルを作った配布ZIPの版、取得日、ハッシュ、変換コマンドは未記録のため、次回更新時に再現可能な生成工程へ置き換える。 |
| `japan-prefectures.geojson` | 気象庁「[予報区等GISデータの一覧](https://www.data.jma.go.jp/developer/gis.html)」の地震情報／都道府県等。取得元は`20190125_AreaInformationPrefectureEarthquake_GIS.zip`。2026-07-14取得時のSHA-256は`5f36a66e2a2bbdc2eb04d4c7be0dc9d710903040d4b721716a0b1368d80da235`。 | 気象庁ホームページ利用規約。元データはJGD2011で、気象庁ページ記載の国土地理院承認番号・出典も引き継いで表示する。 | `scripts/update-jma-static-data.mjs`がShapefileをMapshaperでトポロジーを保ちながら2%へ簡略化し、47都道府県のコード・名称を検証してGeoJSONへ変換する。 |
| `jma-intensity-stations.json` | 気象庁「[震度観測点](https://www.data.jma.go.jp/eqev/data/intens-st/)」の[公開観測点JSON](https://www.data.jma.go.jp/eqev/data/intens-st/stations.json)。2026-07-14取得時は4,368地点、SHA-256は`44a5add85563edbc87c3572bfe246a4837fb02c2803723ba8aabdcd89ebdbed6`。気象庁、地方公共団体、防災科研の観測点を含み、提供主体は同ページに明示されている。 | 気象庁ホームページ利用規約。観測点の名称、表示用座標、都道府県コード、所属区分を利用する。 | `scripts/update-jma-static-data.mjs`が公開JSONを検証し、アプリ用のフィールド名へ変換する。地点名は重複がないこと、座標が数値であること、4,000地点以上あることを生成時に検証する。 |
| 地理院タイル（標準地図） | 国土地理院。`https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` | [地理院タイル利用規約](https://maps.gsi.go.jp/help/termsofuse.html)および[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)。出典「国土地理院」を表示し、該当する基本測量成果の利用条件を守る。 | `public/map-style.json`の背景地図として表示。データ自体の改変はせず、気象情報を上に重ねる。 |
| MapLibre GL JS | MapLibre。[GitHub](https://github.com/maplibre/maplibre-gl-js)、npm `maplibre-gl` | BSD 3-Clause。配布物に著作権表示・条件・免責を保持する。 | Web地図描画ライブラリとして利用。 |
| MapLibre Native / Swift | MapLibre。[MapLibre Native](https://github.com/maplibre/maplibre-native)、Swift Package `maplibre-native-distribution` | MapLibre NativeはBSD 2-Clause。依存パッケージに含まれる第三者ライセンスも配布前にXcodeのライセンス表示で確認する。 | iOS地図描画ライブラリとして利用。 |
| `demotiles.maplibre.org` | MapLibre [demo tiles repository](https://github.com/maplibre/demotiles) | リポジトリはBSD 3-Clauseだが、READMEはデモ・hello world・CI向けのサービスと説明しており、本番SLAや恒久利用を保証していない。 | iOSのスタイルURLは自前配信の`/map-style.json`へ置換済み。Webの文字グリフURLにはまだ残存するため、一般公開前の未解決事項。 |

## 外部GISレイヤー

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
