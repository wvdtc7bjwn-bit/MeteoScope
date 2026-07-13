import Observation
import Foundation
import UIKit
import UserNotifications

extension Notification.Name {
    static let meteoScopePushTokenDidUpdate = Notification.Name("MeteoScopePushTokenDidUpdate")
    static let meteoScopePushRegistrationDidFail = Notification.Name("MeteoScopePushRegistrationDidFail")
}

@MainActor
@Observable
final class PushNotificationService: NSObject, UNUserNotificationCenterDelegate {
    enum ServerRegistrationState: Equatable {
        case idle
        case registering
        case registered
        case failed(String)
    }

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private(set) var deviceToken: String?
    private(set) var registrationError: String?
    private(set) var serverRegistrationState: ServerRegistrationState = .idle
    private(set) var availableAreas: [NotificationArea] = []
    private(set) var isLoadingAreas = false
    private let session: URLSession
    private var lastSyncedSignature: String?

    init(session: URLSession = .shared) {
        self.session = session
        super.init()
        UNUserNotificationCenter.current().delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(receiveDeviceToken(_:)),
            name: .meteoScopePushTokenDidUpdate,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(receiveRegistrationError(_:)),
            name: .meteoScopePushRegistrationDidFail,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    var isAuthorized: Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    var statusLabel: String {
        if case .failed = serverRegistrationState { return "サーバー登録エラー" }
        if serverRegistrationState == .registering { return "通知先を登録中" }
        if serverRegistrationState == .registered { return "利用可能" }
        switch authorizationStatus {
        case .notDetermined: "未設定"
        case .denied: "許可されていません"
        case .authorized: deviceToken == nil ? "許可済み・端末登録待ち" : "利用可能"
        case .provisional: "仮許可"
        case .ephemeral: "一時許可"
        @unknown default: "確認中"
        }
    }

    var serverError: String? {
        guard case .failed(let message) = serverRegistrationState else { return nil }
        return message
    }

    func refreshAuthorizationStatus() async {
        authorizationStatus = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if isAuthorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            await refreshAuthorizationStatus()
            return granted
        } catch {
            registrationError = error.localizedDescription
            await refreshAuthorizationStatus()
            return false
        }
    }

    func loadNotificationAreasIfNeeded() async {
        guard availableAreas.isEmpty, !isLoadingAreas else { return }
        isLoadingAreas = true
        defer { isLoadingAreas = false }
        do {
            var request = URLRequest(url: MeteoScopeEndpoints.areaCatalog)
            request.cachePolicy = .returnCacheDataElseLoad
            request.timeoutInterval = 20
            let (data, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse, 200..<300 ~= response.statusCode else {
                throw WeatherAPIError.invalidResponse
            }
            let catalog = try JSONDecoder().decode(JMAAreaCatalog.self, from: data)
            availableAreas = catalog.class20s.map { code, record in
                NotificationArea(
                    code: code,
                    name: record.name,
                    prefecture: WarningCatalog.prefectureName(for: String(code.prefix(2)))
                )
            }
            .sorted {
                if $0.prefecture == $1.prefecture { return $0.code < $1.code }
                return $0.prefecture < $1.prefecture
            }
        } catch {
            registrationError = "通知地域を取得できませんでした。"
        }
    }

    func synchronize(preferences: AppPreferences) async {
        guard let deviceToken else { return }
        if !preferences.warningNotificationsEnabled {
            await unregister(deviceToken: deviceToken)
            return
        }
        guard isAuthorized, !preferences.notificationAreaCode.isEmpty else { return }

        let signature = [
            deviceToken,
            preferences.notificationAreaCode,
            String(preferences.notifyAdvisories)
        ].joined(separator: ":")
        guard signature != lastSyncedSignature else { return }
        serverRegistrationState = .registering

        do {
            let payload = IOSPushRegistrationPayload(
                deviceToken: deviceToken,
                environment: Self.apnsEnvironment,
                area: .init(
                    areaCode: preferences.notificationAreaCode,
                    areaName: preferences.notificationAreaName,
                    prefecture: preferences.notificationPrefecture
                ),
                preferences: .init(notifyAdvisory: preferences.notifyAdvisories)
            )
            let response: IOSPushRegistrationResponse = try await sendJSON(
                payload,
                to: MeteoScopeEndpoints.iosPushRegister
            )
            guard response.registered else { throw WeatherAPIError.invalidResponse }
            lastSyncedSignature = signature
            serverRegistrationState = .registered
            registrationError = nil
        } catch {
            serverRegistrationState = .failed(error.localizedDescription)
        }
    }

    private func unregister(deviceToken: String) async {
        do {
            let _: IOSPushUnregisterResponse = try await sendJSON(
                IOSPushUnregisterPayload(deviceToken: deviceToken),
                to: MeteoScopeEndpoints.iosPushUnregister
            )
            lastSyncedSignature = nil
            serverRegistrationState = .idle
        } catch {
            serverRegistrationState = .failed(error.localizedDescription)
        }
    }

    private func sendJSON<Payload: Encodable, Response: Decodable>(
        _ payload: Payload,
        to url: URL
    ) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, 200..<300 ~= response.statusCode else {
            throw WeatherAPIError.invalidResponse
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private static var apnsEnvironment: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    @objc private func receiveDeviceToken(_ notification: Notification) {
        deviceToken = notification.object as? String
        registrationError = nil
    }

    @objc private func receiveRegistrationError(_ notification: Notification) {
        registrationError = notification.object as? String
    }
}

struct NotificationArea: Identifiable, Hashable, Sendable {
    let code: String
    let name: String
    let prefecture: String

    var id: String { code }
}

private struct IOSPushRegistrationPayload: Encodable {
    struct Area: Encodable {
        let areaCode: String
        let areaName: String
        let prefecture: String
    }

    struct Preferences: Encodable {
        let notifyAdvisory: Bool
    }

    let deviceToken: String
    let environment: String
    let area: Area
    let preferences: Preferences
}

private struct IOSPushRegistrationResponse: Decodable {
    let registered: Bool
}

private struct IOSPushUnregisterPayload: Encodable {
    let deviceToken: String
}

private struct IOSPushUnregisterResponse: Decodable {
    let registered: Bool
}

final class MeteoScopeAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .meteoScopePushTokenDidUpdate, object: token)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .meteoScopePushRegistrationDidFail,
            object: error.localizedDescription
        )
    }
}
