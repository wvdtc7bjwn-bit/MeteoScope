import XCTest
@testable import MeteoScope

final class RemoteAppConfigTests: XCTestCase {
    func testDecodesMissingOptionalCollections() throws {
        let data = """
        {"maintenance":{"enabled":false}}
        """.data(using: .utf8)!

        let config = try JSONDecoder().decode(RemoteAppConfig.self, from: data)

        XCTAssertEqual(config.maintenance?.enabled, false)
        XCTAssertTrue(config.notices.isEmpty)
    }

    func testNoticeDefaultsMatchWebBehavior() throws {
        let data = """
        {"notices":[{"id":"notice-1","title":"お知らせ","body":"本文"}]}
        """.data(using: .utf8)!

        let config = try JSONDecoder().decode(RemoteAppConfig.self, from: data)
        let notice = try XCTUnwrap(config.notices.first)

        XCTAssertEqual(notice.id, "notice-1")
        XCTAssertEqual(notice.level, .info)
        XCTAssertTrue(notice.enabled)
        XCTAssertFalse(notice.isTicker)
    }
}
