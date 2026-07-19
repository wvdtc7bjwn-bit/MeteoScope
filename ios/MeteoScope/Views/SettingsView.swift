import SwiftUI

struct SettingsView: View {
    @Environment(AppPreferences.self) private var preferences
    @Environment(PushNotificationService.self) private var pushNotifications
    @Environment(EarlyAccessModel.self) private var earlyAccess
    @State private var account = QuizRankingModel()
    @State private var earlyAccessCode = ""

    var body: some View {
        @Bindable var preferences = preferences

        Form {
            Section("MeteoScopeアカウント") {
                if account.enabled, let profile = account.account {
                    LabeledContent("状態", value: "ログイン中")
                    LabeledContent("表示名", value: profile.displayName)
                } else if account.enabled {
                    LabeledContent("状態", value: "未ログイン")
                    Text("ログインまたは新規作成してMeteoScopeアカウントの機能を利用できます。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    LabeledContent("状態", value: account.isLoading ? "確認中" : "準備中")
                    Text("MeteoScopeアカウントの対応機能は今後順次追加します。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                NavigationLink {
                    DisasterQuizView()
                } label: {
                    Label(
                        account.account == nil ? "ログイン・新規作成" : "アカウントを確認・管理",
                        systemImage: "person.crop.circle"
                    )
                }

                Button {
                    Task { await account.refresh(difficulty: .beginner) }
                } label: {
                    Label(account.isLoading ? "確認中" : "アカウント状態を更新", systemImage: "arrow.clockwise")
                }
                .disabled(account.isLoading)

                if let message = account.message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section("表示") {
                Picker("テーマ", selection: $preferences.theme) {
                    ForEach(AppPreferences.Theme.allCases) { theme in
                        Text(theme.label).tag(theme)
                    }
                }
                Toggle("気象データを自動更新", isOn: $preferences.automaticallyRefresh)
            }

            Section("iOS版の警報・注意報通知") {
                Toggle("警報・注意報を通知", isOn: $preferences.warningNotificationsEnabled)
                    .disabled(
                        (!pushNotifications.canEnableNotifications || preferences.notificationAreaCode.isEmpty)
                            && !preferences.warningNotificationsEnabled
                    )
                Toggle("注意報も通知", isOn: $preferences.notifyAdvisories)
                    .disabled(!preferences.warningNotificationsEnabled)
                NavigationLink {
                    NotificationAreaPickerView()
                } label: {
                    LabeledContent(
                        "通知する地域",
                        value: preferences.notificationAreaName.isEmpty
                            ? "未選択"
                            : preferences.notificationAreaName
                    )
                }
                LabeledContent("通知状態", value: pushNotifications.statusLabel)
                LabeledContent("APNs環境", value: pushNotifications.environmentLabel)
                Button {
                    Task { await pushNotifications.refreshServerStatus() }
                } label: {
                    Label(
                        pushNotifications.isRefreshingServerState ? "通知基盤を確認中" : "通知基盤の状態を確認",
                        systemImage: "arrow.clockwise"
                    )
                }
                .disabled(pushNotifications.isRefreshingServerState)
                if !preferences.pendingUnregistrationDeviceToken.isEmpty {
                    Button("通知OFFの登録削除を再試行") {
                        Task { await pushNotifications.retryPendingUnregistration(preferences: preferences) }
                    }
                }
                if let error = pushNotifications.serverError ?? pushNotifications.registrationError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
                Text(notificationExplanation)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text("この設定はiOS版専用です。Web版のプッシュ通知はMeteoScope管理者からのお知らせのみで、警報・注意報は配信しません。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("アーリーアクセス") {
                LabeledContent("状態", value: earlyAccess.isActive ? "認証済み" : "未認証")
                if earlyAccess.isActive {
                    if !earlyAccess.label.isEmpty { LabeledContent("権限", value: earlyAccess.label) }
                    Button("この端末の認証を解除", role: .destructive) {
                        Task { await earlyAccess.deactivate() }
                    }
                    .disabled(earlyAccess.isLoading)
                } else {
                    TextField("シリアルコード", text: $earlyAccessCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Button {
                        Task { await earlyAccess.activate(code: earlyAccessCode) }
                    } label: {
                        Label(earlyAccess.isLoading ? "確認中" : "シリアルコードを認証", systemImage: "key")
                    }
                    .disabled(earlyAccess.isLoading || earlyAccessCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Text(earlyAccess.message).font(.footnote).foregroundStyle(.secondary)
                Text("現在地の様子の投稿は、MeteoScopeアカウントとアーリーアクセスの両方が必要です。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("アプリについて") {
                LabeledContent("アプリ", value: "MeteoScope")
                LabeledContent("バージョン", value: appVersion)
                Text("出典：気象庁ホームページ・気象データ高度利用ポータルサイト。地震・津波情報は気象庁電文をDM-D.S.SからMeteoScope専用Cloudflare Workerが受信・正規化したデータを使用します。MeteoScopeが区域照合、地図への重ね合わせ、配色変換、ランキング化、通知状態の比較を行っています。本アプリは気象庁その他の行政機関が提供する公式アプリではありません。重要な判断では気象庁・自治体等の公式発表も確認してください。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("気象庁 防災情報を開く", destination: MeteoScopeEndpoints.jmaOfficial)
                Link("気象庁ホームページの利用規約", destination: MeteoScopeEndpoints.jmaTerms)
                Link("気象データ高度利用ポータルサイト", destination: MeteoScopeEndpoints.jmaDataPortal)
                Link("DM-D.S.S公式ドキュメント", destination: MeteoScopeEndpoints.dmdataDocumentation)
                Link("DM-D.S.S利用規約", destination: MeteoScopeEndpoints.dmdataTerms)
                Link("地理院タイル（背景地図）の出典", destination: MeteoScopeEndpoints.gsiTiles)
                Text("防災クイズは、気象庁・内閣府・消防庁の公開情報を根拠にMeteoScopeが独自作成しています。気象予報士試験の過去問題・解答例は転載していません。各問題の解説から元の公式情報を確認できます。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text("主要活断層帯は、防災科学技術研究所のJ-SHIS 2022年版・最大ケースを地図に重ね、断層帯名、想定規模（M／Mw）、30年確率を表示用に整形しています。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("J-SHIS主要活断層帯の出典", destination: MeteoScopeEndpoints.jshisMajorFaultAPI)
                Link("J-SHIS利用規約", destination: MeteoScopeEndpoints.jshisTerms)
                Text("プレート境界は、USGS Tectonic Plate Boundaries（境界モデル: Bird, 2003）から日本周辺を抽出し、収束境界・横ずれ境界・その他を配色して表示しています。境界線は概略位置で、個別地点の危険度や断層位置を示すものではありません。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("USGSプレート境界の出典", destination: MeteoScopeEndpoints.usgsPlateBoundarySource)
                Text("プレート等深線は、USGS Slab2の日本周辺モデルから沈み込むプレート上面の深さを20km間隔で抽出し、浅い側を赤、深い側を青の連続色で表示しています。立体表示では深さ帯を画面方向へずらした2.5Dの模式表示を行います。CC0の静的データです。モデル値であり、地点ごとの地下構造や危険度を確定するものではありません。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("USGS Slab2プレート等深線の出典", destination: MeteoScopeEndpoints.usgsSlab2Source)
                Link("USGSの著作権・クレジット案内", destination: MeteoScopeEndpoints.usgsCopyright)
            }

            Section("規約とサポート") {
                Link("プライバシーポリシー", destination: MeteoScopeEndpoints.privacyPolicy)
                Link("利用規約", destination: MeteoScopeEndpoints.termsOfUse)
                Link("サポート・削除依頼", destination: MeteoScopeEndpoints.support)
            }
        }
        .navigationTitle("設定")
        .onChange(of: preferences.warningNotificationsEnabled) { _, enabled in
            Task {
                if enabled {
                    await pushNotifications.refreshServerStatus()
                    guard pushNotifications.canEnableNotifications else {
                        preferences.warningNotificationsEnabled = false
                        return
                    }
                    let granted = await pushNotifications.requestAuthorization()
                    if !granted {
                        preferences.warningNotificationsEnabled = false
                        return
                    }
                }
                await pushNotifications.synchronize(preferences: preferences)
            }
        }
        .onChange(of: preferences.notifyAdvisories) { _, _ in
            Task { await pushNotifications.synchronize(preferences: preferences) }
        }
        .onChange(of: preferences.notificationAreaCode) { _, _ in
            Task { await pushNotifications.synchronize(preferences: preferences) }
        }
        .onChange(of: pushNotifications.deviceToken) { _, _ in
            Task { await pushNotifications.synchronize(preferences: preferences) }
        }
        .task {
            await account.refresh(difficulty: .beginner)
            await earlyAccess.refresh()
            await pushNotifications.refreshServerStatus()
            await pushNotifications.refreshAuthorizationStatus()
            await pushNotifications.loadNotificationAreasIfNeeded()
            await pushNotifications.synchronize(preferences: preferences)
        }
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "--"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "--"
        return "\(version) (\(build))"
    }

    private var notificationExplanation: String {
        if !pushNotifications.canEnableNotifications {
            return "通知サーバーの準備が完了するまで購読は有効化できません。主要な気象情報は通知や位置情報を許可しなくても確認できます。"
        }
        if preferences.notificationAreaCode.isEmpty {
            return "先に通知する地域を選択してください。位置情報を許可しなくても地域は手動で選択できます。"
        }
        return "通知は補助機能です。端末設定、通信状況、Appleまたは配信基盤の状態により遅延・不達となる場合があります。"
    }
}

private struct NotificationAreaPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppPreferences.self) private var preferences
    @Environment(PushNotificationService.self) private var pushNotifications
    @State private var query = ""

    private var filteredAreas: [NotificationArea] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return pushNotifications.availableAreas }
        return pushNotifications.availableAreas.filter {
            $0.name.localizedStandardContains(trimmed)
                || $0.prefecture.localizedStandardContains(trimmed)
                || $0.code.contains(trimmed)
        }
    }

    var body: some View {
        Group {
            if pushNotifications.isLoadingAreas && pushNotifications.availableAreas.isEmpty {
                ProgressView("地域一覧を読み込んでいます")
            } else if filteredAreas.isEmpty {
                ContentUnavailableView.search(text: query)
            } else {
                List(filteredAreas) { area in
                    Button {
                        preferences.notificationAreaCode = area.code
                        preferences.notificationAreaName = area.name
                        preferences.notificationPrefecture = area.prefecture
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(area.name).foregroundStyle(.primary)
                                Text("\(area.prefecture)・\(area.code)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if preferences.notificationAreaCode == area.code {
                                Image(systemName: "checkmark").foregroundStyle(Color.meteoscopeAccent)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("通知する地域")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "市区町村名で検索")
        .task {
            await pushNotifications.loadNotificationAreasIfNeeded()
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environment(AppPreferences(store: .preview))
    .environment(PushNotificationService())
    .environment(EarlyAccessModel())
}
