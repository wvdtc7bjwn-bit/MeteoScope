import Foundation

struct WeatherAPIClient: Sendable {
    var fetchRadarFrames: @Sendable () async throws -> [RadarFrame]
    var fetchRemoteConfig: @Sendable () async throws -> RemoteAppConfig
}

extension WeatherAPIClient {
    static func live(session: URLSession = .shared) -> Self {
        Self(
            fetchRadarFrames: {
                var request = URLRequest(url: MeteoScopeEndpoints.radarTimeList)
                request.cachePolicy = .reloadRevalidatingCacheData
                request.timeoutInterval = 15

                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse,
                      200..<300 ~= httpResponse.statusCode
                else {
                    throw WeatherAPIError.invalidResponse
                }

                let records = try JSONDecoder().decode([RadarTimeRecord].self, from: data)
                let frames = RadarFrameBuilder.build(from: records)
                guard !frames.isEmpty else {
                    throw WeatherAPIError.emptyRadarFrames
                }
                return frames
            },
            fetchRemoteConfig: {
                var request = URLRequest(url: MeteoScopeEndpoints.publicConfig)
                request.cachePolicy = .reloadIgnoringLocalCacheData
                request.timeoutInterval = 8

                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse,
                      200..<300 ~= httpResponse.statusCode
                else {
                    throw WeatherAPIError.invalidResponse
                }
                return try JSONDecoder().decode(RemoteAppConfig.self, from: data)
            }
        )
    }

    static func preview(frames: [RadarFrame]) -> Self {
        Self(
            fetchRadarFrames: { frames },
            fetchRemoteConfig: {
                RemoteAppConfig(
                    notices: [
                        RemoteNotice(
                            serverID: "preview",
                            title: "MeteoScope",
                            body: "気象・防災情報を確認できます。"
                        )
                    ]
                )
            }
        )
    }
}

enum WeatherAPIError: LocalizedError {
    case invalidResponse
    case emptyRadarFrames

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "気象データを取得できませんでした。"
        case .emptyRadarFrames:
            "表示できる雨雲データがありません。"
        }
    }
}
