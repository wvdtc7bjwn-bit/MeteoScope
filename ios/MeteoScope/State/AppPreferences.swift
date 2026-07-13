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

    private let store: UserDefaults

    init(store: UserDefaults = .standard) {
        self.store = store
        self.theme = Theme(rawValue: store.string(forKey: Keys.theme) ?? "") ?? .system
        self.automaticallyRefresh = store.object(forKey: Keys.automaticallyRefresh) as? Bool ?? true
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
