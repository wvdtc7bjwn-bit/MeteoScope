import Foundation

struct EarthquakeSnapshot: Sendable {
    let updatedAt: String
    let earthquakes: [EarthquakeSummary]
    let tsunami: TsunamiSnapshot?
    let tsunamiStatus: TsunamiFetchStatus

    func preservingIntensityPoints(from previous: Self) -> Self {
        let previousByEventID = previous.earthquakes.reduce(
            into: [String: EarthquakeSummary]()
        ) { result, earthquake in
            if result[earthquake.eventID] == nil {
                result[earthquake.eventID] = earthquake
            }
        }
        let mergedEarthquakes = earthquakes.map { earthquake in
            guard earthquake.intensityPoints.isEmpty,
                  let previousEarthquake = previousByEventID[earthquake.eventID],
                  !previousEarthquake.intensityPoints.isEmpty
            else {
                return earthquake
            }
            return earthquake.replacingIntensityPoints(previousEarthquake.intensityPoints)
        }
        return Self(
            updatedAt: updatedAt,
            earthquakes: mergedEarthquakes,
            tsunami: tsunami,
            tsunamiStatus: tsunamiStatus
        )
    }
}

enum TsunamiFetchStatus: String, Sendable {
    case none
    case available
    case unavailable
}

enum TsunamiLevel: String, Hashable, Sendable {
    case majorWarning
    case warning
    case advisory
    case forecast
    case none

    var displayName: String {
        switch self {
        case .majorWarning: "大津波警報"
        case .warning: "津波警報"
        case .advisory: "津波注意報"
        case .forecast: "津波予報"
        case .none: "発表終了"
        }
    }

    var rank: Int {
        switch self {
        case .majorWarning: 4
        case .warning: 3
        case .advisory: 2
        case .forecast: 1
        case .none: 0
        }
    }

    static let allMapLevels: [TsunamiLevel] = [.majorWarning, .warning, .advisory, .forecast]
}

struct TsunamiSnapshot: Hashable, Sendable {
    let id: String
    let eventID: String
    let title: String
    let headline: String
    let reportTime: String
    let validTime: String
    let areas: [TsunamiArea]
    let observations: [TsunamiObservation]
    let offshoreObservations: [TsunamiObservation]
    let highestLevel: TsunamiLevel

    var isActive: Bool {
        [.majorWarning, .warning, .advisory].contains(highestLevel)
    }
}

struct TsunamiArea: Identifiable, Hashable, Sendable {
    let code: String
    let name: String
    let grade: String
    let level: TsunamiLevel
    let arrivalTime: String
    let arrivalCondition: String
    let height: String
    let heightCondition: String

    var id: String { code.isEmpty ? name : code }
}

struct TsunamiObservation: Identifiable, Hashable, Sendable {
    let id: String
    let areaCode: String
    let areaName: String
    let stationName: String
    let offshore: Bool
    let arrivalTime: String
    let arrivalCondition: String
    let maximumHeightTime: String
    let maximumHeight: String
    let maximumHeightCondition: String
}

struct TsunamiReport: Sendable {
    let id: String
    let eventID: String
    let bulletinCode: String
    let title: String
    let headline: String
    let reportTime: String
    let validTime: String
    let areas: [TsunamiArea]
    let observations: [TsunamiObservation]
    let offshoreObservations: [TsunamiObservation]
}

struct EarthquakeSummary: Identifiable, Hashable, Sendable {
    let id: String
    let eventID: String
    let reportTime: String
    let eventTime: String
    let hypocenterName: String
    let magnitude: String
    let depth: String
    let maximumIntensity: String
    let headline: String
    let tsunamiComment: String
    let coordinate: GeoCoordinate?
    let intensityAreas: [EarthquakeIntensityArea]
    let intensityPoints: [EarthquakeIntensityPoint]
    let sourceURL: URL

    func replacingIntensityPoints(_ points: [EarthquakeIntensityPoint]) -> Self {
        Self(
            id: id,
            eventID: eventID,
            reportTime: reportTime,
            eventTime: eventTime,
            hypocenterName: hypocenterName,
            magnitude: magnitude,
            depth: depth,
            maximumIntensity: maximumIntensity,
            headline: headline,
            tsunamiComment: tsunamiComment,
            coordinate: coordinate,
            intensityAreas: intensityAreas,
            intensityPoints: points,
            sourceURL: sourceURL
        )
    }
}

struct EarthquakeIntensityArea: Identifiable, Hashable, Sendable {
    let areaCode: String
    let name: String
    let intensity: String

    var id: String { areaCode }
}

struct EarthquakeIntensityPoint: Identifiable, Hashable, Sendable {
    let stationCode: String
    let name: String
    let prefecture: String
    let intensity: String
    let coordinate: GeoCoordinate?

    var id: String { stationCode }
}

struct EarthquakeStationRecord: Decodable, Sendable {
    let name: String
    let latitude: Double
    let longitude: Double
}

enum EarthquakeStationLookup {
    static func normalizedName(_ value: String) -> String {
        value.precomposedStringWithCompatibilityMapping
            .replacingOccurrences(of: #"\s+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"[（(].*?[）)]"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"震度計$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"[＊*]+$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func makeLookup(_ records: [EarthquakeStationRecord]) -> [String: EarthquakeStationRecord] {
        var lookup = Dictionary(
            records.map { (normalizedName($0.name), $0) },
            uniquingKeysWith: { current, _ in current }
        )
        var municipalityGroups: [String: [EarthquakeStationRecord]] = [:]
        for record in records {
            for key in municipalityKeys(record.name) {
                municipalityGroups[key, default: []].append(record)
            }
        }
        for (key, candidates) in municipalityGroups where !key.isEmpty && candidates.count == 1 {
            lookup["municipality:\(key)"] = candidates[0]
        }
        return lookup
    }

    static func makeLookup(_ keyedRecords: [String: EarthquakeStationRecord]) -> [String: EarthquakeStationRecord] {
        var lookup = keyedRecords
        for (key, record) in keyedRecords {
            lookup[normalizedName(key)] = record
            lookup[normalizedName(record.name)] = record
        }
        let uniqueRecords = Dictionary(
            keyedRecords.values.map { ("\($0.name)|\($0.latitude)|\($0.longitude)", $0) },
            uniquingKeysWith: { current, _ in current }
        ).values.map { $0 }
        for (key, record) in makeLookup(uniqueRecords) where lookup[key] == nil {
            lookup[key] = record
        }
        return lookup
    }

    static func station(
        code: String,
        name: String,
        in stations: [String: EarthquakeStationRecord]
    ) -> EarthquakeStationRecord? {
        if let direct = stations[code] ?? stations[normalizedName(name)] ?? stations[name] {
            return direct
        }
        for municipality in municipalityKeys(name) {
            if let station = stations["municipality:\(municipality)"] {
                return station
            }
        }
        return nil
    }

    private static func municipalityKeys(_ value: String) -> [String] {
        var prefix = ""
        var keys: [String] = []
        for character in normalizedName(value) {
            prefix.append(character)
            if "市区町村".contains(character) {
                keys.append(prefix)
            }
        }
        return Array(keys.reversed())
    }
}

struct EarthquakeFeedEntry: Hashable, Sendable {
    let id: String
    let title: String
    let updated: String
    let url: URL
    let bulletinCode: String
}

enum EarthquakeXMLDecoder {
    static func feedEntries(data: Data) throws -> [EarthquakeFeedEntry] {
        let root = try XMLTreeDecoder.decode(data: data)
        return root.descendants(named: "entry").compactMap { entry in
            guard let href = entry.children.first(where: { $0.name == "link" })?.attributes["href"],
                  let url = URL(string: href),
                  let codeRange = href.range(
                    of: #"(?:VXSE5[1-3]|VTSE(?:41|51|52))"#,
                    options: .regularExpression
                  )
            else {
                return nil
            }
            return EarthquakeFeedEntry(
                id: entry.firstChild(named: "id")?.text ?? href,
                title: entry.firstChild(named: "title")?.text ?? "地震情報",
                updated: entry.firstChild(named: "updated")?.text ?? "",
                url: url,
                bulletinCode: String(href[codeRange])
            )
        }
        .sorted { $0.updated > $1.updated }
    }

    static func earthquake(
        data: Data,
        entry: EarthquakeFeedEntry,
        stations: [String: EarthquakeStationRecord] = [:]
    ) throws -> EarthquakeSummary {
        let root = try XMLTreeDecoder.decode(data: data)
        let reportTime = root.firstDescendant(named: "ReportDateTime")?.text
            ?? root.firstDescendant(named: "DateTime")?.text
            ?? entry.updated
        let eventTime = root.firstDescendant(named: "OriginTime")?.text
            ?? root.firstDescendant(named: "ArrivalTime")?.text
            ?? "--"
        let hypocenterArea = root.firstDescendant(named: "Hypocenter")?.firstDescendant(named: "Area")
        let hypocenter = hypocenterArea?.firstDescendant(named: "Name")?.text ?? "震源調査中"
        let coordinateText = hypocenterArea?.firstDescendant(named: "Coordinate")?.text ?? ""
        let parsedCoordinate = parseCoordinate(coordinateText)
        let magnitudeNode = root.firstDescendant(named: "Magnitude")
        let magnitude = formatMagnitude(magnitudeNode?.text, description: magnitudeNode?.attributes["description"])
        let maximumIntensity = intensityLabel(root.firstDescendant(named: "MaxInt")?.text)
        let headline = root.firstDescendant(named: "Headline")?.firstDescendant(named: "Text")?.text ?? ""
        let tsunamiComment = root.firstDescendant(named: "Comments")?
            .firstDescendant(named: "ForecastComment")?
            .firstDescendant(named: "Text")?.text ?? ""
        let eventID = root.firstDescendant(named: "EventID")?.text
        let intensityAreas = root.descendants(named: "Area").compactMap { node -> EarthquakeIntensityArea? in
            guard let rawCode = node.firstChild(named: "Code")?.text,
                  let codeNumber = Int(rawCode.filter(\.isNumber)),
                  let rawIntensity = node.firstChild(named: "MaxInt")?.text
            else {
                return nil
            }
            return EarthquakeIntensityArea(
                areaCode: String(codeNumber),
                name: node.firstChild(named: "Name")?.text ?? String(codeNumber),
                intensity: intensityLabel(rawIntensity)
            )
        }
        let intensityPoints = root.descendants(named: "Pref").flatMap { prefectureNode in
            let prefecture = prefectureNode.firstChild(named: "Name")?.text ?? ""
            return prefectureNode.descendants(named: "IntensityStation").compactMap { node -> EarthquakeIntensityPoint? in
                guard let code = node.firstChild(named: "Code")?.text,
                      let stationName = node.firstChild(named: "Name")?.text,
                      let rawIntensity = node.firstChild(named: "Int")?.text
                else {
                    return nil
                }
                let station = EarthquakeStationLookup.station(
                    code: code,
                    name: stationName,
                    in: stations
                )
                return EarthquakeIntensityPoint(
                    stationCode: code,
                    name: stationName,
                    prefecture: prefecture,
                    intensity: intensityLabel(rawIntensity),
                    coordinate: station.map {
                        GeoCoordinate(latitude: $0.latitude, longitude: $0.longitude)
                    }
                )
            }
        }
        let stableID = [eventID, eventTime, hypocenter].compactMap { value in
            guard let value, !value.isEmpty else { return nil }
            return value
        }.joined(separator: ":")

        return EarthquakeSummary(
            id: stableID.isEmpty ? entry.id : stableID,
            eventID: eventID ?? "",
            reportTime: reportTime,
            eventTime: eventTime,
            hypocenterName: hypocenter,
            magnitude: magnitude,
            depth: formatDepth(parsedCoordinate.depthKilometers),
            maximumIntensity: maximumIntensity,
            headline: headline,
            tsunamiComment: tsunamiComment,
            coordinate: parsedCoordinate.coordinate,
            intensityAreas: Dictionary(
                intensityAreas.map { ($0.areaCode, $0) },
                uniquingKeysWith: { current, _ in current }
            ).values.sorted {
                SeismicIntensityCatalog.rank($0.intensity) > SeismicIntensityCatalog.rank($1.intensity)
            },
            intensityPoints: intensityPoints,
            sourceURL: entry.url
        )
    }

    static func tsunami(data: Data, entry: EarthquakeFeedEntry) throws -> TsunamiReport {
        let root = try XMLTreeDecoder.decode(data: data)
        guard let tsunamiNode = root.firstDescendant(named: "Tsunami") else {
            throw WeatherAPIError.invalidResponse
        }
        let eventID = root.firstDescendant(named: "EventID")?.text ?? ""
        let reportTime = root.firstDescendant(named: "ReportDateTime")?.text
            ?? root.firstDescendant(named: "DateTime")?.text
            ?? entry.updated
        let validTime = root.firstDescendant(named: "ValidDateTime")?.text ?? ""
        let title = root.firstDescendant(named: "Head")?.firstChild(named: "Title")?.text
            ?? entry.title
        let headline = root.firstDescendant(named: "Headline")?.firstDescendant(named: "Text")?.text ?? ""
        let forecast = tsunamiNode.firstChild(named: "Forecast")
        let observation = tsunamiNode.firstChild(named: "Observation")
        let areas = forecast?.children
            .filter { $0.name == "Item" }
            .compactMap(tsunamiArea(from:)) ?? []
        let parsedObservations = observation?.children
            .filter { $0.name == "Item" }
            .flatMap { tsunamiObservations(from: $0, offshore: entry.bulletinCode == "VTSE52") } ?? []

        return TsunamiReport(
            id: entry.id,
            eventID: eventID,
            bulletinCode: entry.bulletinCode,
            title: title,
            headline: headline,
            reportTime: reportTime,
            validTime: validTime,
            areas: areas,
            observations: entry.bulletinCode == "VTSE52" ? [] : parsedObservations,
            offshoreObservations: entry.bulletinCode == "VTSE52" ? parsedObservations : []
        )
    }

    static func mergedTsunami(reports: [TsunamiReport]) -> TsunamiSnapshot? {
        guard !reports.isEmpty else { return nil }
        let grouped = Dictionary(grouping: reports) { report in
            report.eventID.isEmpty ? "report:\(report.id)" : report.eventID
        }
        guard let eventReports = grouped.values.max(by: { left, right in
            (latestTsunamiReport(in: left)?.reportTime ?? "")
                < (latestTsunamiReport(in: right)?.reportTime ?? "")
        }) else {
            return nil
        }
        let ordered = eventReports.sorted { $0.reportTime > $1.reportTime }
        guard let latest = ordered.first else { return nil }
        let latestForecast = ordered.first(where: { !$0.areas.isEmpty }) ?? latest
        let areaPairs: [(String, TsunamiArea)] = latestForecast.areas.map { ($0.id, $0) }
        let uniqueAreas: [String: TsunamiArea] = Dictionary(
            areaPairs,
            uniquingKeysWith: { current, _ in current }
        )
        let areas: [TsunamiArea] = uniqueAreas.values.sorted { left, right in
            left.level.rank == right.level.rank ? left.id < right.id : left.level.rank > right.level.rank
        }
        let observations = mergedTsunamiObservations(ordered.flatMap(\.observations))
        let offshoreObservations = mergedTsunamiObservations(ordered.flatMap(\.offshoreObservations))
        let highestLevel = areas.map { $0.level }.max(by: { $0.rank < $1.rank }) ?? TsunamiLevel.none

        return TsunamiSnapshot(
            id: latest.eventID.isEmpty ? latest.id : latest.eventID,
            eventID: latest.eventID,
            title: latest.title,
            headline: latest.headline.isEmpty ? latestForecast.headline : latest.headline,
            reportTime: latest.reportTime,
            validTime: latest.validTime.isEmpty ? latestForecast.validTime : latest.validTime,
            areas: areas,
            observations: observations,
            offshoreObservations: offshoreObservations,
            highestLevel: highestLevel
        )
    }

    private static func tsunamiArea(from item: XMLTreeNode) -> TsunamiArea? {
        let area = item.firstChild(named: "Area")
        let category = item.firstChild(named: "Category")
        let kind = category?.firstChild(named: "Kind")
        let firstHeight = item.firstChild(named: "FirstHeight")
        let maximumHeight = item.firstChild(named: "MaxHeight")
        let code = area?.firstChild(named: "Code")?.text ?? ""
        let name = area?.firstChild(named: "Name")?.text ?? ""
        let grade = kind?.firstChild(named: "Name")?.text ?? ""
        let gradeCode = kind?.firstChild(named: "Code")?.text ?? ""
        guard !code.isEmpty || !name.isEmpty || !grade.isEmpty else { return nil }
        return TsunamiArea(
            code: code,
            name: name.isEmpty ? (code.isEmpty ? "津波予報区" : code) : name,
            grade: grade.isEmpty ? "発表内容不明" : grade,
            level: tsunamiLevel(name: grade, code: gradeCode),
            arrivalTime: firstHeight?.firstChild(named: "ArrivalTime")?.text ?? "",
            arrivalCondition: firstHeight?.firstChild(named: "Condition")?.text ?? "",
            height: tsunamiHeight(from: maximumHeight),
            heightCondition: maximumHeight?.firstChild(named: "Condition")?.text ?? ""
        )
    }

    private static func tsunamiObservations(from item: XMLTreeNode, offshore: Bool) -> [TsunamiObservation] {
        let area = item.firstChild(named: "Area")
        let areaCode = area?.firstChild(named: "Code")?.text ?? ""
        let areaName = area?.firstChild(named: "Name")?.text ?? ""
        return item.children.filter { $0.name == "Station" }.enumerated().compactMap { index, station in
            let code = station.firstChild(named: "Code")?.text ?? ""
            let name = station.firstChild(named: "Name")?.text ?? ""
            guard !code.isEmpty || !name.isEmpty else { return nil }
            let firstHeight = station.firstChild(named: "FirstHeight")
            let maximumHeight = station.firstChild(named: "MaxHeight")
            return TsunamiObservation(
                id: code.isEmpty ? "\(areaCode):\(name):\(index)" : code,
                areaCode: areaCode,
                areaName: areaName,
                stationName: name.isEmpty ? code : name,
                offshore: offshore,
                arrivalTime: firstHeight?.firstChild(named: "ArrivalTime")?.text ?? "",
                arrivalCondition: firstHeight?.firstChild(named: "Condition")?.text ?? "",
                maximumHeightTime: maximumHeight?.firstChild(named: "DateTime")?.text ?? "",
                maximumHeight: tsunamiHeight(from: maximumHeight),
                maximumHeightCondition: maximumHeight?.firstChild(named: "Condition")?.text ?? ""
            )
        }
    }

    private static func latestTsunamiReport(in reports: [TsunamiReport]) -> TsunamiReport? {
        reports.max(by: { $0.reportTime < $1.reportTime })
    }

    private static func mergedTsunamiObservations(_ observations: [TsunamiObservation]) -> [TsunamiObservation] {
        Dictionary(
            observations.map { ($0.id, $0) },
            uniquingKeysWith: { current, _ in current }
        ).values.sorted { $0.maximumHeightTime > $1.maximumHeightTime }
    }

    private static func tsunamiLevel(name: String, code: String) -> TsunamiLevel {
        let value = "\(name) \(code)"
        if value.contains("大津波警報") { return .majorWarning }
        if value.contains("津波警報") && !value.contains("解除") { return .warning }
        if value.contains("津波注意報") && !value.contains("解除") { return .advisory }
        if value.contains("津波予報") || value.contains("若干の海面変動") { return .forecast }
        return .none
    }

    private static func tsunamiHeight(from node: XMLTreeNode?) -> String {
        guard let height = node?.firstChild(named: "TsunamiHeight") else { return "" }
        if let description = height.attributes["description"], !description.isEmpty { return description }
        guard let numeric = Double(height.text) else { return height.text }
        return String(format: "%g m", numeric)
    }

    private static func parseCoordinate(_ value: String) -> (coordinate: GeoCoordinate?, depthKilometers: Int?) {
        let pattern = #"([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+)?/"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..<value.endIndex, in: value)),
              let latRange = Range(match.range(at: 1), in: value),
              let lonRange = Range(match.range(at: 2), in: value),
              let latitude = Double(value[latRange]),
              let longitude = Double(value[lonRange])
        else {
            return (nil, nil)
        }
        let depthMeters: Double? = {
            guard match.range(at: 3).location != NSNotFound,
                  let range = Range(match.range(at: 3), in: value)
            else {
                return nil
            }
            return Double(value[range]).map { abs($0) }
        }()
        return (
            GeoCoordinate(latitude: latitude, longitude: longitude),
            depthMeters.map { Int(($0 / 1_000).rounded()) }
        )
    }

    private static func formatMagnitude(_ value: String?, description: String?) -> String {
        if let value, let numeric = Double(value) { return String(format: "M%.1f", numeric) }
        if let description,
           let match = description.range(of: #"M\s*[0-9.]+"#, options: .regularExpression) {
            return String(description[match]).replacingOccurrences(of: " ", with: "")
        }
        return "M--"
    }

    private static func formatDepth(_ depth: Int?) -> String {
        guard let depth else { return "--" }
        return depth == 0 ? "ごく浅い" : "\(depth) km"
    }

    private static func intensityLabel(_ value: String?) -> String {
        switch value {
        case "7": "震度7"
        case "6+": "震度6強"
        case "6-": "震度6弱"
        case "5+": "震度5強"
        case "5-": "震度5弱"
        case "4": "震度4"
        case "3": "震度3"
        case "2": "震度2"
        case "1": "震度1"
        default: "震度不明"
        }
    }

}

extension EarthquakeSnapshot {
    static let preview = EarthquakeSnapshot(
        updatedAt: "2026-07-13T18:42:00+09:00",
        earthquakes: [
            EarthquakeSummary(
                id: "preview-earthquake",
                eventID: "preview-earthquake",
                reportTime: "2026-07-13T18:42:00+09:00",
                eventTime: "2026-07-13T18:38:00+09:00",
                hypocenterName: "奈良県",
                magnitude: "M3.2",
                depth: "10 km",
                maximumIntensity: "震度2",
                headline: "この地震による津波の心配はありません。",
                tsunamiComment: "この地震による津波の心配はありません。",
                coordinate: GeoCoordinate(latitude: 34.6, longitude: 135.8),
                intensityAreas: [
                    EarthquakeIntensityArea(areaCode: "560", name: "奈良県", intensity: "震度2")
                ],
                intensityPoints: [
                    EarthquakeIntensityPoint(
                        stationCode: "2920100",
                        name: "奈良市",
                        prefecture: "奈良県",
                        intensity: "震度2",
                        coordinate: GeoCoordinate(latitude: 34.68, longitude: 135.82)
                    )
                ],
                sourceURL: URL(string: "https://www.jma.go.jp/")!
            )
        ],
        tsunami: TsunamiSnapshot(
            id: "preview-tsunami",
            eventID: "preview-earthquake",
            title: "津波注意報・予報",
            headline: "海の中や海岸付近は危険です。",
            reportTime: "2026-07-13T18:45:00+09:00",
            validTime: "",
            areas: [
                TsunamiArea(
                    code: "100",
                    name: "北海道太平洋沿岸東部",
                    grade: "津波注意報",
                    level: .advisory,
                    arrivalTime: "2026-07-13T19:10:00+09:00",
                    arrivalCondition: "",
                    height: "1 m",
                    heightCondition: ""
                )
            ],
            observations: [],
            offshoreObservations: [],
            highestLevel: .advisory
        ),
        tsunamiStatus: .available
    )
}
