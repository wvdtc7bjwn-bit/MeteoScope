import Foundation
import Observation

@MainActor
@Observable
final class WeatherAppModel {
    var selectedRootTab: RootTab = .map
    var selectedFeature: WeatherFeature = .radar
    var radarState: LoadState<[RadarFrame]> = .idle
    var remoteConfigState: LoadState<RemoteAppConfig> = .idle
    var selectedRadarFrameID: RadarFrame.ID?
    private(set) var dismissedNoticeIDs: Set<RemoteNotice.ID> = []

    private let client: WeatherAPIClient

    init(client: WeatherAPIClient) {
        self.client = client
    }

    var radarFrames: [RadarFrame] {
        guard case .loaded(let frames) = radarState else { return [] }
        return frames
    }

    var selectedRadarFrame: RadarFrame? {
        let frames = radarFrames
        return frames.first(where: { $0.id == selectedRadarFrameID }) ?? latestObservation(in: frames)
    }

    var maintenanceConfiguration: MaintenanceConfiguration? {
        guard case .loaded(let config) = remoteConfigState,
              config.maintenance?.enabled == true
        else {
            return nil
        }
        return config.maintenance
    }

    var activeNotice: RemoteNotice? {
        guard case .loaded(let config) = remoteConfigState else { return nil }
        return config.notices.first {
            $0.enabled && !dismissedNoticeIDs.contains($0.id)
        }
    }

    func loadRadarIfNeeded() async {
        guard case .idle = radarState else { return }
        await refreshRadar()
    }

    func refreshRadar() async {
        radarState = .loading
        do {
            let frames = try await client.fetchRadarFrames()
            guard !Task.isCancelled else { return }
            radarState = .loaded(frames)
            if selectedRadarFrameID == nil || !frames.contains(where: { $0.id == selectedRadarFrameID }) {
                selectedRadarFrameID = latestObservation(in: frames)?.id ?? frames.last?.id
            }
        } catch is CancellationError {
            return
        } catch {
            radarState = .failed(error.localizedDescription)
        }
    }

    func loadRemoteConfigIfNeeded() async {
        guard case .idle = remoteConfigState else { return }
        await refreshRemoteConfig()
    }

    func refreshRemoteConfig() async {
        do {
            let config = try await client.fetchRemoteConfig()
            guard !Task.isCancelled else { return }
            remoteConfigState = .loaded(config)
        } catch is CancellationError {
            return
        } catch {
            remoteConfigState = .failed(error.localizedDescription)
        }
    }

    func dismissNotice(_ notice: RemoteNotice) {
        dismissedNoticeIDs.insert(notice.id)
    }

    func selectFeature(_ feature: WeatherFeature) {
        selectedFeature = feature
        selectedRootTab = .map
    }

    private func latestObservation(in frames: [RadarFrame]) -> RadarFrame? {
        frames.last(where: { !$0.isForecast })
    }
}

extension WeatherAppModel {
    static var preview: WeatherAppModel {
        let frames = [
            RadarFrame(
                baseTime: "20260713060000",
                validTime: "20260713060000",
                member: "none",
                isForecast: false
            ),
            RadarFrame(
                baseTime: "20260713060000",
                validTime: "20260713060500",
                member: "none",
                isForecast: true
            )
        ]
        let model = WeatherAppModel(client: .preview(frames: frames))
        model.radarState = .loaded(frames)
        model.selectedRadarFrameID = frames[0].id
        return model
    }
}
