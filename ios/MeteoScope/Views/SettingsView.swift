import SwiftUI

struct SettingsView: View {
    @Environment(AppPreferences.self) private var preferences

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

            Section("アプリについて") {
                LabeledContent("アプリ", value: "MeteoScope")
                LabeledContent("バージョン", value: "0.1.0")
                Text("気象庁が公開する防災気象情報を表示します。重要な判断では、気象庁や自治体の公式発表も確認してください。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("設定")
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environment(AppPreferences(store: .preview))
}
