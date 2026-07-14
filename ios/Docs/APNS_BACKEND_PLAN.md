# iOSプッシュ通知バックエンド運用設計

最終更新: 2026-07-14

既存のWeb通知はWeb Push、iOSネイティブアプリはApple Push Notification service（APNs）を使う。購読保存と警報差分判定の考え方は共有するが、送信処理、端末識別子、解除処理は分離する。

## APIと状態

- `GET /api/push/ios/config`: APNs設定、登録可否、受入環境、無料枠向け警報収集状態を返す。
- `POST /api/push/ios/register`: APNs設定済みの場合だけ登録する。成功応答の`deliveryEnabled`をiOSが確認し、falseなら「利用可能」にしない。
- `POST /api/push/ios/unregister`: 登録を削除する。iOS側は失敗したtokenを端末内に削除待ちとして保持し再試行する。
- `POST /api/push/ios/test`: `X-Push-Check-Token`を必須にし、登録済みの自端末へテスト送信する。

登録状態は「未設定」「端末登録中」「通知サーバー準備中」「利用可能」「登録エラー」を区別する。通知は遅延・不達があり得る補助機能であり、配信保証やリアルタイムという表現は使用しない。

登録例（区域コードは気象庁の最新`class20s`に存在する値）:

```json
{
  "deviceToken": "64文字以上の16進APNs device token",
  "environment": "sandbox",
  "area": {
    "areaCode": "2920101",
    "areaName": "奈良市西部",
    "prefecture": "奈良県"
  },
  "preferences": {
    "notifyAdvisory": false
  }
}
```

## 入力検証と濫用対策

- APNs未設定時は新規登録を503で拒否する。
- JSON本文は4 KiBまで。Content-Lengthだけを信用せず、読み取った本文長も検査する。
- device tokenは偶数長の16進文字列、64〜200文字。
- environmentは`sandbox`または`production`のみ。
- areaCodeは7桁かつ気象庁`area.json`の`class20s`に実在することをサーバーで確認する。
- areaName、prefecture、officeCodeは公式カタログ値に正規化し、利用者入力を信用しない。
- device token、APNs秘密鍵、JWTをログ、管理API、公開APIの一覧へ出さない。
- APNsの`410 Unregistered`、`400 BadDeviceToken`、`DeviceTokenNotForTopic`等は無効トークンとして削除する。
- 180日更新のないiOS購読を定期削除する。

コードでは任意の`IOS_REGISTRATION_RATE_LIMITER` bindingに対応する。Cloudflare dashboardでWorkers Rate Limiting bindingを作成し、1端末/IP由来の登録試行を例として1分10回以下に制限する。Cloudflareのプラン・機能は変更され得るため、本番設定画面の利用可否と課金条件を設定時に確認する。binding未設定でも入力検証は働くが、一般公開前はWAF/Rate LimitingまたはApp Attestのいずれかを必須とする。

App Attestを採用する場合は、端末でattestation/key assertionを作り、サーバー側でAppleの検証手順に従ってchallenge、counter、bundle identifier、team identifierを検証する。単にヘッダーが存在するだけで信頼しない。初回TestFlightではCloudflare Rate Limitingを先行し、App Attestは実機で失敗時の復旧導線まで検証してから段階導入する。

## Cloudflare Workers Freeの官署分割

2026-07-14確認時点のCloudflare公式上限は、Workers Freeで1回の呼び出しにつき外部サブリクエスト50件、Cloudflare内部サービスへのサブリクエスト1,000件、1日100,000リクエスト。D1固有のFree上限は1回のWorker呼び出しにつき50クエリである。58官署を1回で取得せず、D1も58行を個別に読まない。

実装はD1の`app_records`を使う二段階方式:

1. 取得フェーズは1回15官署を取得し、成功した官署スナップショットだけをD1へ保存する。15官署単位の4レコードにまとめ、通知判定時のD1読み取りは4クエリに抑える。
2. 58官署は4回のcronで一巡する。cronが1分間隔なら全国収集の理論最大周期は約4分に、実行・配信時間を加えた値になる。
3. 1官署の取得失敗時は直前の正常スナップショットを残し、空配列や「警報なし」で上書きしない。
4. 一巡後の通知フェーズはWeb/iOS購読を1回6件ずつ処理する。管理者通知は官署取得フェーズだけ1回4件まで処理し、警報通知フェーズ中は警報を優先して次の取得フェーズまで延期する。外部サブリクエストは官署取得時最大19件、通知判定時最大7件に抑える。D1クエリも保持期間整理や無効購読削除が重なる場合を含め50件未満の余裕を取る。
5. 管理画面にphase、最終一巡時刻、最終全官署成功時刻、失敗官署数、通知結果、最大遅延見込みを表示する。

大量の購読がある場合、通知フェーズは複数分にまたがる。これは配信保証でもリアルタイム配信でもない。Paidへ移行して上限が増えても、失敗時の状態保持と監視は維持する。

## D1とsecrets

`migrations/0004_ios_push_subscriptions.sql`で`ios_push_subscriptions`を追加する。主キーは端末トークンから作るSHA-256 IDで、APNs環境、対象地域、通知設定、警報状態、作成・更新・最終通知日時をWeb Pushとは別に保存する。

Secrets:

- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY`
- `PUSH_CHECK_TOKEN`

秘密鍵はリポジトリ、wrangler設定、ログへ書かない。APNs JWTは短時間キャッシュし、期限前に更新する。PreviewとProductionは別の環境として設定し、Production secretsをPreviewへ複製しない。

## Cloudflareへ反映するときの順序

1. `0004_ios_push_subscriptions.sql`を対象D1へ適用する。
2. Pages Functions/Workerの対象環境へ上記secretsを登録する。
3. `IOS_REGISTRATION_RATE_LIMITER`またはWAF/Rate Limiting ruleを設定する。
4. デプロイ前に`GET /api/push/ios/config`が`registrationEnabled: false`で安全停止することを確認する。
5. デプロイ後にAPNs設定済みで`registrationEnabled: true`となることを確認する。
6. Debug実機をSandboxとして登録し、テスト通知、OFF削除、失敗再試行を確認する。
7. TestFlightをProductionとして登録し、同じ項目を別に確認する。
8. 管理画面で官署一巡、失敗官署、通知結果を数周期監視する。

## Mac購入前に確定できないもの

- Apple Team IDとKey ID、APNs `.p8`秘密鍵
- 実機device token
- Sandbox／Productionのend-to-end結果
- App Attestの実機attestationと復旧動作

これらは実施したように報告しない。WindowsではAPI、D1保存、入力検証、状態遷移、文書、静的検査、JavaScriptテストまで準備し、macOS/Xcodeで最終確認する。
