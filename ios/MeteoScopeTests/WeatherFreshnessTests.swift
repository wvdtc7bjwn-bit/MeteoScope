import XCTest
@testable import MeteoScope

@MainActor
final class WeatherFreshnessTests: XCTestCase {
    func testRefreshFailurePreservesPreviouslyLoadedDataAndMarksFreshnessUnknown() async {
        var client = WeatherAPIClient.preview(frames: [])
        client.fetchAmedasSnapshot = { throw RefreshFailure.unavailable }
        let model = WeatherAppModel(client: client)
        model.selectedFeature = .amedas
        model.amedasState = .loaded(.preview)

        await model.refreshSelectedFeature()

        guard case .loaded = model.amedasState else {
            return XCTFail("A transient failure must preserve the last successful snapshot")
        }
        XCTAssertTrue(model.freshness(for: .amedas).latestnessUnconfirmed)
    }
}

private enum RefreshFailure: Error {
    case unavailable
}
