import Foundation
import XCTest
@testable import MeteoScope

@MainActor
final class PushNotificationServiceTests: XCTestCase {
    func testDeliveryDisabledNeverBecomesAvailable() throws {
        let state = try PushNotificationService.registrationState(
            registered: true,
            deliveryEnabled: false
        )
        XCTAssertEqual(state, .serverPreparing)
    }

    func testRegisteredAndDeliveryEnabledBecomesAvailable() throws {
        let state = try PushNotificationService.registrationState(
            registered: true,
            deliveryEnabled: true
        )
        XCTAssertEqual(state, .available)
    }

    func testUnregisteredResponseIsRejected() {
        XCTAssertThrowsError(
            try PushNotificationService.registrationState(
                registered: false,
                deliveryEnabled: true
            )
        )
    }

    func testPendingUnregistrationIsClearedAfterSuccess() async {
        let context = makeContext(statusCode: 200, body: #"{"registered":false}"#)
        let token = "ab" + String(repeating: "01", count: 31)
        context.preferences.pendingUnregistrationDeviceToken = token
        context.preferences.registeredNotificationDeviceToken = token

        await context.service.retryPendingUnregistration(preferences: context.preferences)

        XCTAssertEqual(context.preferences.pendingUnregistrationDeviceToken, "")
        XCTAssertEqual(context.preferences.registeredNotificationDeviceToken, "")
        if case .failed = context.service.serverRegistrationState {
            XCTFail("Successful unregistration must not leave a failed state")
        }
    }

    func testPendingUnregistrationRemainsForRetryAfterFailure() async {
        let context = makeContext(statusCode: 503, body: #"{"error":"unavailable"}"#)
        let token = String(repeating: "ab", count: 32)
        context.preferences.pendingUnregistrationDeviceToken = token
        context.preferences.registeredNotificationDeviceToken = token

        await context.service.retryPendingUnregistration(preferences: context.preferences)

        XCTAssertEqual(context.preferences.pendingUnregistrationDeviceToken, token)
        XCTAssertEqual(context.preferences.registeredNotificationDeviceToken, token)
        if case .failed = context.service.serverRegistrationState {
            // Expected: the token remains available for a later retry.
        } else {
            XCTFail("Failed unregistration must expose a failed state")
        }
    }

    func testTurningNotificationsOffUsesLastRegisteredTokenWhenCurrentTokenIsUnavailable() async {
        let context = makeContext(statusCode: 200, body: #"{"registered":false}"#)
        context.preferences.warningNotificationsEnabled = false
        context.preferences.registeredNotificationDeviceToken = String(repeating: "cd", count: 32)

        await context.service.synchronize(preferences: context.preferences)

        XCTAssertEqual(context.preferences.registeredNotificationDeviceToken, "")
        XCTAssertEqual(context.preferences.pendingUnregistrationDeviceToken, "")
    }

    private func makeContext(statusCode: Int, body: String) -> TestContext {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: statusCode,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (response, Data(body.utf8))
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let suiteName = "jp.meteoscope.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return TestContext(
            service: PushNotificationService(session: session),
            preferences: AppPreferences(store: defaults)
        )
    }
}

@MainActor
private struct TestContext {
    let service: PushNotificationService
    let preferences: AppPreferences
}

private final class URLProtocolStub: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
