import Foundation

struct EarthquakeSnapshot: Sendable {
    let updatedAt: String
    let earthquakes: [EarthquakeSummary]
}

struct EarthquakeSummary: Identifiable, Hashable, Sendable {
    let id: String
    let reportTime: String
    let eventTime: String
    let hypocenterName: String
    let magnitude: String
    let depth: String
    let maximumIntensity: String
    let headline: String
    let coordinate: GeoCoordinate?
    let intensityAreas: [EarthquakeIntensityArea]
    let intensityPoints: [EarthquakeIntensityPoint]
    let sourceURL: URL
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
    let intensity: String
    let coordinate: GeoCoordinate

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
}

enum EarthquakeXMLDecoder {
    static func feedEntries(data: Data) throws -> [EarthquakeFeedEntry] {
        let root = try XMLTreeDecoder.decode(data: data)
        return root.descendants(named: "entry").compactMap { entry in
            guard let href = entry.children.first(where: { $0.name == "link" })?.attributes["href"],
                  let url = URL(string: href),
                  href.range(of: #"VXSE5[1-3]"#, options: .regularExpression) != nil
            else {
                return nil
            }
            return EarthquakeFeedEntry(
                id: entry.firstChild(named: "id")?.text ?? href,
                title: entry.firstChild(named: "title")?.text ?? "地震情報",
                updated: entry.firstChild(named: "updated")?.text ?? "",
                url: url
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
        let intensityPoints = root.descendants(named: "IntensityStation").compactMap { node -> EarthquakeIntensityPoint? in
            guard let code = node.firstChild(named: "Code")?.text,
                  let stationName = node.firstChild(named: "Name")?.text,
                  let station = EarthquakeStationLookup.station(
                      code: code,
                      name: stationName,
                      in: stations
                  ),
                  let rawIntensity = node.firstChild(named: "Int")?.text
            else {
                return nil
            }
            return EarthquakeIntensityPoint(
                stationCode: code,
                name: stationName,
                intensity: intensityLabel(rawIntensity),
                coordinate: GeoCoordinate(latitude: station.latitude, longitude: station.longitude)
            )
        }
        let stableID = [eventID, eventTime, hypocenter].compactMap { value in
            guard let value, !value.isEmpty else { return nil }
            return value
        }.joined(separator: ":")

        return EarthquakeSummary(
            id: stableID.isEmpty ? entry.id : stableID,
            reportTime: reportTime,
            eventTime: eventTime,
            hypocenterName: hypocenter,
            magnitude: magnitude,
            depth: formatDepth(parsedCoordinate.depthKilometers),
            maximumIntensity: maximumIntensity,
            headline: headline,
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
                reportTime: "2026-07-13T18:42:00+09:00",
                eventTime: "2026-07-13T18:38:00+09:00",
                hypocenterName: "奈良県",
                magnitude: "M3.2",
                depth: "10 km",
                maximumIntensity: "震度2",
                headline: "この地震による津波の心配はありません。",
                coordinate: GeoCoordinate(latitude: 34.6, longitude: 135.8),
                intensityAreas: [
                    EarthquakeIntensityArea(areaCode: "560", name: "奈良県", intensity: "震度2")
                ],
                intensityPoints: [
                    EarthquakeIntensityPoint(
                        stationCode: "2920100",
                        name: "奈良市",
                        intensity: "震度2",
                        coordinate: GeoCoordinate(latitude: 34.68, longitude: 135.82)
                    )
                ],
                sourceURL: URL(string: "https://www.jma.go.jp/")!
            )
        ]
    )
}
