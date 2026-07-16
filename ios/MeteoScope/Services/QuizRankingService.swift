import Foundation
import Observation
import Security

struct QuizRankingAccount: Codable, Equatable {
    let id: String
    let displayName: String
}

struct QuizRankingEntry: Codable, Identifiable, Equatable {
    let rank: Int
    let displayName: String
    let points: Int
    let attemptCount: Int
    let completedAt: String
    let isCurrentUser: Bool

    var id: String { "\(rank)-\(displayName)-\(completedAt)" }
}

struct QuizRankingCurrentUser: Codable, Equatable {
    let rank: Int
    let points: Int
    let attemptCount: Int
    let completedAt: String
}

struct QuizRankingChallenge: Codable, Equatable {
    let challengeID: String
    let difficulty: DisasterQuizDifficulty
    let questionIDs: [String]
    let expiresAt: String
}

struct QuizRankingAnswer: Codable, Equatable {
    let questionId: String
    let answer: String
}

struct QuizRankingSubmission: Codable, Equatable {
    let recorded: Bool
    let difficulty: DisasterQuizDifficulty
    let score: Int
    let total: Int
    let pointsEarned: Int
    let rankingDate: String
    let completedAt: String
}

@MainActor
@Observable
final class QuizRankingModel {
    private(set) var enabled = false
    private(set) var account: QuizRankingAccount?
    private(set) var entries: [QuizRankingEntry] = []
    private(set) var currentUser: QuizRankingCurrentUser?
    private(set) var isLoading = false
    private(set) var message: String?
    private let client: QuizRankingClient

    init(client: QuizRankingClient = .live()) {
        self.client = client
    }

    func refresh(difficulty: DisasterQuizDifficulty) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let configuration = try await client.configuration()
            enabled = configuration.enabled
            guard enabled else {
                account = nil
                entries = []
                currentUser = nil
                message = "ランキング基盤は現在準備中です。"
                return
            }
            account = try await client.account()
            try await loadLeaderboard(difficulty: difficulty)
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    func register(username: String, displayName: String, password: String, difficulty: DisasterQuizDifficulty) async {
        await authenticate {
            try await client.register(username, displayName, password)
        } difficulty: difficulty
    }

    func login(username: String, password: String, difficulty: DisasterQuizDifficulty) async {
        await authenticate {
            try await client.login(username, password)
        } difficulty: difficulty
    }

    func logout(difficulty: DisasterQuizDifficulty) async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await client.logout()
            account = nil
            currentUser = nil
            try await loadLeaderboard(difficulty: difficulty)
            message = "ログアウトしました。"
        } catch {
            message = error.localizedDescription
        }
    }

    func deleteAccount(password: String, difficulty: DisasterQuizDifficulty) async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await client.deleteAccount(password)
            account = nil
            currentUser = nil
            try await loadLeaderboard(difficulty: difficulty)
            message = "アカウントと記録を削除しました。"
        } catch {
            message = error.localizedDescription
        }
    }

    func challenge(difficulty: DisasterQuizDifficulty) async -> QuizRankingChallenge? {
        guard account != nil, enabled else { return nil }
        do { return try await client.challenge(difficulty) }
        catch {
            message = error.localizedDescription
            return nil
        }
    }

    func submit(challengeID: String, answers: [QuizRankingAnswer], difficulty: DisasterQuizDifficulty) async -> QuizRankingSubmission? {
        do {
            let result = try await client.submit(challengeID, answers)
            try await loadLeaderboard(difficulty: difficulty)
            return result
        } catch {
            message = error.localizedDescription
            return nil
        }
    }

    private func authenticate(
        operation: () async throws -> QuizRankingAccount,
        difficulty: DisasterQuizDifficulty
    ) async {
        isLoading = true
        defer { isLoading = false }
        do {
            account = try await operation()
            try await loadLeaderboard(difficulty: difficulty)
            message = "ログインしました。"
        } catch {
            message = error.localizedDescription
        }
    }

    private func loadLeaderboard(difficulty: DisasterQuizDifficulty) async throws {
        let leaderboard = try await client.leaderboard(difficulty)
        entries = leaderboard.entries
        currentUser = leaderboard.currentUser
    }
}

struct QuizRankingClient {
    var configuration: @Sendable () async throws -> Configuration
    var account: @Sendable () async throws -> QuizRankingAccount?
    var register: @Sendable (_ username: String, _ displayName: String, _ password: String) async throws -> QuizRankingAccount
    var login: @Sendable (_ username: String, _ password: String) async throws -> QuizRankingAccount
    var logout: @Sendable () async throws -> Void
    var deleteAccount: @Sendable (_ password: String) async throws -> Void
    var leaderboard: @Sendable (_ difficulty: DisasterQuizDifficulty) async throws -> Leaderboard
    var challenge: @Sendable (_ difficulty: DisasterQuizDifficulty) async throws -> QuizRankingChallenge
    var submit: @Sendable (_ challengeID: String, _ answers: [QuizRankingAnswer]) async throws -> QuizRankingSubmission

    struct Configuration: Decodable { let enabled: Bool }
    struct Leaderboard: Decodable {
        let entries: [QuizRankingEntry]
        let currentUser: QuizRankingCurrentUser?
    }

    static func live(session: URLSession = .shared) -> Self {
        let transport = QuizRankingTransport(session: session)
        return Self(
            configuration: { try await transport.get("config", as: Configuration.self) },
            account: {
                let response = try await transport.get("account", as: AccountResponse.self)
                return response.authenticated ? response.account : nil
            },
            register: { username, displayName, password in
                let response = try await transport.send(
                    "register",
                    method: "POST",
                    body: AccountRequest(username: username, displayName: displayName, password: password, client: "ios"),
                    as: AccountResponse.self
                )
                try transport.saveSession(response.sessionToken)
                return try requireAccount(response)
            },
            login: { username, password in
                let response = try await transport.send(
                    "login",
                    method: "POST",
                    body: AccountRequest(username: username, displayName: nil, password: password, client: "ios"),
                    as: AccountResponse.self
                )
                try transport.saveSession(response.sessionToken)
                return try requireAccount(response)
            },
            logout: {
                _ = try await transport.send("logout", method: "POST", body: EmptyRequest(), as: AuthStatus.self)
                transport.clearSession()
            },
            deleteAccount: { password in
                _ = try await transport.send(
                    "account", method: "DELETE", body: PasswordRequest(password: password), as: DeleteResponse.self
                )
                transport.clearSession()
            },
            leaderboard: { difficulty in
                try await transport.get("leaderboard?difficulty=\(difficulty.rawValue)", as: Leaderboard.self)
            },
            challenge: { difficulty in
                try await transport.send(
                    "challenge", method: "POST", body: DifficultyRequest(difficulty: difficulty), as: QuizRankingChallenge.self
                )
            },
            submit: { challengeID, answers in
                try await transport.send(
                    "submit", method: "POST", body: SubmissionRequest(challengeID: challengeID, answers: answers), as: QuizRankingSubmission.self
                )
            }
        )
    }
}

private struct AccountRequest: Encodable {
    let username: String
    let displayName: String?
    let password: String
    let client: String
}
private struct PasswordRequest: Encodable { let password: String }
private struct DifficultyRequest: Encodable { let difficulty: DisasterQuizDifficulty }
private struct SubmissionRequest: Encodable { let challengeID: String; let answers: [QuizRankingAnswer] }
private struct EmptyRequest: Encodable {}
private struct AuthStatus: Decodable { let authenticated: Bool }
private struct DeleteResponse: Decodable { let deleted: Bool }
private struct AccountResponse: Decodable {
    let authenticated: Bool
    let account: QuizRankingAccount?
    let sessionToken: String?
}

private func requireAccount(_ response: AccountResponse) throws -> QuizRankingAccount {
    guard let account = response.account else { throw QuizRankingError.invalidResponse }
    return account
}

private struct QuizRankingTransport: @unchecked Sendable {
    let session: URLSession

    func get<Response: Decodable>(_ path: String, as type: Response.Type) async throws -> Response {
        try await request(path, method: "GET", body: nil, as: type)
    }

    func send<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: String,
        body: Body,
        as type: Response.Type
    ) async throws -> Response {
        try await request(path, method: method, body: try JSONEncoder().encode(body), as: type)
    }

    func saveSession(_ token: String?) throws {
        guard let token, !token.isEmpty else { throw QuizRankingError.invalidResponse }
        try QuizSessionKeychain.save(token)
    }

    func clearSession() { QuizSessionKeychain.delete() }

    private func request<Response: Decodable>(
        _ path: String,
        method: String,
        body: Data?,
        as type: Response.Type
    ) async throws -> Response {
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var components = URLComponents(
            url: MeteoScopeEndpoints.quizAPI.appending(path: parts[0]),
            resolvingAgainstBaseURL: false
        )
        if parts.count == 2 { components?.percentEncodedQuery = parts[1] }
        guard let url = components?.url else { throw QuizRankingError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token = QuizSessionKeychain.load() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw QuizRankingError.invalidResponse }
        guard 200..<300 ~= http.statusCode else {
            if http.statusCode == 401 { clearSession() }
            let payload = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw QuizRankingError.server(payload?.error ?? "ランキングを処理できませんでした。")
        }
        return try JSONDecoder().decode(type, from: data)
    }
}

private struct ErrorResponse: Decodable { let error: String }

private enum QuizRankingError: LocalizedError {
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "ランキングサーバーの応答が正しくありません。"
        case .server(let message): message
        }
    }
}

private enum QuizSessionKeychain {
    private static let service = "jp.meteoscope.ios.quiz-ranking"
    private static let account = "session"

    static func save(_ token: String) throws {
        delete()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(token.utf8)
        ]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
            throw QuizRankingError.invalidResponse
        }
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
