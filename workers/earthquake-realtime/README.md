# MeteoScope earthquake realtime Worker

DM-D.S.S（dmdata.jp）の地震・津波電文をMeteoScope専用のDurable Objectで受信し、D1へ保存する読み取り専用APIです。旧アプリの廃止後もWeb版とiOS版が独立して動作するための基盤です。

公開ルートは次の6種類だけです。

- `GET /api/latest`
- `GET /api/stream`（読み取り専用WebSocket。地震・津波更新通知）
- `GET /api/history?limit=1..100`
- `GET /api/history/{eventId}/stations`
- `GET /api/health`
- `GET /api/distribution?dayOffset=0..1095&minMagnitude=all|0..5&maxDepth=all|30|100|300|700`

電文の投入、管理、WebSocket接続、秘密情報を扱うルートは公開Workerから転送しません。DM-D.S.S APIキーは `wrangler secret` で登録し、リポジトリへ保存しないでください。

## 震央分布

震央分布は気象庁「日々の震源リスト」の日付別HTMLを毎日00:00（日本時間）に取得し、1日分のJSONをD1の1行へまとめて保存します。地震1件ごとのINSERTは行いません。ブラウザとiOSから気象庁へ直接アクセスせず、画面閲覧をきっかけにD1へ書き込む処理もありません。取得済みの日は再取得せず、失敗時も6時間は再試行しません。保持対象は、うるう年を含む36か月を欠かさない最新1,096日分です。新しい公開日を保存できた場合だけ1,097件目以降の最古データを削除するため、気象庁側で最新日が未公開でも古いデータだけが消えることはありません。

選択日の震源JSONは`source_date`主キーで1行だけ取得します。日付一覧・直近90日の日別件数・6か月より古い期間の月別件数索引・同期状態は共通サマリーとして5分間キャッシュし、検索条件や利用者ごとに1,096日分を再走査しません。月全件をD1の1行へ詰めると2 MBの行上限を超える可能性があるため、月単位にまとめる対象は軽量な件数索引だけとし、震源本体は安全な日別行を維持します。

異常なデータ量から無料枠を守るため、1日5,000件またはJSON 1.5 MBを超える日は保存せず、同期エラーとして記録します。Cloudflare D1の現行上限はFreeで1日100,000 rows written、1行2 MBです。震央分布は通常、成功時に日別データ1行と同期状態1行だけを書き込みます（D1の課金メトリクスでは主キー索引の更新分が追加計上される場合があります）。上限値は公開前と料金プラン変更時に[公式料金](https://developers.cloudflare.com/d1/platform/pricing/)と[公式上限](https://developers.cloudflare.com/d1/platform/limits/)で再確認してください。

初回補完は1分間隔で1回最大15日分です。現在の30日分から1,096日分までは、取得失敗がなければ72回・約72分で補完します。1回15件の外部fetch、日別D1 batch、状態確認・清掃を合わせてWorkers Freeの1回50クエリ/サブリクエスト上限以内に固定します。1,096日未満の状態を検出した場合は、古い未取得日を候補へ加えて不足分を優先補完します。1,096日分が揃うと高速補完は外部fetchとD1書き込みを停止し、完了状態を6時間キャッシュします。毎日00:00の通常Cronは継続し、新しい公開日を1件保存して最古の1件を削除し、1,096件を維持します。同期結果は「取得失敗」「保存欠落」「気象庁公開待ち」を分けてAPIとWeb/iOSへ返します。

APIは最新日を0とする`dayOffset`で日付を選び、選択された1日分だけを返します。Web/iOSは要約バーまたは地震カードから最大1,096日（36か月相当）を切り替えます。API応答は5分キャッシュし、画面には気象庁の暫定値で後日変更される場合があることを表示します。管理画面では`meteoscope-earthquakes`を500 MBのデータベース上限に対して個別監視し、100 MB・200 MB・350 MBを段階的な注意基準として表示します。

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
   npx wrangler d1 execute meteoscope-earthquakes --remote --file migrations/0002_jma_daily_hypocenters.sql
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

- DM-D.S.Sは`telegram.earthquake`だけを`dmdata.v2` WebSocketで購読し、ping/pong応答、チケット期限前の接続更新、切断時の指数バックオフ再接続、接続直後のGD補完を行います。`eew.forecast`は購読しません。
- Durable Objectが無料枠超過等で停止しても、通常Workerの1分CronがDM-D.S.S GD地震履歴をMeteoScope D1へ補完します。公開APIがD1フォールバックへ移行した際も同じ処理を排他制御付きで起動します。地震一覧は最大約1分遅れで継続しますが、この経路だけでは新規観測点詳細や津波電文を補完しません。
- GD地震履歴を5分ごとに直近2日分補完します。
- Telegram List/Dataを5分ごとに差分取得し、地震別津波コメントとVTSE41/51/52を補完します。初回取得は最大40電文に制限し、DM-D.S.S Data APIの50リクエスト/5分上限を超えない構成です。
- 震度観測点の座標はDM-D.S.S震度観測点パラメータAPIから起動時に取得し、24時間ごとに更新します。7桁の観測点コードだけを採用し、都道府県・地域コードを観測点として保存しません。取得状態は`/api/health`の`dmdataStationCatalog`で確認できます。
- 履歴は15秒、観測点一覧は24時間Cloudflare Cache APIへ保存します。最新情報と稼働状態はキャッシュしません。
- Web/iOSは`/api/stream`の更新通知を受けると、キャッシュ回避トークン付きで最新情報を再取得します。切断時は従来の定期更新へフォールバックします。
- Durable Objects無料枠の実行時間を超えた場合、公開読み取りAPIはD1の直前正常データへ自動フォールバックします。この間はリアルタイム更新を利用できず、無料枠は00:00 UTCにリセットされます。
- Cloudflareは2026年6月以降、外向きWebSocket接続中のDurable Objectを稼働状態として保持し、durationを計上します。24時間の即時受信を安定運用する場合はWorkers Paidを前提とし、FreeではD1フォールバックへ移行する時間帯が発生し得ます。上限は[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)と[outbound connectionsの変更](https://developers.cloudflare.com/changelog/post/2026-06-19-outbound-connections-keep-dos-alive/)を公開前に再確認してください。
- 地震履歴と紐づく観測点震度は1か月、津波履歴は90日でD1から自動削除します。削除処理はDurable ObjectのAlarmから1日1回だけ実行し、観測点震度を先に削除してから地震履歴を削除します。
- 通常接続時のDurable Object alarmは30秒間隔です。概算で1日2,880回のalarm起動に加え、閲覧APIのリクエストが発生します。実際の使用量はCloudflare Analyticsで確認してください。
