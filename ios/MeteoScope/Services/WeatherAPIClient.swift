import Foundation

struct WeatherAPIClient: Sendable {
    var fetchRadarFrames: @Sendable () async throws -> [RadarFrame]
    var fetchRemoteConfig: @Sendable () async throws -> RemoteAppConfig
    var fetchAmedasSnapshot: @Sendable () async throws -> AmedasSnapshot
    var fetchAmedasDailySeries: @Sendable (String, String, AmedasMetric) async throws -> AmedasDailySeries
    var fetchWarningSnapshot: @Sendable () async throws -> WarningSnapshot
    var fetchEarlyWarningSnapshot: @Sendable () async throws -> EarlyWarningSnapshot
    var fetchRiverFloodSnapshot: @Sendable () async throws -> RiverFloodSnapshot
    var fetchTyphoonSnapshot: @Sendable () async throws -> TyphoonSnapshot
    var fetchEarthquakeSnapshot: @Sendable () async throws -> EarthquakeSnapshot
    var fetchRealtimeEarthquakeSnapshot: @Sendable (String) async throws -> EarthquakeSnapshot
    var fetchEarthquakeStations: @Sendable (String) async throws -> [EarthquakeIntensityPoint]
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
            },
            fetchAmedasSnapshot: {
                async let latestData = requestData(
                    from: MeteoScopeEndpoints.amedasLatestTime,
                    session: session,
                    timeout: 12,
                    cachePolicy: .reloadIgnoringLocalCacheData
                )
                async let stationData = requestData(
                    from: MeteoScopeEndpoints.amedasStationTable,
                    session: session,
                    timeout: 20,
                    cachePolicy: .returnCacheDataElseLoad
                )

                let resolvedLatestData = try await latestData
                let latestText = String(decoding: resolvedLatestData, as: UTF8.self)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard let mapTimestamp = AmedasSnapshotBuilder.mapTimestamp(from: latestText) else {
                    throw WeatherAPIError.invalidResponse
                }
                let mapURL = MeteoScopeEndpoints.amedasMapBase.appending(path: "\(mapTimestamp).json")
                async let observationData = requestData(
                    from: mapURL,
                    session: session,
                    timeout: 20,
                    cachePolicy: .reloadRevalidatingCacheData
                )
                async let pressureData = try? requestData(
                    from: MeteoScopeEndpoints.amedasDailySurface,
                    session: session,
                    timeout: 20,
                    cachePolicy: .reloadRevalidatingCacheData
                )

                let resolvedObservationData = try await observationData
                let resolvedStationData = try await stationData
                let observations = try JSONDecoder().decode(
                    [String: AmedasObservationRecord].self,
                    from: resolvedObservationData
                )
                let metadata = try JSONDecoder().decode(
                    [String: AmedasStationRecord].self,
                    from: resolvedStationData
                )
                let stations = AmedasSnapshotBuilder.buildStations(
                    observations: observations,
                    metadata: metadata
                )
                let resolvedPressureData = await pressureData
                let pressureHTML = resolvedPressureData.flatMap { data in
                    String(data: data, encoding: .utf8) ?? String(data: data, encoding: .shiftJIS)
                }
                return AmedasSnapshot(
                    updatedAt: latestText,
                    stations: stations,
                    dailyPressureMinimum: pressureHTML.map {
                        AmedasSnapshotBuilder.parseDailyPressureMinimum(html: $0, stations: stations)
                    } ?? []
                )
            },
            fetchAmedasDailySeries: { stationID, referenceTime, metric in
                let urls = AmedasSeriesBuilder.chunkURLs(stationID: stationID, referenceTime: referenceTime)
                guard !urls.isEmpty else { throw WeatherAPIError.invalidResponse }
                let chunks = await withTaskGroup(of: [String: AmedasObservationRecord]?.self) { group in
                    for url in urls {
                        group.addTask {
                            guard let data = try? await requestData(
                                from: url,
                                session: session,
                                timeout: 15,
                                cachePolicy: .reloadRevalidatingCacheData
                            ) else {
                                return nil
                            }
                            return try? JSONDecoder().decode([String: AmedasObservationRecord].self, from: data)
                        }
                    }
                    var collected: [[String: AmedasObservationRecord]] = []
                    for await chunk in group {
                        if let chunk { collected.append(chunk) }
                    }
                    return collected
                }
                guard !chunks.isEmpty else { throw WeatherAPIError.invalidResponse }
                return AmedasSeriesBuilder.build(
                    stationID: stationID,
                    referenceTime: referenceTime,
                    metric: metric,
                    chunks: chunks
                )
            },
            fetchWarningSnapshot: {
                let reports = await withTaskGroup(of: [WarningReport].self) { group in
                    for officeCode in MeteoScopeEndpoints.warningOfficeCodes {
                        group.addTask {
                            let url = MeteoScopeEndpoints.warningBase.appending(path: "\(officeCode).json")
                            do {
                                let data = try await requestData(
                                    from: url,
                                    session: session,
                                    timeout: 15,
                                    cachePolicy: .reloadRevalidatingCacheData
                                )
                                return try JSONDecoder().decode([WarningReport].self, from: data)
                            } catch {
                                return []
                            }
                        }
                    }

                    var collected: [WarningReport] = []
                    for await officeReports in group {
                        collected.append(contentsOf: officeReports)
                    }
                    return collected
                }
                return WarningSnapshotBuilder.build(from: reports)
            },
            fetchEarlyWarningSnapshot: {
                async let probabilityData = requestData(
                    from: MeteoScopeEndpoints.earlyWarningProbability,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadRevalidatingCacheData
                )
                async let areaData = requestData(
                    from: MeteoScopeEndpoints.areaCatalog,
                    session: session,
                    timeout: 20,
                    cachePolicy: .returnCacheDataElseLoad
                )
                let reports = try EarlyWarningSnapshotBuilder.decodeReports(from: try await probabilityData)
                let catalog = try JSONDecoder().decode(JMAAreaCatalog.self, from: try await areaData)
                return EarlyWarningSnapshotBuilder.build(reports: reports, areaCatalog: catalog)
            },
            fetchRiverFloodSnapshot: {
                let feedEntries = await withTaskGroup(of: [RiverFloodFeedEntry].self) { group in
                    for url in MeteoScopeEndpoints.riverFloodFeeds {
                        group.addTask {
                            do {
                                let data = try await requestData(
                                    from: url,
                                    session: session,
                                    timeout: 15,
                                    cachePolicy: .reloadIgnoringLocalCacheData
                                )
                                return try RiverFloodXMLDecoder.feedEntries(data: data)
                            } catch {
                                return []
                            }
                        }
                    }
                    var entries: [RiverFloodFeedEntry] = []
                    for await batch in group { entries.append(contentsOf: batch) }
                    return entries
                }

                let allUniqueEntries = Dictionary(
                    feedEntries.map { ($0.url, $0) },
                    uniquingKeysWith: { current, candidate in
                        candidate.updated > current.updated ? candidate : current
                    }
                )
                .values
                .sorted { $0.updated > $1.updated }
                .prefix(40)

                let reports = await withTaskGroup(of: RiverFloodSummary?.self) { group in
                    for entry in allUniqueEntries {
                        group.addTask {
                            do {
                                let data = try await requestData(
                                    from: entry.url,
                                    session: session,
                                    timeout: 15,
                                    cachePolicy: .reloadIgnoringLocalCacheData
                                )
                                return try RiverFloodXMLDecoder.report(data: data, entry: entry)
                            } catch {
                                return nil
                            }
                        }
                    }
                    var collected: [RiverFloodSummary] = []
                    for await report in group {
                        if let report { collected.append(report) }
                    }
                    return collected
                }

                let latestReports = Dictionary(
                    reports.map { ($0.id, $0) },
                    uniquingKeysWith: { current, candidate in
                        candidate.updatedAt > current.updatedAt ? candidate : current
                    }
                )
                .values
                .sorted { $0.updatedAt > $1.updatedAt }
                return RiverFloodSnapshot(
                    updatedAt: latestReports.first?.updatedAt ?? "未取得",
                    reports: latestReports.filter(\.active)
                )
            },
            fetchTyphoonSnapshot: {
                let targetData = try await requestData(
                    from: MeteoScopeEndpoints.typhoonTargets,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadIgnoringLocalCacheData
                )
                let targets = try JSONDecoder().decode([TyphoonTargetRecord].self, from: targetData)
                let bundles = await withTaskGroup(of: TyphoonBundle?.self) { group in
                    for target in targets {
                        group.addTask {
                            let base = MeteoScopeEndpoints.typhoonBase.appending(path: target.tropicalCyclone)
                            do {
                                async let forecastData = requestData(
                                    from: base.appending(path: "forecast.json"),
                                    session: session,
                                    timeout: 15,
                                    cachePolicy: .reloadRevalidatingCacheData
                                )
                                async let specificationData = requestData(
                                    from: base.appending(path: "specifications.json"),
                                    session: session,
                                    timeout: 15,
                                    cachePolicy: .reloadRevalidatingCacheData
                                )
                                let resolvedForecastData = try await forecastData
                                let resolvedSpecificationData = try await specificationData
                                return TyphoonBundle(
                                    id: target.tropicalCyclone,
                                    forecasts: try JSONDecoder().decode(
                                        [TyphoonForecastRecord].self,
                                        from: resolvedForecastData
                                    ),
                                    specifications: try JSONDecoder().decode(
                                        [TyphoonSpecificationRecord].self,
                                        from: resolvedSpecificationData
                                    )
                                )
                            } catch {
                                return nil
                            }
                        }
                    }

                    var collected: [TyphoonBundle] = []
                    for await bundle in group {
                        if let bundle { collected.append(bundle) }
                    }
                    return collected
                }
                return TyphoonSnapshotBuilder.build(
                    targets: targets,
                    forecasts: Dictionary(
                        bundles.map { ($0.id, $0.forecasts) },
                        uniquingKeysWith: { current, _ in current }
                    ),
                    specifications: Dictionary(
                        bundles.map { ($0.id, $0.specifications) },
                        uniquingKeysWith: { current, _ in current }
                    )
                )
            },
            fetchEarthquakeSnapshot: {
                try await fetchDMDataEarthquakeSnapshot(session: session)
            },
            fetchRealtimeEarthquakeSnapshot: { token in
                try await fetchDMDataEarthquakeSnapshot(
                    session: session,
                    realtimeToken: token
                )
            },
            fetchEarthquakeStations: { eventID in
                guard let url = MeteoScopeEndpoints.dmdataEarthquakeStations(eventID: eventID) else {
                    return []
                }
                let data = try await requestData(
                    from: url,
                    session: session,
                    timeout: 12,
                    cachePolicy: .returnCacheDataElseLoad
                )
                let response = try JSONDecoder().decode(
                    DMDataEarthquakeStationResponse.self,
                    from: data
                )
                guard response.enabled else { return [] }
                return DMDataEarthquakeBuilder.intensityPoints(response.items)
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
            },
            fetchAmedasSnapshot: { .preview },
            fetchAmedasDailySeries: { _, _, metric in .preview(metric: metric) },
            fetchWarningSnapshot: { .preview },
            fetchEarlyWarningSnapshot: { .preview },
            fetchRiverFloodSnapshot: { .preview },
            fetchTyphoonSnapshot: { .preview },
            fetchEarthquakeSnapshot: { .preview },
            fetchRealtimeEarthquakeSnapshot: { _ in .preview },
            fetchEarthquakeStations: { _ in [] }
        )
    }
}

private func fetchDMDataEarthquakeSnapshot(
    session: URLSession,
    realtimeToken: String? = nil
) async throws -> EarthquakeSnapshot {
    let historyURL = realtimeToken.map {
        MeteoScopeEndpoints.dmdataEarthquakeHistory(realtimeToken: $0)
    } ?? MeteoScopeEndpoints.dmdataEarthquakeHistory
    let latestURL: URL = if let realtimeToken, !realtimeToken.isEmpty {
        appendQueryItem(
            to: MeteoScopeEndpoints.dmdataEarthquakeLatest,
            name: "_rt",
            value: realtimeToken
        )
    } else {
        MeteoScopeEndpoints.dmdataEarthquakeLatest
    }

    async let historyData = requestData(
        from: historyURL,
        session: session,
        timeout: 12,
        cachePolicy: .reloadIgnoringLocalCacheData
    )
    async let latestData = try? requestData(
        from: latestURL,
        session: session,
        timeout: 12,
        cachePolicy: .reloadIgnoringLocalCacheData
    )
    let resolvedHistoryData = try await historyData
    let history = try JSONDecoder().decode(
        DMDataEarthquakeHistoryResponse.self,
        from: resolvedHistoryData
    )
    guard history.enabled, !history.items.isEmpty else {
        throw WeatherAPIError.invalidResponse
    }
    let resolvedLatestData = await latestData
    let latestResponse = resolvedLatestData.flatMap {
        try? JSONDecoder().decode(DMDataLatestResponse.self, from: $0)
    }
    let earthquakes = DMDataEarthquakeBuilder.build(
        history: history.items,
        latest: latestResponse?.latest.earthquake
    )
    let tsunami = DMDataTsunamiBuilder.build(latestResponse?.latest.tsunami)
    let tsunamiStatus: TsunamiFetchStatus = if resolvedLatestData == nil {
        .unavailable
    } else if tsunami != nil {
        .available
    } else {
        .none
    }
    return EarthquakeSnapshot(
        updatedAt: earthquakes.first?.reportTime ?? "未取得",
        earthquakes: earthquakes,
        tsunami: tsunami,
        tsunamiStatus: tsunamiStatus
    )
}

private func appendQueryItem(to url: URL, name: String, value: String) -> URL {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
        return url
    }
    var items = components.queryItems ?? []
    items.append(URLQueryItem(name: name, value: value))
    components.queryItems = items
    return components.url ?? url
}

private struct TyphoonBundle: Sendable {
    let id: String
    let forecasts: [TyphoonForecastRecord]
    let specifications: [TyphoonSpecificationRecord]
}

private func requestData(
    from url: URL,
    session: URLSession,
    timeout: TimeInterval,
    cachePolicy: URLRequest.CachePolicy
) async throws -> Data {
    var request = URLRequest(url: url)
    request.cachePolicy = cachePolicy
    request.timeoutInterval = timeout
    request.setValue("MeteoScope-iOS/0.1", forHTTPHeaderField: "User-Agent")
    request.setValue("application/json,text/plain,application/xml,text/xml,*/*", forHTTPHeaderField: "Accept")
    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse,
          200..<300 ~= httpResponse.statusCode
    else {
        throw WeatherAPIError.invalidResponse
    }
    return data
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
