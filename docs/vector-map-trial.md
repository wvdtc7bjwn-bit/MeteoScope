# 地図タイル版の試作

現行方式のローカル保存は`71dd081`、試作ブランチは`codex/static-map-tiles`です。
タイル版を本番ビルドで有効にする設定は`.env.production`に記録しています。

## 比較と戻し方

通常の`npm run dev`は従来のGeoJSON、本番用の`npm run build`はタイル版を使います。
ビルド環境変数`VITE_MAP_GEOMETRY`で方式を選べます（`vector` / `geojson`）。
元の方式へ戻す場合は、`VITE_MAP_GEOMETRY=geojson`を指定して再ビルド・再公開します。
元のGeoJSON、区域検索、地震・EEWの区域データは残しています。

PowerShellでのタイル版の例:

```powershell
$env:VITE_MAP_GEOMETRY='vector'
npm.cmd run build
Remove-Item Env:VITE_MAP_GEOMETRY
npm.cmd run preview -- --host 127.0.0.1
```

元の方式へ戻す例:

```powershell
$env:VITE_MAP_GEOMETRY='geojson'
npm.cmd run build
Remove-Item Env:VITE_MAP_GEOMETRY
```

Cloudflare Pagesなどのビルド環境変数でも同じ指定を上書きできます。生成タイルと元データは両方保持します。
ブランチごと戻す場合は試作差分を保存してから`main`へ切り替えます。未保存の変更を破棄しないでください。

## 生成と互換性

`npm run data:build:base-map-tiles`で市区町村・都道府県を同じタイルに事前変換します。
MapLibre 5.24のGeoJSON変換と同じextent 8192 / buffer 2048 / tolerance 6 / maxZoom 18です。
地図の最大倍率10までを出力し、追加の簡略化はしません。更新時は元データの変更後に再生成します。
元データと変換条件・エンコーダーバージョンからURLの版を決め、版付きタイルだけを長期キャッシュします。
古い版の生成ディレクトリが残った場合、現在のmanifestが参照していないことを確認して整理してください。

市区町村コードは文字列のまま保持します。feature-stateにはsourceLayerを付け、
複数タイルに分割された市区町村にも同じ警報色を反映します。
補正済みの市区町村は従来の補正GeoJSONを使用します。
海外の海岸線、震度の区域・観測点、EEW、検索用形状は変更しません。
海のみの区画はmanifestで判別し、ネットワークへ要求しません。

生成済みファイルは1,428枚・約14.1MB（圧縮前）。Cloudflare Workers・D1・新しいサーバーは追加しません。
静的ファイルの要求数は増えるため、転送量とキャッシュの実運用は公開前に確認します。

## 検証

- `npm test`と通常版・タイル版ビルド。
- `BaseMapTilesTests.mjs`: 3,223図形のコード・属性・タイル内座標を元の変換と比較。
- 同テストで生成物の存在・合計バイト数・入力ハッシュ・空タイル・HTTP失敗・中断signal・feature-state対象を検査。
- ブラウザの架空警報データで由利本荘市の色付け・解除とクリックを確認。
- ライト／ダーク、対馬、北方領土を目視確認。

本番形式のlocalhostプレビューで、元の方式は約5.2秒／再読み込み約5.3秒、
タイル試作は約2.1秒／再読み込み約1.3秒でした。少数回・同じPCでの参考値です。
本番CDN・iPhone・低速回線の測定ではありません。
公開前に実際の警報更新、早期注意情報、補正市区町村、倍率変更中のクリック、
地震タブと他タブの切り替え、通信断からの復帰を実機でも確認します。
