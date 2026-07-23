# MeteoScope震央分布アーカイブ

気象庁「日々の震源リスト」の日別データをD1へ保存し、Web版へ震央分布を返す専用Workerです。

地震・津波の速報表示には使用しません。Web版の地震・津波情報は、気象庁防災情報XMLの地震火山フィードから取得します。

## 公開API

- `GET /api/earthquakes/distribution`

履歴、最新地震、観測点、WebSocketのAPIは廃止しました。

## D1

使用するテーブルは次の2つだけです。

- `jma_daily_hypocenter_days`
- `jma_daily_hypocenter_sync`

旧DMDATA受信で使用していた`earthquake_history`、`station_intensities`、`tsunami_history`、`meteoscope_worker_state`は`0003_remove_dmdata.sql`で削除します。

## Cloudflare設定

`DMDATA_API_KEY` Secret、Durable Object binding、DM-D.S.S関連の変数は不要です。WorkerのD1 binding `EQ_D1`とCronだけを使用します。

本番切替時は、現在の地震表示を途中で止めないよう次の順番で実行します。

1. このWorkerをデプロイし、`v2` migrationで旧`MeteoScopeEarthquakeHub`と保存内容を削除する。
2. `npx wrangler d1 migrations apply EQ_D1 --remote --config workers/earthquake-realtime/wrangler.toml`を実行し、`0003_remove_dmdata.sql`で旧DMDATA用4テーブルを削除する。
3. Pagesの`HYPOCENTER_ARCHIVE` service bindingを反映してWeb版をデプロイする。
4. `npx wrangler secret delete DMDATA_API_KEY --config workers/earthquake-realtime/wrangler.toml`で旧Secretを削除する。

Secretの値はコード、README、ログへ記録しません。
