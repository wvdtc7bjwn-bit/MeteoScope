# MeteoScope

気象庁データを地図上で確認できる静的 Web アプリです。  
UI はダークテーマ、左パネル + 地図表示、モバイル向け下シート表示を採用しています。

公開URL:

```text
https://wvdtc7bjwn-bit.github.io/MeteoScope/
```

Cloudflare Pages へ移行する場合は、Cloudflare が発行する `*.pages.dev` の URL でも公開できます。
Pages プロジェクト名を `meteoscope` にした場合の標準 URL は `https://meteoscope.pages.dev/` です。

## 主な機能

- 雨雲レーダー
  - 気象庁降水ナウキャストを地図上に表示
  - 観測から予測までの時刻をスライダーで切り替え
  - 3時間前までの過去表示に対応
- アメダス
  - 気温、降水量、風速、積雪量を切り替え表示
  - 拡大時の観測点表示
  - 風速は風向矢印で表示
  - 選択中項目のランキング表示
- 警報・注意報
  - 市区町村別の警報・注意報・危険警報・特別警報を地図に色分け表示
  - 発表中の市区町村リストと地図選択の連動
  - 市区町村詳細モーダル
  - 今後の見通し表示
  - 土砂キキクル、浸水キキクルの切り替え表示
- 台風情報
  - 現在位置、過去経路、予報経路、予報円、強風域、暴風域、暴風警戒域を表示
  - 台風が発表されていない場合は発表なし表示
- 地震・津波情報
  - 直近の地震、震源、各地の震度を表示
  - 各地震に「津波の心配なし」「津波注意報」等を表示
  - 気象庁の津波予報区、到達予想、沿岸・沖合の観測値を地図と詳細に表示
- 共通
  - MapLibre GL による暗色地図
  - 全タブで市区町村区分を表示
  - 凡例の折りたたみ
  - 自動情報更新

## データ取得元

通常の気象表示はブラウザから気象庁の公開データを取得します。地震・津波情報はMeteoScope専用のCloudflare Workerを通じてDM-D.S.S配信データへ統一しています。Cloudflare Pages Functionsは管理機能、Web/iOS通知基盤、地震Workerへの読み取り専用プロキシに使用します。

- 雨雲レーダー: 気象庁降水ナウキャストタイル
- アメダス: 気象庁アメダス JSON
- 警報・注意報: 気象庁 `bosai/warning` JSON
- 今後の見通し: 気象庁 `warning_timeline` JSON
- キキクル: 気象庁リスクタイル
- 台風情報: 気象庁台風 JSON
- 地震情報: DM-D.S.Sを受信するMeteoScope専用Worker（履歴・最新・選択時の観測点）。構築・切替方法は`workers/earthquake-realtime/README.md`を参照
- 津波情報: DM-D.S.SのVTSE41/51/52 JSON電文（警報・注意報・予報、沿岸／沖合観測）
- 市区町村境界: `public/data/jma-weather-warning-municipalities.geojson`
- 都道府県境界: `public/data/japan-prefectures.geojson`
- 震度観測点: `public/data/jma-intensity-stations.json`
- 津波予報区: `public/data/jma-tsunami-forecast-areas.geojson`

各データの提供者、取得URL、再利用条件は[`DATA_SOURCES.md`](DATA_SOURCES.md)を参照してください。市区町村境界、地震区域、都道府県境界、震度観測点は気象庁の公式公開データ由来です。都道府県境界と震度観測点は`npm run data:update:jma`で再生成できます。ArcGIS河川レイヤーは親アイテムの利用条件と原典を確認済みです。

## 開発

```bash
npm install
npm run dev
```

ローカルでは以下の URL で確認できます。

```text
http://127.0.0.1:5173/
```

## ビルド

```bash
npm run build
```

生成物は `dist` に出力されます。

## Cloudflare Pages への移行

Cloudflare Pages ではルート配信になるため、Vite の `base` は `/` のままビルドします。
このリポジトリは `wrangler.toml` と `public/_headers` を含んでいるため、Cloudflare Pages へそのまま載せられます。

### Cloudflare ダッシュボードから接続する場合

1. Cloudflare の `Workers & Pages` → `Create application` → `Pages` を開く
2. GitHub リポジトリ `MeteoScope` を接続する
3. Build settings を以下にする

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
Production branch: main
```

必要に応じて環境変数 `NODE_VERSION=22` を設定してください。
独自ドメインは必須ではなく、まずは `meteoscope.pages.dev` のような Pages 標準 URL で公開できます。

### Wrangler で直接アップロードする場合

Cloudflare の API トークンとアカウント設定が済んでいる環境では、以下で `dist` を Pages にアップロードできます。

```bash
npm run deploy:cloudflare
```

## 管理者画面

Cloudflare Pages で公開する場合は、Pages Functions を使った簡易管理画面を `/admin.html` で利用できます。
ログインは Cloudflare の環境変数 `ADMIN_PASSWORD` に設定したパスワードで行います。

管理者画面でできること:

- お知らせの追加、編集、削除
- お知らせのテロップ表示
- メンテナンス表示のオン、オフ
- Cloudflare キャッシュ削除APIの実行
- D1、キャッシュ削除設定の状態確認
- MeteoScopeアカウント数、DAU、クイズ挑戦数、D1無料枠使用量の確認
- アーリーアクセス用シリアルコードの発行、失効

Cloudflare 側で必要な設定:

```text
Environment variables:
ADMIN_PASSWORD          管理者ログイン用パスワード
ADMIN_SESSION_SECRET    任意。セッション署名用の長いランダム文字列
CLOUDFLARE_ZONE_ID      任意。キャッシュ削除APIを使う場合のみ
CLOUDFLARE_API_TOKEN    任意。キャッシュ削除APIを使う場合のみ
QUIZ_PASSWORD_PEPPER    MeteoScopeアカウントのパスワード保護用の長いランダム文字列
QUIZ_RATE_LIMIT_SECRET  クイズAPIの短期レート制限キーを匿名化する長いランダム文字列
CLOUDFLARE_ACCOUNT_ID   管理画面のCloudflare無料枠監視で使うアカウントID（秘密情報ではない）
CLOUDFLARE_ANALYTICS_API_TOKEN  任意。Account Analytics ReadとD1 Read権限を持つ読取専用トークン

Non-secret variables (wrangler.toml):
QUIZ_ATTEMPT_RETENTION_DAYS     詳細挑戦履歴の保持日数（既定15、7〜365）
QUIZ_LEADERBOARD_CACHE_SECONDS  上位20件のキャッシュ秒数（既定60、30〜300）

D1 database binding:
NOTIFICATIONS_DB        meteoscope-notifications
```

D1のスキーマは `migrations/0001_notification_storage.sql`、
`migrations/0002_app_storage.sql`、`migrations/0003_admin_push_broadcasts.sql`、
`migrations/0004_ios_push_subscriptions.sql`、`migrations/0005_quiz_accounts.sql`、
`migrations/0006_quiz_free_tier_optimization.sql`、`migrations/0007_quiz_daily_points_ranking.sql`、
`migrations/0008_community_reports.sql`を順番に適用します。通知購読、警報状態、
保留通知、管理設定、お知らせ、利用者意見、アーリーアクセス認証、VAPID鍵は
すべてD1へ保存し、Workers KVは使用しません。Web Pushは管理者からのお知らせ専用で、
現在地、通知対象区域、警報状態を保存しません。iOS版の警報・注意報通知はAPNs用の
購読テーブルで分離して維持します。

防災クイズの共有ランキングは、利用者が任意で作成したアカウントだけを対象にします。D1には
アカウントID、公開用表示名、ソルト付きパスワードハッシュ、セッション、サーバー採点済みの
当日の合計得点ランキングを保存します。正解1問を1点として、挑戦ごとの得点を当日分へ加算します。平文パスワードは保存・ログ出力しません。ランキング登録時は
サーバー発行の10問と回答を照合し、クライアントが任意の得点だけを送ることはできません。
`QUIZ_PASSWORD_PEPPER`または`QUIZ_RATE_LIMIT_SECRET`が未設定なら、アカウント登録APIは503で
安全停止し、クイズ本体だけ利用できます。両secretはリポジトリへ保存しないでください。
`QUIZ_PASSWORD_PEPPER`を失うと既存アカウントへログインできなくなるため、安全なsecret管理先で
バックアップします。値の変更にはパスワード再設定またはハッシュ移行の手順が必要です。

ランキング表示は日本時間の日付×アカウント×難易度ごとの当日合計得点から取得し、公開上位20件を
既定60秒キャッシュします。新しい結果が保存された日・難易度のキャッシュは直ちに破棄します。
日本時間0時でランキングを切り替え、前日以前のランキング行はD1から日次削除します。個々の非公開挑戦履歴は既定15日で自動削除します。期限切れの
セッション、出題、レート制限、90日を超えた日次アクティブ記録も1日1回整理します。
既存環境ではWorker／Pagesコードより先に`0006_quiz_free_tier_optimization.sql`と`0007_quiz_daily_points_ranking.sql`を順番に適用してください。

管理画面の「Cloudflare無料枠」では、アカウント全体のWorkersリクエスト、Durable Objectsの
リクエストと実行時間、D1の行読取・行書込・全データベース保存容量をUTC当日分で表示します。
Freeプランの日次枠が切り替わる日本時間9時と最終取得時刻、残量、75%・90%の注意状態も表示します。
Cloudflare Analyticsは請求や上限判定の確定値ではないため、画面上でも概算として扱います。

監視には専用API Tokenへ`Account Analytics Read`と`D1 Read`だけを付与し、
`CLOUDFLARE_ANALYTICS_API_TOKEN`をCloudflare Pagesのsecretとして設定します。
`CLOUDFLARE_ACCOUNT_ID`は`wrangler.toml`の非秘密変数です。取得不能な項目は0と推測せず
「取得不可」と表示し、取得できた項目だけを残します。トークンはレスポンスやログへ出さず、
リポジトリにも保存しません。

通知CronはiOS版の警報・注意報通知を対象とします。Workers Freeの外部サブリクエスト上限50件/呼び出しとD1 Freeの50クエリ/呼び出しを超えないよう、58官署を15官署ずつ4回に分け、D1では4つのまとまりとして保存します。成功した官署スナップショットだけを更新し、取得失敗を「警報なし」として扱いません。1分cronでも全国一巡は約4分に実行時間を加えた値となり、iOS購読数が多い場合の配信はさらに複数分へ分割されます。管理画面で最終一巡、最終全官署成功、失敗官署数、通知結果を確認できます。Web版の管理者通知は同じCronの取得フェーズで別キューとして処理します。

通知Cron内の保持期間整理は1日1回、完了から30日を過ぎた管理者通知履歴、30日以上未取得の
保留通知、期限切れのアーリーアクセス端末認証、孤立した配信明細を自動削除します。
通知購読、現行設定、お知らせ、シリアルコード、VAPID鍵は自動削除しません。
同じ1分Cronの15:00 UTC（日本時間00:00）実行で、前日以前のランキングとクイズ関連の期限切れデータを1日1回D1から削除します。

### 現在地の様子の投稿（アーリーアクセス）

雨雲レーダーには、MeteoScopeアカウントへログインし、アーリーアクセスを認証した利用者だけが
現在の天気、体感、任意の気温、定型の危険情報、80文字以内の短文を投稿できます。写真は扱いません。
短文は制御文字と余分な空白を正規化し、URLを拒否します。表示時はHTMLとして解釈せずエスケープします。
クライアントは位置を0.02度単位（日本付近でおおむね約2km）へ丸めてから送信し、APIも同じ単位へ再丸めします。
正確な緯度経度はMeteoScopeサーバーへ送信・保存しません。

公開表示とD1の`community_reports`は投稿から5時間を有効期限とします。GET APIは期限切れ行を返さず、
通知Cronが5分単位で最大200件ずつ物理削除するため、表示は5時間で終了し、D1からは通常5分以内に順次削除されます。
投稿は同一アカウントで5分に1回、UTC日付ごとに24回までです。日次回数カウンターは2日で削除します。
アーリーアクセス端末認証は最初の投稿時にアカウントへ結び付け、別アカウントでの共有を拒否します。

APIは`GET/POST /api/community/reports`、`DELETE /api/community/reports/:id`、
`POST /api/community/reports/:id/flag`です。GitHub Pages版は許可済みCORSでCloudflare Pages APIを使用します。

`ADMIN_SESSION_SECRET` を省略した場合は `ADMIN_PASSWORD` を使ってセッション署名します。
GitHub Pages では Pages Functions が動作しないため、管理者画面のAPI機能は Cloudflare Pages 配信時のみ利用できます。クイズランキングはGitHub Pagesから許可済みCORSでCloudflare Pages APIへ接続し、外部ホスト用セッションはブラウザのタブを閉じるまでのsessionStorageに限定します。通常のアプリ表示とクイズ本体は、APIが未設定でもそのまま動作します。

## iOS公開準備

- APNs、Cloudflare、App Storeの準備と実機確認: `ios/Docs/APNS_BACKEND_PLAN.md`
- App Store説明、プライバシー回答、審査メモ、素材チェック: `ios/Docs/APP_STORE_PREPARATION.md`
- 安定URL候補: `/privacy.html`、`/terms.html`、`/support.html`

APNsが未設定の環境ではiOS登録APIは503で安全停止し、アプリも「利用可能」と表示しません。device token、秘密鍵、Cloudflare tokenをリポジトリやログへ保存しないでください。通知は遅延・不達があり得る補助機能です。

## GitHub Pages へのデプロイ

このアプリは GitHub Actions で `npm run build` を実行し、生成された `dist` を GitHub Pages に公開します。

1. GitHub のリポジトリ設定で `Settings` → `Pages` を開く
2. `Build and deployment` の `Source` を `GitHub Actions` にする
3. `main` ブランチへ push する

GitHub Actions 上では `GITHUB_PAGES=true` を指定し、Vite の `base` を `/MeteoScope/` にしてビルドします。ローカル開発時と Cloudflare Pages では `/` で動作します。

## 注意

- 通常画面は静的フロントエンドですが、通知、管理、地震リアルタイム受信、MeteoScopeアカウントとランキングにはCloudflare Pages Functions／Workers／D1を使用します。
- 気象庁の公開データやタイル URL は変更される可能性があります。
- ブラウザから直接取得できないデータが出た場合は、CORS や URL 変更の影響を確認してください。
- 大きな地図データを扱うため、初回読み込みやビルド時に時間がかかる場合があります。

