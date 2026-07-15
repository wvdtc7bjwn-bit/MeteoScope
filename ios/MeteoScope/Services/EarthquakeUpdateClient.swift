import Foundation

struct EarthquakeRealtimeUpdate: Equatable, Sendable {
    enum Kind: String, Sendable {
        case snapshot
        case earthquake
        case tsunami
    }

    let kind: Kind
    let token: String
}

struct EarthquakeUpdateClient: Sendable {
    var updates: @Sendable () -> AsyncThrowingStream<EarthquakeRealtimeUpdate, Error>
}

extension EarthquakeUpdateClient {
    static func live(session: URLSession = .shared) -> Self {
        Self(updates: {
            AsyncThrowingStream { continuation in
                var request = URLRequest(url: MeteoScopeEndpoints.dmdataEarthquakeStream)
                request.timeoutInterval = 30
                let socket = session.webSocketTask(with: request)
                let receiveTask = Task {
                    socket.resume()
                    do {
                        while !Task.isCancelled {
                            let message = try await socket.receive()
                            guard let update = decode(message) else { continue }
                            continuation.yield(update)
                        }
                        continuation.finish()
                    } catch is CancellationError {
                        continuation.finish()
                    } catch {
                        continuation.finish(throwing: error)
                    }
                }

                continuation.onTermination = { @Sendable _ in
                    receiveTask.cancel()
                    socket.cancel(with: .goingAway, reason: nil)
                }
            }
        })
    }

    static var empty: Self {
        Self(updates: {
            AsyncThrowingStream { continuation in
                continuation.finish()
            }
        })
    }

    static func decode(_ data: Data) -> EarthquakeRealtimeUpdate? {
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
              let kind = EarthquakeRealtimeUpdate.Kind(rawValue: envelope.type)
        else {
            return nil
        }
        return EarthquakeRealtimeUpdate(
            kind: kind,
            token: envelope.timestamp ?? String(Date().timeIntervalSince1970)
        )
    }

    private static func decode(
        _ message: URLSessionWebSocketTask.Message
    ) -> EarthquakeRealtimeUpdate? {
        switch message {
        case .string(let text):
            decode(Data(text.utf8))
        case .data(let data):
            decode(data)
        @unknown default:
            nil
        }
    }
}

private struct Envelope: Decodable {
    let type: String
    let timestamp: String?
}
