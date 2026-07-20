import SwiftUI

struct AppShellView: View {
    @Environment(WeatherAppModel.self) private var model
    @Environment(AppPreferences.self) private var preferences

    var body: some View {
        @Bindable var model = model

        ZStack {
            if preferences.hasAcceptedLegalDocuments {
                TabView(selection: $model.selectedRootTab) {
                    NavigationStack {
                        MapDashboardView()
                    }
                    .tabItem {
                        Label("地図", systemImage: "map.fill")
                    }
                    .tag(RootTab.map)

                    NavigationStack {
                        FeatureListView()
                    }
                    .tabItem {
                        Label("情報", systemImage: "list.bullet.rectangle")
                    }
                    .tag(RootTab.features)

                    NavigationStack {
                        SettingsView()
                    }
                    .tabItem {
                        Label("設定", systemImage: "gearshape.fill")
                    }
                    .tag(RootTab.settings)
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let notice = model.activeNotice {
                        RemoteNoticeBanner(notice: notice)
                    }
                }

                if let maintenance = model.maintenanceConfiguration {
                    MaintenanceOverlay(configuration: maintenance)
                }
            } else {
                LegalConsentView(onAccept: preferences.acceptLegalDocuments)
            }
        }
        .tint(Color.meteoscopeAccent)
        .task(id: preferences.hasAcceptedLegalDocuments) {
            guard preferences.hasAcceptedLegalDocuments else { return }
            await model.loadRemoteConfigIfNeeded()
        }
        .task(id: preferences.hasAcceptedLegalDocuments) {
            guard preferences.hasAcceptedLegalDocuments else { return }
            await model.observeEarthquakeUpdates()
        }
    }
}

private struct RemoteNoticeBanner: View {
    @Environment(WeatherAppModel.self) private var model
    let notice: RemoteNotice

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: notice.level.systemImage)
                .foregroundStyle(notice.level.color)
            VStack(alignment: .leading, spacing: 2) {
                if let title = notice.title, !title.isEmpty {
                    Text(title)
                        .font(.caption.weight(.bold))
                }
                if let body = notice.body, !body.isEmpty {
                    Text(body)
                        .font(.caption)
                        .lineLimit(2)
                }
            }
            Spacer()
            Button {
                model.dismissNotice(notice)
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
            }
            .accessibilityLabel("お知らせを閉じる")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .meteoGlassSurface(cornerRadius: 16)
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }
}

private struct MaintenanceOverlay: View {
    let configuration: MaintenanceConfiguration

    var body: some View {
        ZStack {
            Color.black.opacity(0.72)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "wrench.and.screwdriver.fill")
                    .font(.largeTitle)
                    .foregroundStyle(Color.meteoscopeAccent)
                Text("メンテナンス中")
                    .font(.title2.bold())
                Text(configuration.message ?? "現在メンテナンス中です。しばらくしてから再度お試しください。")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding(28)
            .meteoGlassSurface(cornerRadius: 22)
            .padding(28)
        }
        .accessibilityAddTraits(.isModal)
    }
}

private extension RemoteNotice.Level {
    var systemImage: String {
        switch self {
        case .info: "info.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .critical: "exclamationmark.octagon.fill"
        }
    }

    var color: Color {
        switch self {
        case .info: .blue
        case .warning: .orange
        case .critical: .red
        }
    }
}

enum RootTab: Hashable {
    case map
    case features
    case settings
}

#Preview("App shell") {
    AppShellView()
        .environment(WeatherAppModel.preview)
        .environment(AppPreferences(store: .preview))
        .environment(LocationService.preview)
        .environment(PushNotificationService())
}
