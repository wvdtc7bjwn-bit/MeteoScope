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
    var selectedEarthquakeID: EarthquakeSummary.ID?
    private(set) var lastSuccessfulFetchAt: [WeatherFeature: Date] = [:]
    private(set) var latestFetchError: [WeatherFeature: String] = [:]
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

    func selectedEarthquake(in snapshot: EarthquakeSnapshot) -> EarthquakeSummary? {
        snapshot.earthquakes.first(where: { $0.id == selectedEarthquakeID })
            ?? snapshot.earthquakes.first
    }

    func selectEarthquake(_ earthquake: EarthquakeSummary) {
        selectedEarthquakeID = earthquake.id
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
        let preservesExistingData = !radarFrames.isEmpty
        if !preservesExistingData { radarState = .loading }
        do {
            let frames = try await client.fetchRadarFrames()
            guard !Task.isCancelled else { return }
            radarState = .loaded(frames)
            markFetchSucceeded(.radar)
            if selectedRadarFrameID == nil || !frames.contains(where: { $0.id == selectedRadarFrameID }) {
                selectedRadarFrameID = latestObservation(in: frames)?.id ?? frames.last?.id
            }
        } catch is CancellationError {
            return
        } catch {
            markFetchFailed(.radar, message: error.localizedDescription)
            if !preservesExistingData { radarState = .failed(error.localizedDescription) }
        }
    }

    func loadSelectedFeatureIfNeeded() async {
        switch selectedFeature {
        case .radar:
            await loadRadarIfNeeded()
        case .amedas:
            await loadIfNeeded(.amedas, \.amedasState, operation: client.fetchAmedasSnapshot)
        case .warnings:
            latestFetchError[.warnings] = nil
            async let warnings: Void = loadIfNeeded(.warnings, \.warningState, operation: client.fetchWarningSnapshot)
            async let early: Void = loadIfNeeded(.warnings, \.earlyWarningState, operation: client.fetchEarlyWarningSnapshot)
            async let rivers: Void = loadIfNeeded(.warnings, \.riverFloodState, operation: client.fetchRiverFloodSnapshot)
            _ = await (warnings, early, rivers)
        case .typhoon:
            await loadIfNeeded(.typhoon, \.typhoonState, operation: client.fetchTyphoonSnapshot)
        case .earthquake:
            await loadIfNeeded(.earthquake, \.earthquakeState, operation: client.fetchEarthquakeSnapshot)
        }
    }

    func refreshSelectedFeature() async {
        switch selectedFeature {
        case .radar:
            await refreshRadar()
        case .amedas:
            await refresh(.amedas, \.amedasState, operation: client.fetchAmedasSnapshot)
        case .warnings:
            latestFetchError[.warnings] = nil
            async let warnings: Void = refresh(.warnings, \.warningState, operation: client.fetchWarningSnapshot)
            async let early: Void = refresh(.warnings, \.earlyWarningState, operation: client.fetchEarlyWarningSnapshot)
            async let rivers: Void = refresh(.warnings, \.riverFloodState, operation: client.fetchRiverFloodSnapshot)
            _ = await (warnings, early, rivers)
        case .typhoon:
            await refresh(.typhoon, \.typhoonState, operation: client.fetchTyphoonSnapshot)
        case .earthquake:
            await refresh(.earthquake, \.earthquakeState, operation: client.fetchEarthquakeSnapshot)
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

    func freshness(for feature: WeatherFeature) -> DataFreshness {
        DataFreshness(
            fetchedAt: lastSuccessfulFetchAt[feature],
            latestError: latestFetchError[feature]
        )
    }

    private func latestObservation(in frames: [RadarFrame]) -> RadarFrame? {
        frames.last(where: { !$0.isForecast })
    }

    private func loadIfNeeded<Value>(
        _ feature: WeatherFeature,
        _ keyPath: ReferenceWritableKeyPath<WeatherAppModel, LoadState<Value>>,
        operation: @Sendable () async throws -> Value
    ) async {
        guard self[keyPath: keyPath].isIdle else { return }
        await refresh(feature, keyPath, operation: operation)
    }

    private func refresh<Value>(
        _ feature: WeatherFeature,
        _ keyPath: ReferenceWritableKeyPath<WeatherAppModel, LoadState<Value>>,
        operation: @Sendable () async throws -> Value
    ) async {
        let preservesExistingData: Bool
        if case .loaded = self[keyPath: keyPath] { preservesExistingData = true } else { preservesExistingData = false }
        if !preservesExistingData { self[keyPath: keyPath] = .loading }
        do {
            let value = try await operation()
            guard !Task.isCancelled else { return }
            self[keyPath: keyPath] = .loaded(value)
            markFetchSucceeded(feature)
        } catch is CancellationError {
            return
        } catch {
            markFetchFailed(feature, message: error.localizedDescription)
            if !preservesExistingData { self[keyPath: keyPath] = .failed(error.localizedDescription) }
        }
    }

    private func markFetchSucceeded(_ feature: WeatherFeature) {
        lastSuccessfulFetchAt[feature] = Date()
        if feature != .warnings { latestFetchError[feature] = nil }
    }

    private func markFetchFailed(_ feature: WeatherFeature, message: String) {
        latestFetchError[feature] = message
    }
}

struct DataFreshness: Equatable {
    let fetchedAt: Date?
    let latestError: String?

    var latestnessUnconfirmed: Bool { latestError != nil }
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
