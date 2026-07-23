import Foundation

struct VolcanoLevelTone: Equatable, Sendable {
    let red: UInt8
    let green: UInt8
    let blue: UInt8
    let usesLightText: Bool

    var redUnit: Double { Double(red) / 255 }
    var greenUnit: Double { Double(green) / 255 }
    var blueUnit: Double { Double(blue) / 255 }
}

enum VolcanoLevelPalette {
    static func tone(for level: Int) -> VolcanoLevelTone {
        switch level {
        case 5: return VolcanoLevelTone(red: 0xCA, green: 0x01, blue: 0xF9, usesLightText: true)
        case 4: return VolcanoLevelTone(red: 0xFF, green: 0x29, blue: 0x00, usesLightText: true)
        case 3: return VolcanoLevelTone(red: 0xFF, green: 0xAD, blue: 0x00, usesLightText: false)
        case 2: return VolcanoLevelTone(red: 0xFA, green: 0xF7, blue: 0x00, usesLightText: false)
        case 1: return VolcanoLevelTone(red: 0xF0, green: 0xF0, blue: 0xF8, usesLightText: false)
        default: return VolcanoLevelTone(red: 0x6F, green: 0x87, blue: 0x9B, usesLightText: true)
        }
    }
}

enum VolcanoTextNormalizer {
    static func halfWidthDigits(_ value: String?) -> String {
        guard let value else { return "" }
        return value.unicodeScalars.map { scalar -> String in
            guard (0xFF10...0xFF19).contains(scalar.value),
                  let asciiDigit = UnicodeScalar(scalar.value - 0xFEE0)
            else { return String(scalar) }
            return String(asciiDigit)
        }.joined()
    }
}

enum EarthquakeContentMode: String, Sendable {
    case earthquake
    case volcano
}

struct VolcanoSnapshot: Sendable {
    let updatedAt: String
    let volcanoes: [VolcanoSummary]

    func preferredVolcano(selectedCode: String?) -> VolcanoSummary? {
        if let selectedCode,
           let selected = volcanoes.first(where: { $0.code == selectedCode }) {
            return selected
        }
        return volcanoes.max { left, right in
            if left.alertPriority != right.alertPriority {
                return left.alertPriority < right.alertPriority
            }
            return left.level < right.level
        }
    }

    static let preview = VolcanoSnapshot(
        updatedAt: "2026-07-23 10:00",
        volcanoes: [
            VolcanoSummary(
                code: "506",
                name: "桜島",
                coordinate: GeoCoordinate(latitude: 31.593, longitude: 130.657),
                kindName: "レベル3（入山規制）",
                level: 3,
                alertPriority: 3,
                bulletins: [
                    VolcanoBulletin(
                        id: "preview-volcano",
                        bulletinCode: "VFVO51",
                        volcanoCode: "506",
                        craterName: "南岳山頂火口",
                        title: "桜島 火山の状況に関する解説情報",
                        reportTime: "2026-07-23 10:00",
                        kindName: "レベル3（入山規制）",
                        headline: "噴火警戒レベル3が継続しています。",
                        activity: "火山活動の状況に注意してください。",
                        prevention: "火口から概ね2kmの範囲では警戒してください。",
                        nextAdvisory: "状況に変化があった場合は随時発表します。",
                        targetAreaGroups: [],
                        ashForecasts: [],
                        sourceURL: URL(string: "https://www.jma.go.jp/bosai/volcano/")!
                    )
                ]
            )
        ]
    )
}

struct VolcanoSummary: Identifiable, Hashable, Sendable {
    let code: String
    let name: String
    let coordinate: GeoCoordinate?
    let kindName: String
    let level: Int
    let alertPriority: Int
    let bulletins: [VolcanoBulletin]

    var id: String { code }

    func availableAshForecasts(now: Date = .now) -> [VolcanoAshForecast] {
        let candidates = bulletins.flatMap(\.ashForecasts)
            .filter { forecast in
                !forecast.areas.isEmpty && Self.parseForecastDate(forecast.endTime).map { $0 >= now } == true
            }
        var seenIntervals = Set<String>()
        return candidates.filter { forecast in
            seenIntervals.insert("\(forecast.startTime)|\(forecast.endTime)").inserted
        }.sorted { left, right in
                let leftStart = Self.parseForecastDate(left.startTime)
                let rightStart = Self.parseForecastDate(right.startTime)
                let leftCurrent = leftStart.map { $0 <= now } ?? true
                let rightCurrent = rightStart.map { $0 <= now } ?? true
                if leftCurrent != rightCurrent { return leftCurrent }
                return (Self.parseForecastDate(left.endTime) ?? .distantFuture)
                    < (Self.parseForecastDate(right.endTime) ?? .distantFuture)
            }
    }

    private static func parseForecastDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }
}

struct VolcanoTargetAreaGroup: Hashable, Sendable {
    let kindName: String
    let areas: [String]
}

enum VolcanoAshfallCategory: Hashable, Sendable {
    case ashfall
    case smallCinders
}

enum VolcanoAshfallAmount: Hashable, Sendable {
    case heavy
    case moderate
    case light
    case unknown
}

struct VolcanoAshForecastArea: Identifiable, Hashable, Sendable {
    let id: String
    let kindName: String
    let category: VolcanoAshfallCategory
    let amount: VolcanoAshfallAmount
    let polygon: [GeoCoordinate]
    let holes: [[GeoCoordinate]]
    let municipalities: [String]
}

struct VolcanoAshForecast: Identifiable, Hashable, Sendable {
    let id: String
    let bulletinCode: String
    let startTime: String
    let endTime: String
    let areas: [VolcanoAshForecastArea]
}

struct VolcanoBulletin: Identifiable, Hashable, Sendable {
    let id: String
    let bulletinCode: String
    let volcanoCode: String
    let craterName: String
    let title: String
    let reportTime: String
    let kindName: String
    let headline: String
    let activity: String
    let prevention: String
    let nextAdvisory: String
    let targetAreaGroups: [VolcanoTargetAreaGroup]
    let ashForecasts: [VolcanoAshForecast]
    let sourceURL: URL
}

struct VolcanoFeedEntry: Hashable, Sendable {
    let id: String
    let title: String
    let updated: String
    let url: URL
    let bulletinCode: String
}

enum VolcanoSnapshotBuilder {
    static func build(
        statusData: Data,
        catalogData: Data,
        bulletins: [VolcanoBulletin] = []
    ) throws -> VolcanoSnapshot {
        let decoder = JSONDecoder()
        let status = try decoder.decode(VolcanoStatusDocument.self, from: statusData)
        let catalog = try decoder.decode([VolcanoCatalogRecord].self, from: catalogData)
        var statusByCode: [String: VolcanoStatusItem] = [:]
        for info in status.volcanoInfos ?? [] {
            for item in info.items ?? [] {
                for area in item.areas ?? [] {
                    statusByCode[area.code] = item
                }
            }
        }
        let volcanoes = catalog.map { record in
            let item = statusByCode[record.code]
            let relatedBulletins = bulletins
                .filter { $0.volcanoCode == record.code }
                .sorted { $0.reportTime > $1.reportTime }
            let bulletinKind = relatedBulletins.first?.kindName
            let level = alertLevel(name: item?.name ?? bulletinKind, code: item?.code)
            return VolcanoSummary(
                code: record.code,
                name: VolcanoTextNormalizer.halfWidthDigits(record.name),
                coordinate: record.coordinate,
                kindName: VolcanoTextNormalizer.halfWidthDigits(item?.name ?? bulletinKind ?? "警戒状況未確認"),
                level: level,
                alertPriority: alertPriority(level: level, code: item?.code),
                bulletins: relatedBulletins
            )
        }
        .sorted {
            if $0.alertPriority != $1.alertPriority { return $0.alertPriority > $1.alertPriority }
            return $0.code < $1.code
        }
        return VolcanoSnapshot(
            updatedAt: VolcanoTextNormalizer.halfWidthDigits(status.reportDatetime ?? "未取得"),
            volcanoes: volcanoes
        )
    }

    private static func alertLevel(name: String?, code: String?) -> Int {
        let normalizedName = VolcanoTextNormalizer.halfWidthDigits(name)
        if let range = normalizedName.range(of: #"レベル\s*([1-5])"#, options: .regularExpression),
           let digit = normalizedName[range].last,
           let value = Int(String(digit)) {
            return value
        }
        guard let value = Int(code ?? ""), (11...15).contains(value) else { return 0 }
        return value - 10
    }

    private static func alertPriority(level: Int, code: String?) -> Int {
        if level > 0 { return level }
        switch Int(code ?? "") {
        case 25: return 5
        case 24: return 4
        case 23: return 3
        case 22, 36: return 2
        case 21, 35: return 1
        default: return 0
        }
    }
}

enum VolcanoXMLDecoder {
    private static let supportedCodes = ["VFVO50", "VFVO51", "VFVO52", "VFVO53", "VFVO54", "VFVO55", "VFVO56"]

    static func feedEntries(data: Data) throws -> [VolcanoFeedEntry] {
        let root = try XMLTreeDecoder.decode(data: data)
        return root.descendants(named: "entry").compactMap { entry in
            guard let href = entry.children.first(where: { $0.name == "link" })?.attributes["href"],
                  let url = URL(string: href),
                  let bulletinCode = supportedCodes.first(where: { href.contains($0) })
            else { return nil }
            return VolcanoFeedEntry(
                id: entry.firstChild(named: "id")?.text ?? href,
                title: VolcanoTextNormalizer.halfWidthDigits(entry.firstChild(named: "title")?.text ?? "火山情報"),
                updated: VolcanoTextNormalizer.halfWidthDigits(entry.firstChild(named: "updated")?.text ?? ""),
                url: url,
                bulletinCode: bulletinCode
            )
        }
        .sorted { $0.updated > $1.updated }
    }

    static func bulletin(data: Data, entry: VolcanoFeedEntry) throws -> VolcanoBulletin {
        let root = try XMLTreeDecoder.decode(data: data)
        let head = root.firstDescendant(named: "Head")
        let body = root.firstDescendant(named: "Body")
        let volcanoInformation = body?.descendants(named: "VolcanoInfo").first { node in
            (node.attributes["type"] ?? "").contains("対象火山")
        } ?? body?.firstDescendant(named: "VolcanoInfo")
        let item = volcanoInformation?.firstChild(named: "Item")
        let kind = item?.firstChild(named: "Kind")
        let volcanoArea = item?.children
            .first(where: { $0.name == "Areas" && ($0.attributes["codeType"] ?? "").contains("火山名") })?
            .firstChild(named: "Area")
        let content = body?.firstDescendant(named: "VolcanoInfoContent")
        let reportTime = VolcanoTextNormalizer.halfWidthDigits(head?.firstChild(named: "ReportDateTime")?.text
            ?? root.firstDescendant(named: "DateTime")?.text
            ?? entry.updated)
        let eventID = head?.firstChild(named: "EventID")?.text ?? entry.id
        let volcanoCode = volcanoArea?.firstChild(named: "Code")?.text ?? eventID
        let targetAreaGroups: [VolcanoTargetAreaGroup]
        if entry.bulletinCode == "VFVO50" {
            targetAreaGroups = body?.descendants(named: "VolcanoInfo")
                .filter { ($0.attributes["type"] ?? "").contains("市町村") }
                .flatMap { $0.children.filter { $0.name == "Item" } }
                .compactMap { targetItem -> VolcanoTargetAreaGroup? in
                    let targetKind = VolcanoTextNormalizer.halfWidthDigits(
                        targetItem.firstChild(named: "Kind")?.firstChild(named: "Name")?.text
                            ?? "噴火警報・予報の対象地域"
                    )
                    let areas = targetItem.children
                        .filter { $0.name == "Areas" && ($0.attributes["codeType"] ?? "").contains("市町村") }
                        .flatMap { $0.children.filter { $0.name == "Area" } }
                        .compactMap { $0.firstChild(named: "Name")?.text }
                        .map { VolcanoTextNormalizer.halfWidthDigits($0) }
                    return areas.isEmpty ? nil : VolcanoTargetAreaGroup(kindName: targetKind, areas: areas)
                } ?? []
        } else {
            targetAreaGroups = []
        }
        let ashForecasts = ashForecasts(from: body, bulletinCode: entry.bulletinCode)

        return VolcanoBulletin(
            id: "\(eventID)-\(entry.bulletinCode)-\(reportTime)",
            bulletinCode: entry.bulletinCode,
            volcanoCode: volcanoCode,
            craterName: VolcanoTextNormalizer.halfWidthDigits(volcanoArea?.firstChild(named: "CraterName")?.text ?? ""),
            title: VolcanoTextNormalizer.halfWidthDigits(head?.firstChild(named: "Title")?.text ?? entry.title),
            reportTime: reportTime,
            kindName: VolcanoTextNormalizer.halfWidthDigits(kind?.firstChild(named: "Name")?.text
                ?? head?.firstChild(named: "InfoKind")?.text
                ?? entry.title),
            headline: VolcanoTextNormalizer.halfWidthDigits(content?.firstChild(named: "VolcanoHeadline")?.text
                ?? head?.firstDescendant(named: "Headline")?.firstDescendant(named: "Text")?.text
                ?? ""),
            activity: VolcanoTextNormalizer.halfWidthDigits(content?.firstChild(named: "VolcanoActivity")?.text ?? ""),
            prevention: VolcanoTextNormalizer.halfWidthDigits(content?.firstChild(named: "VolcanoPrevention")?.text ?? ""),
            nextAdvisory: VolcanoTextNormalizer.halfWidthDigits(content?.firstChild(named: "NextAdvisory")?.text ?? ""),
            targetAreaGroups: targetAreaGroups,
            ashForecasts: ashForecasts,
            sourceURL: entry.url
        )
    }

    private static func ashForecasts(
        from body: XMLTreeNode?,
        bulletinCode: String
    ) -> [VolcanoAshForecast] {
        body?.descendants(named: "AshInfo").enumerated().compactMap { forecastIndex, ashInfo in
            let startTime = VolcanoTextNormalizer.halfWidthDigits(ashInfo.firstChild(named: "StartTime")?.text ?? "")
            let endTime = VolcanoTextNormalizer.halfWidthDigits(ashInfo.firstChild(named: "EndTime")?.text ?? "")
            let areas = ashInfo.children.filter { $0.name == "Item" }.enumerated().flatMap { itemIndex, item in
                let municipalities = item.children
                    .filter { $0.name == "Areas" }
                    .flatMap { $0.children.filter { $0.name == "Area" } }
                    .compactMap { $0.firstChild(named: "Name")?.text }
                    .map { VolcanoTextNormalizer.halfWidthDigits($0) }
                return item.children.filter { $0.name == "Kind" }.enumerated().flatMap { kindIndex, kind in
                    let property = kind.firstChild(named: "Property") ?? item.firstDescendant(named: "Property")
                    let kindName = VolcanoTextNormalizer.halfWidthDigits(kind.firstChild(named: "Name")?.text ?? "降灰予報")
                    let polygonGroups = groupPolygonRings(
                        property?.descendants(named: "Polygon")
                            .map { parsePolygon($0.text) }
                            .filter { $0.count >= 4 } ?? []
                    )
                    return polygonGroups.enumerated().map { polygonIndex, group in
                        return VolcanoAshForecastArea(
                            id: "\(bulletinCode)-\(forecastIndex)-\(itemIndex)-\(kindIndex)-\(polygonIndex)",
                            kindName: kindName,
                            category: kindName.contains("小さな噴石") ? .smallCinders : .ashfall,
                            amount: ashfallAmount(kindName),
                            polygon: group.polygon,
                            holes: group.holes,
                            municipalities: municipalities
                        )
                    }
                }
            }
            guard !areas.isEmpty else { return nil }
            return VolcanoAshForecast(
                id: "\(bulletinCode)-\(forecastIndex)-\(startTime)-\(endTime)",
                bulletinCode: bulletinCode,
                startTime: startTime,
                endTime: endTime,
                areas: areas
            )
        } ?? []
    }

    private static func ashfallAmount(_ kindName: String) -> VolcanoAshfallAmount {
        if kindName.contains("やや多量") { return .moderate }
        if kindName.contains("多量") { return .heavy }
        if kindName.contains("少量") { return .light }
        return .unknown
    }

    private static func parsePolygon(_ value: String) -> [GeoCoordinate] {
        var coordinates = value.split(separator: "/").compactMap { parseCoordinate(String($0)) }
        guard coordinates.count >= 3 else { return [] }
        if coordinates.first != coordinates.last, let first = coordinates.first {
            coordinates.append(first)
        }
        return coordinates
    }

    private struct PolygonRing {
        let index: Int
        let coordinates: [GeoCoordinate]
        let area: Double
        var parent: Int?
        var depth = 0
    }

    private static func groupPolygonRings(
        _ rings: [[GeoCoordinate]]
    ) -> [(polygon: [GeoCoordinate], holes: [[GeoCoordinate]])] {
        var candidates = rings.enumerated().compactMap { index, ring -> PolygonRing? in
            guard ring.count >= 4 else { return nil }
            return PolygonRing(
                index: index,
                coordinates: ring,
                area: abs(polygonSignedArea(ring)),
                parent: nil
            )
        }
        for candidateIndex in candidates.indices {
            guard let point = candidates[candidateIndex].coordinates.first else { continue }
            candidates[candidateIndex].parent = candidates
                .filter {
                    $0.index != candidates[candidateIndex].index
                        && $0.area > candidates[candidateIndex].area
                        && pointInPolygon(point, polygon: $0.coordinates)
                }
                .min(by: { $0.area < $1.area })?
                .index
        }
        let candidateByIndex = Dictionary(uniqueKeysWithValues: candidates.map { ($0.index, $0) })
        func depth(of candidate: PolygonRing) -> Int {
            guard let parentIndex = candidate.parent,
                  let parent = candidateByIndex[parentIndex]
            else { return 0 }
            return depth(of: parent) + 1
        }
        for index in candidates.indices {
            candidates[index].depth = depth(of: candidates[index])
        }
        return candidates.filter { $0.depth.isMultiple(of: 2) }.map { outer in
            (
                polygon: outer.coordinates,
                holes: candidates.filter {
                    $0.parent == outer.index && $0.depth == outer.depth + 1
                }.map(\.coordinates)
            )
        }
    }

    private static func polygonSignedArea(_ polygon: [GeoCoordinate]) -> Double {
        zip(polygon, polygon.dropFirst()).reduce(0) { result, pair in
            result + pair.0.longitude * pair.1.latitude - pair.1.longitude * pair.0.latitude
        } / 2
    }

    private static func pointInPolygon(
        _ point: GeoCoordinate,
        polygon: [GeoCoordinate]
    ) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        var previousIndex = polygon.count - 1
        for index in polygon.indices {
            let current = polygon[index]
            let previous = polygon[previousIndex]
            let crossesLatitude = (current.latitude > point.latitude) != (previous.latitude > point.latitude)
            if crossesLatitude {
                let longitudeAtPoint = (previous.longitude - current.longitude)
                    * (point.latitude - current.latitude)
                    / (previous.latitude - current.latitude)
                    + current.longitude
                if point.longitude < longitudeAtPoint {
                    inside.toggle()
                }
            }
            previousIndex = index
        }
        return inside
    }

    private static func parseCoordinate(_ value: String) -> GeoCoordinate? {
        if let values = captures(in: value, pattern: #"^([+-])(\d{2})(\d{2}(?:\.\d+)?)([+-])(\d{3})(\d{2}(?:\.\d+)?)"#),
           let latitudeDegrees = Double(values[1]), let latitudeMinutes = Double(values[2]),
           let longitudeDegrees = Double(values[4]), let longitudeMinutes = Double(values[5]) {
            let latitude = (latitudeDegrees + latitudeMinutes / 60) * (values[0] == "-" ? -1 : 1)
            let longitude = (longitudeDegrees + longitudeMinutes / 60) * (values[3] == "-" ? -1 : 1)
            return GeoCoordinate(latitude: latitude, longitude: longitude)
        }
        guard let values = captures(in: value, pattern: #"^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)"#),
              let latitude = Double(values[0]), let longitude = Double(values[1])
        else { return nil }
        return GeoCoordinate(latitude: latitude, longitude: longitude)
    }

    private static func captures(in value: String, pattern: String) -> [String]? {
        guard let expression = try? NSRegularExpression(pattern: pattern),
              let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value))
        else { return nil }
        return (1..<match.numberOfRanges).compactMap { index in
            guard let range = Range(match.range(at: index), in: value) else { return nil }
            return String(value[range])
        }
    }
}

private struct VolcanoStatusDocument: Decodable {
    let reportDatetime: String?
    let volcanoInfos: [VolcanoStatusInfo]?
}

private struct VolcanoStatusInfo: Decodable {
    let items: [VolcanoStatusItem]?
}

private struct VolcanoStatusItem: Decodable {
    let code: String?
    let name: String?
    let areas: [VolcanoStatusArea]?
}

private struct VolcanoStatusArea: Decodable {
    let code: String
}

private struct VolcanoCatalogRecord: Decodable {
    let code: String
    let latlon: [String]?
    let name: String

    enum CodingKeys: String, CodingKey {
        case code, latlon
        case name = "name_jp"
    }

    var coordinate: GeoCoordinate? {
        guard let latlon, latlon.count >= 2,
              let latitude = Double(latlon[0]),
              let longitude = Double(latlon[1])
        else { return nil }
        return GeoCoordinate(latitude: latitude, longitude: longitude)
    }
}
