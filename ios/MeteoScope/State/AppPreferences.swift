import Observation
import SwiftUI

@MainActor
@Observable
final class AppPreferences {
    enum Theme: String, CaseIterable, Identifiable {
        case system
        case dark
        case light

        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: "端末の設定"
            case .dark: "ダーク"
            case .light: "ライト"
            }
        }
    }

    var theme: Theme {
        didSet { store.set(theme.rawValue, forKey: Keys.theme) }
    }

    var automaticallyRefresh: Bool {
        didSet { store.set(automaticallyRefresh, forKey: Keys.automaticallyRefresh) }
    }

    var showsActiveFaults: Bool {
        didSet { store.set(showsActiveFaults, forKey: Keys.showsActiveFaults) }
    }

    var showsPlateBoundaries: Bool {
        didSet { store.set(showsPlateBoundaries, forKey: Keys.showsPlateBoundaries) }
    }

    var showsPlateDepthContours: Bool {
        didSet { store.set(showsPlateDepthContours, forKey: Keys.showsPlateDepthContours) }
    }

    var warningNotificationsEnabled: Bool {
        didSet { store.set(warningNotificationsEnabled, forKey: Keys.warningNotificationsEnabled) }
    }

    var notifyAdvisories: Bool {
        didSet { store.set(notifyAdvisories, forKey: Keys.notifyAdvisories) }
    }

    var notificationAreaCode: String {
        didSet { store.set(notificationAreaCode, forKey: Keys.notificationAreaCode) }
    }

    var notificationAreaName: String {
        didSet { store.set(notificationAreaName, forKey: Keys.notificationAreaName) }
    }

    var notificationPrefecture: String {
        didSet { store.set(notificationPrefecture, forKey: Keys.notificationPrefecture) }
    }

    var pendingUnregistrationDeviceToken: String {
        didSet { store.set(pendingUnregistrationDeviceToken, forKey: Keys.pendingUnregistrationDeviceToken) }
    }

    var registeredNotificationDeviceToken: String {
        didSet { store.set(registeredNotificationDeviceToken, forKey: Keys.registeredNotificationDeviceToken) }
    }

    private let store: UserDefaults

    init(store: UserDefaults = .standard) {
        self.store = store
        self.theme = Theme(rawValue: store.string(forKey: Keys.theme) ?? "") ?? .system
        self.automaticallyRefresh = store.object(forKey: Keys.automaticallyRefresh) as? Bool ?? true
        self.showsActiveFaults = store.object(forKey: Keys.showsActiveFaults) as? Bool ?? true
        self.showsPlateBoundaries = store.object(forKey: Keys.showsPlateBoundaries) as? Bool ?? true
        self.showsPlateDepthContours = store.object(forKey: Keys.showsPlateDepthContours) as? Bool ?? true
        self.warningNotificationsEnabled = store.object(forKey: Keys.warningNotificationsEnabled) as? Bool ?? false
        self.notifyAdvisories = store.object(forKey: Keys.notifyAdvisories) as? Bool ?? false
        self.notificationAreaCode = store.string(forKey: Keys.notificationAreaCode) ?? ""
        self.notificationAreaName = store.string(forKey: Keys.notificationAreaName) ?? ""
        self.notificationPrefecture = store.string(forKey: Keys.notificationPrefecture) ?? ""
        self.pendingUnregistrationDeviceToken = store.string(forKey: Keys.pendingUnregistrationDeviceToken) ?? ""
        self.registeredNotificationDeviceToken = store.string(forKey: Keys.registeredNotificationDeviceToken) ?? ""
    }

    var colorScheme: ColorScheme? {
        switch theme {
        case .system: nil
        case .dark: .dark
        case .light: .light
        }
    }

    private enum Keys {
        static let theme = "meteoscope.theme"
        static let automaticallyRefresh = "meteoscope.automaticallyRefresh"
        static let showsActiveFaults = "meteoscope.earthquake.showsActiveFaults"
        static let showsPlateBoundaries = "meteoscope.earthquake.showsPlateBoundaries"
        static let showsPlateDepthContours = "meteoscope.earthquake.showsPlateDepthContours"
        static let warningNotificationsEnabled = "meteoscope.warningNotificationsEnabled"
        static let notifyAdvisories = "meteoscope.notifyAdvisories"
        static let notificationAreaCode = "meteoscope.notificationAreaCode"
        static let notificationAreaName = "meteoscope.notificationAreaName"
        static let notificationPrefecture = "meteoscope.notificationPrefecture"
        static let pendingUnregistrationDeviceToken = "meteoscope.pendingUnregistrationDeviceToken"
        static let registeredNotificationDeviceToken = "meteoscope.registeredNotificationDeviceToken"
    }
}

extension UserDefaults {
    static let preview: UserDefaults = {
        let suiteName = "jp.meteoscope.preview"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }()
}
