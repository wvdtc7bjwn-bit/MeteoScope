import XCTest
@testable import MeteoScope

@MainActor
final class AppPreferencesTests: XCTestCase {
    func testEarthquakeMapLayersDefaultToVisibleAndPersistIndependently() {
        let suiteName = "jp.meteoscope.tests.preferences.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        var preferences: AppPreferences? = AppPreferences(store: defaults)
        XCTAssertTrue(preferences?.showsActiveFaults == true)
        XCTAssertTrue(preferences?.showsPlateBoundaries == true)
        XCTAssertTrue(preferences?.showsPlateDepthContours == true)

        preferences?.showsPlateBoundaries = false
        preferences?.showsPlateDepthContours = false
        preferences = nil

        let restored = AppPreferences(store: defaults)
        XCTAssertTrue(restored.showsActiveFaults)
        XCTAssertFalse(restored.showsPlateBoundaries)
        XCTAssertFalse(restored.showsPlateDepthContours)
    }
}
