import Foundation
import Observation

@MainActor
@Observable
final class CommunityReportModel {
    private(set) var reports: [CommunityReport] = []
    private(set) var isLoading = false
    private(set) var message: String?
    private var lastRefreshAt: Date?

    func refresh(force: Bool = false) async {
        guard !isLoading else { return }
        if !force, let lastRefreshAt, Date().timeIntervalSince(lastRefreshAt) < 60 { return }
        isLoading = true
        defer { isLoading = false }
        do {
            var components = URLComponents(url: MeteoScopeEndpoints.communityReports, resolvingAgainstBaseURL: false)
            components?.queryItems = [URLQueryItem(name: "limit", value: "100")]
            guard let url = components?.url else { throw CommunityReportError.invalidResponse }
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 15
            if let token = QuizSessionKeychain.load() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (data, response) = try await URLSession.shared.data(for: request)
            try validate(response: response, data: data)
            reports = try JSONDecoder().decode(CommunityReportListResponse.self, from: data).reports.filter {
                ISO8601DateFormatter().date(from: $0.expiresAt).map { $0 > Date() } ?? false
            }
            lastRefreshAt = Date()
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    func create(draft: CommunityReportDraft) async throws {
        guard let accountToken = QuizSessionKeychain.load(), !accountToken.isEmpty else { throw CommunityReportError.loginRequired }
        var request = URLRequest(url: MeteoScopeEndpoints.communityReports)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accountToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(draft)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let created = try JSONDecoder().decode(CommunityReportCreateResponse.self, from: data).report
        reports.insert(created, at: 0)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw CommunityReportError.invalidResponse }
        guard 200..<300 ~= http.statusCode else {
            let result = try? JSONDecoder().decode(CommunityReportErrorResponse.self, from: data)
            throw CommunityReportError.server(result?.error ?? "現在地の投稿を処理できませんでした。")
        }
    }
}

private struct CommunityReportListResponse: Decodable { let reports: [CommunityReport] }
private struct CommunityReportCreateResponse: Decodable { let report: CommunityReport }
private struct CommunityReportErrorResponse: Decodable { let error: String }
private enum CommunityReportError: LocalizedError {
    case invalidResponse, loginRequired, server(String)
    var errorDescription: String? {
        switch self {
        case .invalidResponse: "投稿サーバーの応答が正しくありません。"
        case .loginRequired: "投稿にはMeteoScopeアカウントへのログインが必要です。"
        case .server(let value): value
        }
    }
}
