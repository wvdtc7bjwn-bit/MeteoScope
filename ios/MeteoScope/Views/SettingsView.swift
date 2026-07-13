import SwiftUI

struct SettingsView: View {
    @Environment(AppPreferences.self) private var preferences
    @Environment(PushNotificationService.self) private var pushNotifications

    var body: some View {
        @Bindable var preferences = preferences

        Form {
            Section("表示") {
                Picker("テーマ", selection: $preferences.theme) {
                    ForEach(AppPreferences.Theme.allCases) { theme in
                        Text(theme.label).tag(theme)
                    }
                }
                Toggle("気象データを自動更新", isOn: $preferences.automaticallyRefresh)
            }

            Section("通知") {
                Toggle("警報・注意報通知", isOn: $preferences.warningNotificationsEnabled)
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
                LabeledContent("通知権限", value: pushNotifications.statusLabel)
                if let error = pushNotifications.serverError ?? pushNotifications.registrationError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
                Text("通知には地域の選択と端末の通知許可が必要です。APNsの鍵はアプリ内へ保存せず、Cloudflare側のシークレットとして管理します。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("アプリについて") {
                LabeledContent("アプリ", value: "MeteoScope")
                LabeledContent("バージョン", value: "0.1.0")
                Text("気象庁が公開する防災気象情報を表示します。重要な判断では、気象庁や自治体の公式発表も確認してください。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("設定")
        .onChange(of: preferences.warningNotificationsEnabled) { _, enabled in
            Task {
                if enabled {
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
            await pushNotifications.refreshAuthorizationStatus()
            await pushNotifications.loadNotificationAreasIfNeeded()
            await pushNotifications.synchronize(preferences: preferences)
        }
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
}
