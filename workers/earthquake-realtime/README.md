# MeteoScope earthquake realtime Worker

DM-D.S.S（dmdata.jp）の地震・津波電文をMeteoScope専用のDurable Objectで受信し、D1へ保存する読み取り専用APIです。旧アプリの廃止後もWeb版とiOS版が独立して動作するための基盤です。

公開ルートは次の5種類だけです。

- `GET /api/latest`
- `GET /api/stream`（読み取り専用WebSocket。地震・津波更新通知）
- `GET /api/history?limit=1..100`
- `GET /api/history/{eventId}/stations`
- `GET /api/health`

電文の投入、管理、WebSocket接続、秘密情報を扱うルートは公開Workerから転送しません。DM-D.S.S APIキーは `wrangler secret` で登録し、リポジトリへ保存しないでください。

## 初回構築

Worker script `meteoscope-earthquake-realtime`、Durable Object class `MeteoScopeEarthquakeHub`、D1 `meteoscope-earthquakes` はすべてMeteoScope専用です。旧アプリのWorker、Durable Object、D1、URLへは接続しません。

新しいCloudflareアカウントで一から構築する場合は、次の手順を使用します。

1. CloudflareでD1を作成します。

   ```powershell
   npx wrangler d1 create meteoscope-earthquakes
   ```

2. 出力されたIDを `wrangler.toml` に設定します。Durable Object migrationは同ファイルの `v1` を使用します。
3. スキーマを適用します。

   ```powershell
   npx wrangler d1 execute meteoscope-earthquakes --remote --file migrations/0001_earthquake_history.sql
   ```

4. DM-D.S.S APIキーをSecretへ登録します。

   APIキーには `socket.start`、`telegram.get.earthquake`、`gd.earthquake`、`telegram.list`、`telegram.data` と、震度観測点パラメータAPI（`/v2/parameter/earthquake/station`）を取得できる権限が必要です。

   ```powershell
   npx wrangler secret put DMDATA_API_KEY --name meteoscope-earthquake-realtime
   ```

5. Workerをデプロイします。SecretはWorkerごとに管理されるため、新しいWorkerへ必ず登録してください。

   ```powershell
   npx wrangler deploy
   ```

6. Cloudflare PagesのMeteoScopeプロジェクトで、Service binding `EARTHQUAKE_REALTIME` をWorker `meteoscope-earthquake-realtime` のProductionへ接続します。リポジトリのルート`wrangler.toml`にも同じbindingを定義しています。Previewも確認する場合はPreview環境にも同名bindingを設定します。
7. Pagesを再デプロイし、`https://meteoscope.pages.dev/api/earthquakes/health` が `200` を返すことを確認します。

ローカルでWorkerへ直接つなぐ場合は `npx wrangler dev` でWorkerを起動し、Vite側の `METEOSCOPE_API_TARGET` をそのURL（通常は `http://127.0.0.1:8787`）に設定します。Workerはローカル確認用に `/api/earthquakes/*` も同じ読み取り専用ルートとして受け付けます。未設定時のViteプロキシ先は公開中のMeteoScope Pagesです。

## 旧基盤からの切替

停止時間を避ける場合は、先にこのWorkerを稼働させて `/api/health` の `dmdata.connected`、`gdEarthquakeBackfill.lastRunAt`、`dmdataTelegramBackfill.lastRunAt`、`dmdataTelegramBackfill.lastError`、`historyCount` を確認してからMeteoScopeを公開します。その後に旧基盤側のDM-D.S.S接続を停止します。同一APIキーで同時接続できる数は契約条件を確認してください。

過去履歴を別のD1から移す場合は、CloudflareのD1 export/importで3テーブル（`earthquake_history`、`station_intensities`、`tsunami_history`）だけを移行します。認証・セッション・Discord等の旧基盤テーブルは移行対象外です。移行前後で各テーブルの件数を照合し、確認が終わるまで移行元D1を削除しないでください。

切替に失敗した場合は、PagesのService bindingを外すだけで新Workerへの到達を止められます。MeteoScopeのコードに旧基盤URLへの自動フォールバックは設けていません。古いサービスへ黙って戻り、廃止後に障害を見逃すことを防ぐためです。

## 動作特性

- DM-D.S.S WebSocket切断時は最大60秒の指数バックオフで再接続します。
- GD地震履歴を5分ごとに直近2日分補完します。
- Telegram List/Dataを5分ごとに差分取得し、地震別津波コメントとVTSE41/51/52を補完します。初回取得は最大40電文に制限し、DM-D.S.S Data APIの50リクエスト/5分上限を超えない構成です。
- 震度観測点の座標はDM-D.S.S震度観測点パラメータAPIから起動時に取得し、24時間ごとに更新します。7桁の観測点コードだけを採用し、都道府県・地域コードを観測点として保存しません。取得状態は`/api/health`の`dmdataStationCatalog`で確認できます。
- 履歴は15秒、観測点一覧は24時間Cloudflare Cache APIへ保存します。最新情報と稼働状態はキャッシュしません。
- Web/iOSは`/api/stream`の更新通知を受けると、キャッシュ回避トークン付きで最新情報を再取得します。切断時は従来の定期更新へフォールバックします。
- Durable Objects無料枠の実行時間を超えた場合、公開読み取りAPIはD1の直前正常データへ自動フォールバックします。この間はリアルタイム更新を利用できず、無料枠は00:00 UTCにリセットされます。
- Cloudflareは2026年6月以降、外向きWebSocket接続中のDurable Objectを稼働状態として保持し、durationを計上します。24時間の即時受信を安定運用する場合はWorkers Paidを前提とし、FreeではD1フォールバックへ移行する時間帯が発生し得ます。上限は[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)と[outbound connectionsの変更](https://developers.cloudflare.com/changelog/post/2026-06-19-outbound-connections-keep-dos-alive/)を公開前に再確認してください。
- 地震・観測点は30日、津波履歴は90日でD1から削除します。
- 通常接続時のDurable Object alarmは30秒間隔です。概算で1日2,880回のalarm起動に加え、閲覧APIのリクエストが発生します。実際の使用量はCloudflare Analyticsで確認してください。
