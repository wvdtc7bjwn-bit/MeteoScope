import SwiftUI

@main
struct MeteoScopeApp: App {
    @State private var model = WeatherAppModel(client: .live())
    @State private var preferences = AppPreferences()
    @State private var locationService = LocationService()

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environment(model)
                .environment(preferences)
                .environment(locationService)
                .preferredColorScheme(preferences.colorScheme)
        }
    }
}
