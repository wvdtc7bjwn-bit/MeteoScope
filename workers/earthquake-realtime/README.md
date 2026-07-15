# MeteoScope earthquake realtime Worker

DM-D.S.S（dmdata.jp）の地震・津波電文をMeteoScope専用のDurable Objectで受信し、D1へ保存する読み取り専用APIです。EQ-appの廃止後もWeb版とiOS版が独立して動作するための基盤です。

公開ルートは次の5種類だけです。

- `GET /api/latest`
- `GET /api/stream`（読み取り専用WebSocket。地震・津波更新通知）
- `GET /api/history?limit=1..100`
- `GET /api/history/{eventId}/stations`
- `GET /api/health`

電文の投入、管理、WebSocket接続、秘密情報を扱うルートは公開Workerから転送しません。DM-D.S.S APIキーは `wrangler secret` で登録し、リポジトリへ保存しないでください。

## 初回構築

現在の本番移行では、既存のWorker script `eqapp-realtime`、Durable Object class `RealtimeHub`、D1 `eq-signal-history`をMeteoScope専用地震基盤として引き継ぎます。これによりDM-D.S.S Secretと過去履歴を失わず、EQ-app本体だけを廃止できます。Cloudflare上の旧リソース名は互換性維持のため残りますが、公開クライアントはMeteoScope Pages APIだけを利用します。

新しいCloudflareアカウントで一から構築する場合は、次の手順を使用します。

1. CloudflareでD1を作成します。

   ```powershell
   npx wrangler d1 create meteoscope-earthquakes
   ```

2. 出力されたIDとWorker名を `wrangler.toml` に設定し、新規Durable Object用のmigrationを追加します。本番リポジトリの現設定は既存namespaceを引き継ぐため、migrationを再適用しません。
3. スキーマを適用します。

   ```powershell
   npx wrangler d1 execute meteoscope-earthquakes --remote --file migrations/0001_earthquake_history.sql
   ```

4. DM-D.S.S APIキーをSecretへ登録します。

   APIキーには `socket.start`、`telegram.get.earthquake`、`gd.earthquake`、`telegram.list`、`telegram.data` と、震度観測点パラメータAPI（`/v2/parameter/earthquake/station`）を取得できる権限が必要です。

   ```powershell
   npx wrangler secret put DMDATA_API_KEY
   ```

5. Workerをデプロイします。既存Workerを引き継ぐ場合、登録済みSecretは値を再取得せず保持されます。

   ```powershell
   npx wrangler deploy
   ```

6. Cloudflare PagesのMeteoScopeプロジェクトで、Service binding `EARTHQUAKE_REALTIME` をWorker `eqapp-realtime` のProductionへ接続します。リポジトリのルート`wrangler.toml`にも同じbindingを定義しています。Previewも確認する場合はPreview環境にも同名bindingを設定します。
7. Pagesを再デプロイし、`https://meteoscope.pages.dev/api/earthquakes/health` が `200` を返すことを確認します。

ローカルでWorkerへ直接つなぐ場合は `npx wrangler dev` でWorkerを起動し、Vite側の `METEOSCOPE_API_TARGET` をそのURL（通常は `http://127.0.0.1:8787`）に設定します。Workerはローカル確認用に `/api/earthquakes/*` も同じ読み取り専用ルートとして受け付けます。未設定時のViteプロキシ先は公開中のMeteoScope Pagesです。

## EQ-appからの切替

停止時間を避ける場合は、先にこのWorkerを稼働させて `/api/health` の `dmdata.connected`、`gdEarthquakeBackfill.lastRunAt`、`dmdataTelegramBackfill.lastRunAt`、`dmdataTelegramBackfill.lastError`、`historyCount` を確認してからMeteoScopeを公開します。その後にEQ-app側のDM-D.S.S接続を停止します。同一APIキーで同時接続できる数は契約条件を確認してください。

過去履歴を残す場合は、EQ-appのD1を一時的に同じ `EQ_D1` へbindするか、CloudflareのD1 export/importで3テーブル（`earthquake_history`、`station_intensities`、`tsunami_history`）を移行します。認証・セッション・Discordのテーブルは移行対象外です。

切替に失敗した場合は、PagesのService bindingを外すだけで新Workerへの到達を止められます。MeteoScopeのコードにEQ-app URLへの自動フォールバックは設けていません。古いサービスへ黙って戻り、廃止後に障害を見逃すことを防ぐためです。

## 動作特性

- DM-D.S.S WebSocket切断時は最大60秒の指数バックオフで再接続します。
- GD地震履歴を5分ごとに直近2日分補完します。
- Telegram List/Dataを5分ごとに差分取得し、地震別津波コメントとVTSE41/51/52を補完します。初回取得は最大40電文に制限し、DM-D.S.S Data APIの50リクエスト/5分上限を超えない構成です。
- 震度観測点の座標はEQ-appと同じDM-D.S.S震度観測点パラメータAPIを起動時に取得し、24時間ごとに更新します。7桁の観測点コードだけを採用し、都道府県・地域コードを観測点として保存しません。取得状態は`/api/health`の`dmdataStationCatalog`で確認できます。
- 履歴は15秒、観測点一覧は24時間Cloudflare Cache APIへ保存します。最新情報と稼働状態はキャッシュしません。
- Web/iOSは`/api/stream`の更新通知を受けると、キャッシュ回避トークン付きで最新情報を再取得します。切断時は従来の定期更新へフォールバックします。
- Durable Objects無料枠の実行時間を超えた場合、公開読み取りAPIはD1の直前正常データへ自動フォールバックします。この間はリアルタイム更新を利用できず、無料枠は00:00 UTCにリセットされます。
- 地震・観測点は30日、津波履歴は90日でD1から削除します。
- 通常接続時のDurable Object alarmは30秒間隔です。概算で1日2,880回のalarm起動に加え、閲覧APIのリクエストが発生します。実際の使用量はCloudflare Analyticsで確認してください。
