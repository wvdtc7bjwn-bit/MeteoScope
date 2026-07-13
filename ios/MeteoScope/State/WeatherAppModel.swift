import Foundation
import Observation

@MainActor
@Observable
final class WeatherAppModel {
    var selectedRootTab: RootTab = .map
    var selectedFeature: WeatherFeature = .radar
    var warningMapMode: WarningMapMode = .announcements
    var radarState: LoadState<[RadarFrame]> = .idle
    var amedasState: LoadState<AmedasSnapshot> = .idle
    var warningState: LoadState<WarningSnapshot> = .idle
    var earlyWarningState: LoadState<EarlyWarningSnapshot> = .idle
    var riverFloodState: LoadState<RiverFloodSnapshot> = .idle
    var typhoonState: LoadState<TyphoonSnapshot> = .idle
    var earthquakeState: LoadState<EarthquakeSnapshot> = .idle
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

    func loadSelectedFeatureIfNeeded() async {
        switch selectedFeature {
        case .radar:
            await loadRadarIfNeeded()
        case .amedas:
            await loadIfNeeded(\.amedasState, operation: client.fetchAmedasSnapshot)
        case .warnings:
            async let warnings: Void = loadIfNeeded(\.warningState, operation: client.fetchWarningSnapshot)
            async let early: Void = loadIfNeeded(\.earlyWarningState, operation: client.fetchEarlyWarningSnapshot)
            async let rivers: Void = loadIfNeeded(\.riverFloodState, operation: client.fetchRiverFloodSnapshot)
            _ = await (warnings, early, rivers)
        case .typhoon:
            await loadIfNeeded(\.typhoonState, operation: client.fetchTyphoonSnapshot)
        case .earthquake:
            await loadIfNeeded(\.earthquakeState, operation: client.fetchEarthquakeSnapshot)
        }
    }

    func refreshSelectedFeature() async {
        switch selectedFeature {
        case .radar:
            await refreshRadar()
        case .amedas:
            await refresh(\.amedasState, operation: client.fetchAmedasSnapshot)
        case .warnings:
            async let warnings: Void = refresh(\.warningState, operation: client.fetchWarningSnapshot)
            async let early: Void = refresh(\.earlyWarningState, operation: client.fetchEarlyWarningSnapshot)
            async let rivers: Void = refresh(\.riverFloodState, operation: client.fetchRiverFloodSnapshot)
            _ = await (warnings, early, rivers)
        case .typhoon:
            await refresh(\.typhoonState, operation: client.fetchTyphoonSnapshot)
        case .earthquake:
            await refresh(\.earthquakeState, operation: client.fetchEarthquakeSnapshot)
        }
    }

    func fetchAmedasDailySeries(
        stationID: String,
        referenceTime: String,
        metric: AmedasMetric
    ) async throws -> AmedasDailySeries {
        try await client.fetchAmedasDailySeries(stationID, referenceTime, metric)
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

    private func loadIfNeeded<Value>(
        _ keyPath: ReferenceWritableKeyPath<WeatherAppModel, LoadState<Value>>,
        operation: @Sendable () async throws -> Value
    ) async {
        guard self[keyPath: keyPath].isIdle else { return }
        await refresh(keyPath, operation: operation)
    }

    private func refresh<Value>(
        _ keyPath: ReferenceWritableKeyPath<WeatherAppModel, LoadState<Value>>,
        operation: @Sendable () async throws -> Value
    ) async {
        self[keyPath: keyPath] = .loading
        do {
            let value = try await operation()
            guard !Task.isCancelled else { return }
            self[keyPath: keyPath] = .loaded(value)
        } catch is CancellationError {
            return
        } catch {
            self[keyPath: keyPath] = .failed(error.localizedDescription)
        }
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
        model.amedasState = .loaded(.preview)
        model.warningState = .loaded(.preview)
        model.earlyWarningState = .loaded(.preview)
        model.riverFloodState = .loaded(.preview)
        model.typhoonState = .loaded(.preview)
        model.earthquakeState = .loaded(.preview)
        model.selectedRadarFrameID = frames[0].id
        return model
    }
}
