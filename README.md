# MeteoScope

気象庁データを地図上で確認できる静的 Web アプリです。  
UI は `EQ-app-2026` に近いダークテーマ、左パネル + 地図表示、モバイル向け下シート表示を採用しています。

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
- 共通
  - MapLibre GL による暗色地図
  - 全タブで市区町村区分を表示
  - 凡例の折りたたみ
  - 自動情報更新

## データ取得元

通常の気象表示はブラウザから気象庁の公開データを取得します。Cloudflare Pages Functionsは管理機能とWeb/iOS通知基盤に使用します。

- 雨雲レーダー: 気象庁降水ナウキャストタイル
- アメダス: 気象庁アメダス JSON
- 警報・注意報: 気象庁 `bosai/warning` JSON
- 今後の見通し: 気象庁 `warning_timeline` JSON
- キキクル: 気象庁リスクタイル
- 台風情報: 気象庁台風 JSON
- 市区町村境界: `public/data/jma-weather-warning-municipalities.geojson`
- 都道府県境界: `public/data/japan-prefectures.geojson`
- 震度観測点: `public/data/jma-intensity-stations.json`

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
- アーリーアクセス用シリアルコードの発行、失効

Cloudflare 側で必要な設定:

```text
Environment variables:
ADMIN_PASSWORD          管理者ログイン用パスワード
ADMIN_SESSION_SECRET    任意。セッション署名用の長いランダム文字列
CLOUDFLARE_ZONE_ID      任意。キャッシュ削除APIを使う場合のみ
CLOUDFLARE_API_TOKEN    任意。キャッシュ削除APIを使う場合のみ

D1 database binding:
NOTIFICATIONS_DB        meteoscope-notifications
```

D1のスキーマは `migrations/0001_notification_storage.sql`、
`migrations/0002_app_storage.sql`、`migrations/0003_admin_push_broadcasts.sql`、
`migrations/0004_ios_push_subscriptions.sql` を順番に適用します。通知購読、警報状態、
保留通知、管理設定、お知らせ、利用者意見、アーリーアクセス認証、VAPID鍵は
すべてD1へ保存し、Workers KVは使用しません。Web Pushは管理者からのお知らせ専用で、
現在地、通知対象区域、警報状態を保存しません。iOS版の警報・注意報通知はAPNs用の
購読テーブルで分離して維持します。

通知CronはiOS版の警報・注意報通知を対象とします。Workers Freeの外部サブリクエスト上限50件/呼び出しとD1 Freeの50クエリ/呼び出しを超えないよう、58官署を15官署ずつ4回に分け、D1では4つのまとまりとして保存します。成功した官署スナップショットだけを更新し、取得失敗を「警報なし」として扱いません。1分cronでも全国一巡は約4分に実行時間を加えた値となり、iOS購読数が多い場合の配信はさらに複数分へ分割されます。管理画面で最終一巡、最終全官署成功、失敗官署数、通知結果を確認できます。Web版の管理者通知は同じCronの取得フェーズで別キューとして処理します。

通知Cron内の保持期間整理は1日1回、完了から30日を過ぎた管理者通知履歴、30日以上未取得の
保留通知、期限切れのアーリーアクセス端末認証、孤立した配信明細を自動削除します。
通知購読、現行設定、お知らせ、シリアルコード、VAPID鍵は自動削除しません。

`ADMIN_SESSION_SECRET` を省略した場合は `ADMIN_PASSWORD` を使ってセッション署名します。
GitHub Pages では Pages Functions が動作しないため、管理者画面のAPI機能は Cloudflare Pages 配信時のみ利用できます。通常のアプリ表示は、管理APIが未設定でもそのまま動作します。

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

- このアプリは静的フロントエンドアプリです。Express、Socket.IO、DB、認証処理などのバックエンドは使用しません。
- 気象庁の公開データやタイル URL は変更される可能性があります。
- ブラウザから直接取得できないデータが出た場合は、CORS や URL 変更の影響を確認してください。
- 大きな地図データを扱うため、初回読み込みやビルド時に時間がかかる場合があります。

