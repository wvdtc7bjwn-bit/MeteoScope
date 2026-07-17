import Foundation
import Observation
import Security

@MainActor
@Observable
final class EarlyAccessModel {
    private(set) var isActive = false
    private(set) var label = ""
    private(set) var message = "認証状態を確認していません。"
    private(set) var isLoading = false

    func refresh() async {
        guard let token = EarlyAccessKeychain.load(), !token.isEmpty else {
            isActive = false
            message = "アーリーアクセスのシリアルコードを認証してください。"
            return
        }
        await perform(payload: ["token": token], storesToken: false)
    }

    func activate(code: String) async {
        let value = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { message = "シリアルコードを入力してください。"; return }
        await perform(payload: ["code": value], storesToken: true)
    }

    func deactivate() {
        EarlyAccessKeychain.delete()
        isActive = false
        label = ""
        message = "この端末のアーリーアクセスを解除しました。"
    }

    var token: String? { EarlyAccessKeychain.load() }

    private func perform(payload: [String: String], storesToken: Bool) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: MeteoScopeEndpoints.earlyAccess)
            request.httpMethod = "POST"
            request.timeoutInterval = 12
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(payload)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw EarlyAccessError.invalidResponse }
            let result = try JSONDecoder().decode(EarlyAccessResponse.self, from: data)
            guard 200..<300 ~= http.statusCode, result.active else {
                if !storesToken { EarlyAccessKeychain.delete() }
                throw EarlyAccessError.server(result.error ?? "認証できませんでした。")
            }
            if storesToken, let token = result.token { try EarlyAccessKeychain.save(token) }
            isActive = true
            label = result.label ?? "アーリーアクセス"
            message = "アーリーアクセスが有効です。"
        } catch {
            isActive = false
            message = error.localizedDescription
        }
    }
}

private struct EarlyAccessResponse: Decodable {
    let active: Bool
    let token: String?
    let label: String?
    let error: String?
}

private enum EarlyAccessError: LocalizedError {
    case invalidResponse
    case server(String)
    var errorDescription: String? {
        switch self { case .invalidResponse: "認証サーバーの応答が正しくありません。"; case .server(let value): value }
    }
}

private enum EarlyAccessKeychain {
    private static let service = "jp.meteoscope.ios.early-access"
    private static let account = "token"
    static func save(_ token: String) throws {
        delete()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(token.utf8)
        ]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw EarlyAccessError.invalidResponse }
    }
    static func load() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: account, kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func delete() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                       kSecAttrAccount as String: account] as CFDictionary)
    }
}
