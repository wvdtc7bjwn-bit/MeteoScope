# iOSプッシュ通知バックエンド設計

既存のWeb通知はVAPIDを使うWeb Pushであり、iOSネイティブアプリはApple Push Notification service（APNs）を使う。購読保存と警報差分判定は共有できるが、送信処理と端末識別子は分離する。

## 実装済みAPI

### `POST /api/push/ios/register`

```json
{
  "deviceToken": "APNs device token",
  "environment": "sandbox",
  "area": {
    "areaCode": "2920100",
    "areaName": "奈良市",
    "prefecture": "奈良県"
  },
  "preferences": {
    "notifyAdvisory": false
  }
}
```

### `POST /api/push/ios/unregister`

```json
{
  "deviceToken": "APNs device token",
  "environment": "sandbox"
}
```

## D1案

`migrations/0004_ios_push_subscriptions.sql`で`ios_push_subscriptions`を追加する。主キーは端末トークンから作るSHA-256 IDで、APNs環境、対象地域、通知設定、警報状態、作成・更新・最終通知日時をWeb Pushとは別に保存する。

## Cloudflare secrets

- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY`

秘密鍵はリポジトリ、wrangler設定、ログへ書かない。APNs JWTはWorker内で短時間キャッシュし、期限前に更新する。

## 送信処理

1. 既存の1分cronで警報差分を作る。
2. Web Push購読には従来の送信処理を使う。
3. iOS端末にはHTTP/2 APNsリクエストを送る。
4. APNsが`410 Unregistered`を返したトークンを削除する。
5. 同一地域・同一警報の重複通知を抑止する。

実装は`functions/_shared/apns.js`と`functions/api/push/[[path]].js`にある。APNs設定が不足している場合、登録APIはD1へ保存できるが送信は`configured: false`として安全に停止する。`POST /api/push/ios/test`は`X-Push-Check-Token`を必須とし、任意の第三者がテスト送信できないようにしている。

## Cloudflareへ反映するときの順序

1. `0004_ios_push_subscriptions.sql`を対象D1へ適用する。
2. `APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_BUNDLE_ID`、`APNS_PRIVATE_KEY`をsecretへ登録する。
3. `PUSH_CHECK_TOKEN`が設定済みであることを確認する。
4. Pages Functionsをデプロイする。
5. 実機DebugビルドをSandboxとして登録し、`ios/test`で1件送る。
6. Release/TestFlightはProductionへ登録されることを確認する。

秘密鍵や実機トークンをログ、Git、スクリーンショットへ残さない。

## Mac購入前に確定できないもの

- Apple Team IDとKey ID
- APNs `.p8`秘密鍵
- 実機device token
- Sandbox／Productionのend-to-end結果

これらが未設定でも、iOS側の許可画面、地域選択、トークン登録コード、Cloudflare側の保存・JWT生成・APNs送信コードまでは準備済みである。実際のAPNs HTTP/2接続とSandbox／Production結果はMac購入後に確認する。
