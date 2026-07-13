import SwiftUI

@main
struct MeteoScopeApp: App {
    @UIApplicationDelegateAdaptor(MeteoScopeAppDelegate.self) private var appDelegate
    @State private var model = WeatherAppModel(client: .live())
    @State private var preferences = AppPreferences()
    @State private var locationService = LocationService()
    @State private var pushNotifications = PushNotificationService()

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environment(model)
                .environment(preferences)
                .environment(locationService)
                .environment(pushNotifications)
                .preferredColorScheme(preferences.colorScheme)
                .task {
                    await pushNotifications.refreshAuthorizationStatus()
                }
        }
    }
}
