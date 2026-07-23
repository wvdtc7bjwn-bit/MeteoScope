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
    var fetchVolcanoSnapshot: @Sendable () async throws -> VolcanoSnapshot
    var fetchHypocenterDistribution: @Sendable (HypocenterDistributionFilter) async throws -> HypocenterDistributionSnapshot
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
                try await fetchJMAEarthquakeSnapshot(session: session)
            },
            fetchVolcanoSnapshot: {
                async let statusData = requestData(
                    from: MeteoScopeEndpoints.volcanoStatus,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadRevalidatingCacheData
                )
                async let catalogData = requestData(
                    from: MeteoScopeEndpoints.volcanoCatalog,
                    session: session,
                    timeout: 20,
                    cachePolicy: .returnCacheDataElseLoad
                )
                async let bulletins = fetchJMAVolcanoBulletins(session: session)
                return try await VolcanoSnapshotBuilder.build(
                    statusData: statusData,
                    catalogData: catalogData,
                    bulletins: bulletins
                )
            },
            fetchHypocenterDistribution: { filter in
                let data = try await requestData(
                    from: MeteoScopeEndpoints.hypocenterDistribution(
                        dayOffset: filter.dayOffset,
                        minMagnitude: filter.minMagnitude,
                        maxDepth: filter.maxDepth
                    ),
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadRevalidatingCacheData
                )
                return try JSONDecoder().decode(HypocenterDistributionSnapshot.self, from: data)
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
            fetchVolcanoSnapshot: { .preview },
            fetchHypocenterDistribution: { _ in .preview }
        )
    }
}

private struct EarthquakeFeedBatch: Sendable {
    let url: URL
    let entries: [EarthquakeFeedEntry]
}

private func fetchJMAVolcanoBulletins(session: URLSession) async -> [VolcanoBulletin] {
    let feedEntries = await withTaskGroup(of: [VolcanoFeedEntry].self) { group in
        for url in MeteoScopeEndpoints.earthquakeFeeds {
            group.addTask {
                guard let data = try? await requestData(
                    from: url,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadIgnoringLocalCacheData
                ) else { return [] }
                return (try? VolcanoXMLDecoder.feedEntries(data: data)) ?? []
            }
        }

        var collected: [VolcanoFeedEntry] = []
        for await entries in group { collected.append(contentsOf: entries) }
        return collected
    }

    let allUniqueEntries = Dictionary(
        feedEntries.map { ($0.url, $0) },
        uniquingKeysWith: { current, candidate in
            candidate.updated > current.updated ? candidate : current
        }
    )
    .values
    .sorted { $0.updated > $1.updated }
    let warningDetailCodes = Set(["VFVO50", "VFVO51"])
    let ashForecastCodes = Set(["VFVO53", "VFVO54", "VFVO55"])
    let warningEntries = Array(allUniqueEntries.filter {
        warningDetailCodes.contains($0.bulletinCode)
    }.prefix(20))
    let ashForecastEntries = Array(allUniqueEntries.filter {
        ashForecastCodes.contains($0.bulletinCode)
    }.prefix(max(0, min(10, 32 - warningEntries.count))))
    let remainingEntries = allUniqueEntries.filter {
        !warningDetailCodes.contains($0.bulletinCode) && !ashForecastCodes.contains($0.bulletinCode)
    }
    let uniqueEntries = Array((warningEntries + ashForecastEntries + remainingEntries).prefix(32))

    return await withTaskGroup(of: VolcanoBulletin?.self) { group in
        for entry in uniqueEntries {
            group.addTask {
                guard let data = try? await requestData(
                    from: entry.url,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadRevalidatingCacheData
                ) else { return nil }
                return try? VolcanoXMLDecoder.bulletin(data: data, entry: entry)
            }
        }

        var collected: [VolcanoBulletin] = []
        for await bulletin in group {
            if let bulletin { collected.append(bulletin) }
        }
        return collected.sorted { $0.reportTime > $1.reportTime }
    }
}

private func fetchJMAEarthquakeSnapshot(session: URLSession) async throws -> EarthquakeSnapshot {
    async let stationData = try? requestData(
        from: MeteoScopeEndpoints.earthquakeStationCatalog,
        session: session,
        timeout: 20,
        cachePolicy: .returnCacheDataElseLoad
    )
    let batches = await withTaskGroup(of: EarthquakeFeedBatch?.self) { group in
        for url in MeteoScopeEndpoints.earthquakeFeeds {
            group.addTask {
                guard let data = try? await requestData(
                    from: url,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadIgnoringLocalCacheData
                ) else { return nil }
                return EarthquakeFeedBatch(
                    url: url,
                    entries: (try? EarthquakeXMLDecoder.feedEntries(data: data)) ?? []
                )
            }
        }
        var result: [EarthquakeFeedBatch] = []
        for await batch in group {
            if let batch { result.append(batch) }
        }
        return result
    }
    guard !batches.isEmpty else { throw WeatherAPIError.invalidResponse }
    let currentFeedAvailable = batches.contains { $0.url == MeteoScopeEndpoints.earthquakeFeeds[0] }
    let uniqueEntries = Dictionary(
        batches.flatMap(\.entries).map { ($0.url, $0) },
        uniquingKeysWith: { current, candidate in
            candidate.updated > current.updated ? candidate : current
        }
    ).values.sorted { $0.updated > $1.updated }
    let earthquakeEntries = uniqueEntries
        .filter { ["VXSE51", "VXSE52", "VXSE53"].contains($0.bulletinCode) }
        .prefix(48)
    let tsunamiEntries = uniqueEntries
        .filter { ["VTSE41", "VTSE51", "VTSE52"].contains($0.bulletinCode) }
        .prefix(18)
    let resolvedStationData = await stationData
    let stations = resolvedStationData.flatMap { decodeEarthquakeStations($0) } ?? [:]
    let earthquakes = await withTaskGroup(of: EarthquakeSummary?.self) { group in
        for entry in earthquakeEntries {
            group.addTask {
                guard let data = try? await requestData(
                    from: entry.url,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadIgnoringLocalCacheData
                ) else { return nil }
                return try? EarthquakeXMLDecoder.earthquake(data: data, entry: entry, stations: stations)
            }
        }
        var result: [EarthquakeSummary] = []
        for await earthquake in group {
            if let earthquake { result.append(earthquake) }
        }
        return result
    }
    guard earthquakeEntries.isEmpty || !earthquakes.isEmpty else {
        throw WeatherAPIError.invalidResponse
    }
    let deduplicated = Dictionary(
        earthquakes.map { ($0.id, $0) },
        uniquingKeysWith: { current, candidate in
            candidate.reportTime > current.reportTime ? candidate : current
        }
    ).values.sorted { $0.reportTime > $1.reportTime }.prefix(11).map { $0 }
    let tsunamiReports = await withTaskGroup(of: TsunamiReport?.self) { group in
        for entry in tsunamiEntries {
            group.addTask {
                guard let data = try? await requestData(
                    from: entry.url,
                    session: session,
                    timeout: 15,
                    cachePolicy: .reloadIgnoringLocalCacheData
                ) else { return nil }
                return try? EarthquakeXMLDecoder.tsunami(data: data, entry: entry)
            }
        }
        var result: [TsunamiReport] = []
        for await report in group {
            if let report { result.append(report) }
        }
        return result
    }
    let tsunami = EarthquakeXMLDecoder.mergedTsunami(reports: tsunamiReports)
    let tsunamiStatus: TsunamiFetchStatus
    if !currentFeedAvailable || (!tsunamiEntries.isEmpty && tsunamiReports.isEmpty) {
        tsunamiStatus = .unavailable
    } else if tsunami == nil {
        tsunamiStatus = .none
    } else {
        tsunamiStatus = .available
    }
    return EarthquakeSnapshot(
        updatedAt: deduplicated.first?.reportTime ?? "未取得",
        earthquakes: deduplicated,
        tsunami: tsunami,
        tsunamiStatus: tsunamiStatus
    )
}

private func decodeEarthquakeStations(_ data: Data) -> [String: EarthquakeStationRecord]? {
    let decoder = JSONDecoder()
    if let keyed = try? decoder.decode([String: EarthquakeStationRecord].self, from: data) {
        return EarthquakeStationLookup.makeLookup(keyed)
    }
    guard let records = try? decoder.decode([EarthquakeStationRecord].self, from: data) else {
        return nil
    }
    return EarthquakeStationLookup.makeLookup(records)
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
