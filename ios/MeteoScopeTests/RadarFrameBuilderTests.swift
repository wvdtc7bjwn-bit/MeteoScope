import XCTest
@testable import MeteoScope

final class RadarFrameBuilderTests: XCTestCase {
    func testBuildsObservationAndForecastFrames() throws {
        let data = """
        [
          {"basetime":"20260713055000","validtime":"20260713055000","member":"none","elements":["hrpns"]},
          {"basetime":"20260713055500","validtime":"20260713055500","member":"none","elements":["hrpns"]},
          {"basetime":"20260713060000","validtime":"20260713060000","member":"none","elements":["hrpns"]}
        ]
        """.data(using: .utf8)!
        let records = try JSONDecoder().decode([RadarTimeRecord].self, from: data)

        let frames = RadarFrameBuilder.build(from: records)

        XCTAssertEqual(frames.count, 15)
        XCTAssertEqual(frames.filter { !$0.isForecast }.count, 3)
        XCTAssertEqual(frames.filter { $0.isForecast }.count, 12)
        XCTAssertEqual(frames[3].validTime, "20260713060500")
        XCTAssertEqual(frames.last?.validTime, "20260713070000")
    }

    func testFiltersUnsupportedElements() throws {
        let data = """
        [
          {"basetime":"20260713055000","validtime":"20260713055000","elements":["other"]},
          {"basetime":"20260713060000","validtime":"20260713060000","elements":["hrpns"]}
        ]
        """.data(using: .utf8)!
        let records = try JSONDecoder().decode([RadarTimeRecord].self, from: data)

        let frames = RadarFrameBuilder.build(from: records)

        XCTAssertEqual(frames.filter { !$0.isForecast }.count, 1)
        XCTAssertTrue(frames.allSatisfy { $0.baseTime == "20260713060000" })
    }

    func testTileURLMatchesWebAppFormat() {
        let frame = RadarFrame(
            baseTime: "20260713060000",
            validTime: "20260713060500",
            member: "none",
            isForecast: true
        )

        XCTAssertEqual(
            frame.tileURLTemplate,
            "https://www.jma.go.jp/bosai/jmatile/data/nowc/20260713060000/none/20260713060500/surf/hrpns/{z}/{x}/{y}.png"
        )
    }
}
