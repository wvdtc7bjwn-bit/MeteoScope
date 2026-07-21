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
    var earthquakeDisplayMode: EarthquakeDisplayMode = .recent
    var hypocenterMapPresentation: HypocenterMapPresentation = .flat
    var hypocenterDistributionState: LoadState<HypocenterDistributionSnapshot> = .idle
    var hypocenterDistributionFilter = HypocenterDistributionFilter()
    var remoteConfigState: LoadState<RemoteAppConfig> = .idle
    var selectedRadarFrameID: RadarFrame.ID?
    var selectedEarthquakeID: EarthquakeSummary.ID?
    private(set) var lastSuccessfulFetchAt: [WeatherFeature: Date] = [:]
    private(set) var latestFetchError: [WeatherFeature: String] = [:]
    private(set) var dismissedNoticeIDs: Set<RemoteNotice.ID> = []
    private var loadingEarthquakeStationIDs: Set<String> = []
    private var verifiedEarthquakeStationIDs: Set<String> = []
    private var earthquakeRefreshSequence = 0
    private var hypocenterDistributionRefreshSequence = 0

    private let client: WeatherAPIClient
    private let earthquakeUpdates: EarthquakeUpdateClient

    init(
        client: WeatherAPIClient,
        earthquakeUpdates: EarthquakeUpdateClient = .live()
    ) {
        self.client = client
        self.earthquakeUpdates = earthquakeUpdates
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
        guard !earthquake.eventID.isEmpty,
              (earthquake.intensityPoints.isEmpty || !verifiedEarthquakeStationIDs.contains(earthquake.eventID)),
              loadingEarthquakeStationIDs.insert(earthquake.eventID).inserted
        else {
            return
        }
        Task { [weak self] in
            await self?.loadEarthquakeStations(eventID: earthquake.eventID)
        }
    }

    func selectEarthquakeDisplayMode(_ mode: EarthquakeDisplayMode) {
        earthquakeDisplayMode = mode
        guard mode == .distribution, hypocenterDistributionState.isIdle else { return }
        Task { [weak self] in await self?.refreshHypocenterDistribution() }
    }

    func selectHypocenterMapPresentation(_ presentation: HypocenterMapPresentation) {
        hypocenterMapPresentation = presentation
    }

    func updateHypocenterDistributionFilter(
        dayOffset: Int? = nil,
        minMagnitude: String? = nil,
        maxDepth: String? = nil
    ) {
        if let dayOffset {
            hypocenterDistributionFilter.dayOffset = min(
                max(dayOffset, 0),
                HypocenterDistributionLimits.maximumDayOffset
            )
        }
        if let minMagnitude { hypocenterDistributionFilter.minMagnitude = minMagnitude }
        if let maxDepth { hypocenterDistributionFilter.maxDepth = maxDepth }
        Task { [weak self] in await self?.refreshHypocenterDistribution() }
    }

    func updateHypocenterDistributionDate(_ sourceDate: String) {
        guard case .loaded(let snapshot) = hypocenterDistributionState else { return }
        updateHypocenterDistributionFilter(
            dayOffset: HypocenterDistributionLimits.dayOffset(
                for: sourceDate,
                in: snapshot.availableDates
            )
        )
    }

    func refreshHypocenterDistribution() async {
        hypocenterDistributionRefreshSequence += 1
        let refreshSequence = hypocenterDistributionRefreshSequence
        let previous: HypocenterDistributionSnapshot?
        if case .loaded(let snapshot) = hypocenterDistributionState {
            previous = snapshot
        } else {
            previous = nil
            hypocenterDistributionState = .loading
        }
        do {
            let snapshot = try await client.fetchHypocenterDistribution(hypocenterDistributionFilter)
            guard !Task.isCancelled, refreshSequence == hypocenterDistributionRefreshSequence else { return }
            hypocenterDistributionFilter.dayOffset = snapshot.dayOffset
            hypocenterDistributionState = .loaded(snapshot)
        } catch is CancellationError {
            return
        } catch {
            guard refreshSequence == hypocenterDistributionRefreshSequence else { return }
            if previous == nil {
                hypocenterDistributionState = .failed(error.localizedDescription)
            }
        }
    }

    private func loadEarthquakeStations(eventID: String) async {
        defer { loadingEarthquakeStationIDs.remove(eventID) }
        do {
            let points = try await client.fetchEarthquakeStations(eventID)
            guard !Task.isCancelled, !points.isEmpty,
                  case .loaded(let snapshot) = earthquakeState
            else {
                return
            }
            verifiedEarthquakeStationIDs.insert(eventID)
            let earthquakes = snapshot.earthquakes.map { earthquake in
                earthquake.eventID == eventID
                    ? earthquake.replacingIntensityPoints(points)
                    : earthquake
            }
            earthquakeState = .loaded(EarthquakeSnapshot(
                updatedAt: snapshot.updatedAt,
                earthquakes: earthquakes,
                tsunami: snapshot.tsunami,
                tsunamiStatus: snapshot.tsunamiStatus
            ))
        } catch is CancellationError {
            return
        } catch {
            // Region-level intensity data remains available when station details fail.
        }
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
            await loadEarthquakeIfNeeded()
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
            await refreshEarthquake()
        }
    }

    private func loadEarthquakeIfNeeded() async {
        guard earthquakeState.isIdle else { return }
        await refreshEarthquake()
    }

    private func refreshEarthquake(realtimeToken: String? = nil) async {
        earthquakeRefreshSequence += 1
        let refreshSequence = earthquakeRefreshSequence
        let previous: EarthquakeSnapshot?
        if case .loaded(let snapshot) = earthquakeState {
            previous = snapshot
        } else {
            previous = nil
            earthquakeState = .loading
        }

        do {
            let fetched = if let realtimeToken, !realtimeToken.isEmpty {
                try await client.fetchRealtimeEarthquakeSnapshot(realtimeToken)
            } else {
                try await client.fetchEarthquakeSnapshot()
            }
            guard !Task.isCancelled, refreshSequence == earthquakeRefreshSequence else { return }
            let snapshot = previous.map { fetched.preservingIntensityPoints(from: $0) } ?? fetched
            earthquakeState = .loaded(snapshot)
            markFetchSucceeded(.earthquake)
            if let selected = selectedEarthquake(in: snapshot), !selected.eventID.isEmpty {
                let freshSelected = fetched.earthquakes.first {
                    $0.eventID == selected.eventID
                }
                if freshSelected?.intensityPoints.isEmpty == false {
                    verifiedEarthquakeStationIDs.insert(selected.eventID)
                } else if !verifiedEarthquakeStationIDs.contains(selected.eventID),
                          loadingEarthquakeStationIDs.insert(selected.eventID).inserted {
                    await loadEarthquakeStations(eventID: selected.eventID)
                }
            }
        } catch is CancellationError {
            return
        } catch {
            markFetchFailed(.earthquake, message: error.localizedDescription)
            if previous == nil {
                earthquakeState = .failed(error.localizedDescription)
            }
        }
    }

    func observeEarthquakeUpdates() async {
        var retrySeconds = 1
        while !Task.isCancelled {
            do {
                for try await update in earthquakeUpdates.updates() {
                    guard !Task.isCancelled else { return }
                    retrySeconds = 1
                    await refreshEarthquake(realtimeToken: update.token)
                }
            } catch is CancellationError {
                return
            } catch {
                // The periodic refresh remains active while the stream reconnects.
            }

            guard !Task.isCancelled else { return }
            try? await Task.sleep(for: .seconds(retrySeconds))
            retrySeconds = min(30, retrySeconds * 2)
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
        let model = WeatherAppModel(
            client: .preview(frames: frames),
            earthquakeUpdates: .empty
        )
        model.radarState = .loaded(frames)
        model.amedasState = .loaded(.preview)
        model.warningState = .loaded(.preview)
        model.earlyWarningState = .loaded(.preview)
        model.riverFloodState = .loaded(.preview)
        model.typhoonState = .loaded(.preview)
        model.earthquakeState = .loaded(.preview)
        model.hypocenterDistributionState = .loaded(.preview)
        model.selectedRadarFrameID = frames[0].id
        return model
    }
}
