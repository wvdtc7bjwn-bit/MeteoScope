# Mac購入後の引き継ぎ手順

## 1. リポジトリを移行する

GitHubにあるWeb版と`ios`ディレクトリを同じリポジトリとしてMacへcloneする。ZIPで移行する場合も、`ios/MeteoScope`、`ios/MeteoScopeTests`、`ios/project.yml`を同じ階層に保つ。

## 2. 開発環境を準備する

```sh
xcode-select --install
brew install xcodegen
cd Weather-viewer/ios
xcodegen generate
open MeteoScope.xcodeproj
```

初回はMapLibreパッケージの解決が終わるまで待つ。

## 3. 署名を設定する

1. XcodeのAccountsへApple Developerアカウントを追加する。
2. MeteoScopeターゲットのSigning & CapabilitiesでTeamを選択する。
3. Bundle Identifier `jp.meteoscope.ios`が利用可能か確認する。利用済みの場合は固有のIDへ変更する。
4. 生成済みentitlementsのPush Notifications capabilityが署名へ反映されていることを確認する。
5. Background ModesのRemote notificationsを、バックグラウンド処理が必要になった段階で追加する。

## 4. 段階テストする

1. iOS 18シミュレーターで従来Material表示を確認する。
2. iOS 26シミュレーターでLiquid Glass表示を確認する。
3. Dynamic Typeを最大付近まで上げ、カードやランキングが欠けないか確認する。
4. ダークモード、ライトモード、横書き日本語、VoiceOverラベルを確認する。
5. iPhone実機で位置情報、ネットワーク切断、通知許可／拒否を確認する。

SwiftUI Previewでは、次のファイルを開くと通信に依存しない主要状態を選べる。

- `MeteoScope/Views/FeatureDashboardCards.swift`: アメダス、警報の発表・早期・河川、台風、地震
- `MeteoScope/Views/DisasterMapView.swift`: 未登録、画像上の目印、目印エディター
- `MeteoScope/Views/MapDashboardView.swift`: 地図を含む画面全体

## 5. Liquid Glassを最終調整する

- 地図、警報色、震度色の視認性を優先する。
- ガラス効果が多すぎてスクロールや地図操作が重い場合は、操作部品と最上位カード以外を従来Materialへ戻す。
- iOS 17・18のフォールバックを削除しない。
- Xcode 16.4とXcode 26.2のGitHub Actionsを両方通す。

## 6. APNsを接続する

1. Apple DeveloperでAPNs認証キーを作成する。
2. `0004_ios_push_subscriptions.sql`をCloudflare D1へ適用する。
3. Key ID、Team ID、Bundle ID、`.p8`をCloudflareのsecretとして登録する。
4. Xcode署名後、アプリ設定で通知地域を選び、実機トークンが登録されることを確認する。
5. DebugのSandbox APNsで試験後、Release/TestFlightのProductionを試験する。
6. 通知をOFFにした端末と無効トークンをD1から削除できることを確認する。

## 7. TestFlightとApp Store

1. Archive前にバージョンとビルド番号を更新する。
2. Product > ArchiveからApp Store Connectへ送信する。
3. TestFlight内部テストで主要機能を確認する。
4.プライバシー回答、サポートURL、スクリーンショット、審査メモを入力する。
5. 気象情報が公的判断の代替ではない旨を説明文と審査メモに残す。

## Macでしか完了できない項目

- Xcodeの実ビルド、シミュレーター、SwiftUI Preview
- コード署名、entitlements、Archive
- 実機の位置情報とAPNs end-to-end試験
- TestFlight／App Storeへのアップロード
- InstrumentsによるLiquid Glass描画性能の測定
