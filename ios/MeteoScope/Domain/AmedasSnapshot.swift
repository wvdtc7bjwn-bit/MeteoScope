import Foundation

struct GeoCoordinate: Hashable, Sendable {
    let latitude: Double
    let longitude: Double
}

enum AmedasMetric: String, CaseIterable, Identifiable, Sendable {
    case temperature
    case precipitation
    case wind
    case humidity
    case pressure
    case snow

    var id: String { rawValue }

    var label: String {
        switch self {
        case .temperature: "気温"
        case .precipitation: "降水量"
        case .wind: "風速"
        case .humidity: "湿度"
        case .pressure: "気圧"
        case .snow: "積雪"
        }
    }

    var unit: String {
        switch self {
        case .temperature: "℃"
        case .precipitation: "mm"
        case .wind: "m/s"
        case .humidity: "%"
        case .pressure: "hPa"
        case .snow: "cm"
        }
    }

    var systemImage: String {
        switch self {
        case .temperature: "thermometer.medium"
        case .precipitation: "drop.fill"
        case .wind: "wind"
        case .humidity: "humidity.fill"
        case .pressure: "barometer"
        case .snow: "snowflake"
        }
    }

    var supportsLowRanking: Bool {
        self == .temperature || self == .humidity || self == .pressure
    }

    var supportsTodayRanking: Bool { self == .pressure }
}

enum AmedasRankingOrder: String, CaseIterable, Identifiable, Sendable {
    case high
    case low

    var id: String { rawValue }
    var label: String { self == .high ? "高い順" : "低い順" }
}

enum AmedasRankingPeriod: String, CaseIterable, Identifiable, Sendable {
    case current
    case today

    var id: String { rawValue }
    var label: String { self == .current ? "実況" : "今日ここまで" }
}

struct AmedasValues: Hashable, Sendable {
    let temperature: Double?
    let precipitation: Double?
    let wind: Double?
    let humidity: Double?
    let pressure: Double?
    let snow: Double?

    func value(for metric: AmedasMetric) -> Double? {
        switch metric {
        case .temperature: temperature
        case .precipitation: precipitation
        case .wind: wind
        case .humidity: humidity
        case .pressure: pressure
        case .snow: snow
        }
    }
}

struct AmedasStationObservation: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let coordinate: GeoCoordinate
    let values: AmedasValues
}

struct AmedasRankingItem: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let coordinate: GeoCoordinate?
    let value: Double
    let observationTime: String?
}

struct AmedasSnapshot: Sendable {
    let updatedAt: String
    let stations: [AmedasStationObservation]
    let dailyPressureMinimum: [AmedasRankingItem]

    func ranking(
        metric: AmedasMetric,
        period: AmedasRankingPeriod,
        order: AmedasRankingOrder,
        limit: Int = 20
    ) -> [AmedasRankingItem] {
        let source: [AmedasRankingItem]
        if metric == .pressure, period == .today {
            source = dailyPressureMinimum
        } else {
            source = stations.compactMap { station in
                guard let value = station.values.value(for: metric), shouldInclude(value, for: metric) else {
                    return nil
                }
                return AmedasRankingItem(
                    id: station.id,
                    name: station.name,
                    coordinate: station.coordinate,
                    value: value,
                    observationTime: updatedAt
                )
            }
        }

        return source
            .sorted { left, right in
                if left.value == right.value { return left.name < right.name }
                return order == .high ? left.value > right.value : left.value < right.value
            }
            .prefix(max(0, limit))
            .map { $0 }
    }

    private func shouldInclude(_ value: Double, for metric: AmedasMetric) -> Bool {
        switch metric {
        case .precipitation: value >= 0.1
        case .snow: value >= 1
        default: true
        }
    }
}

struct AmedasDailySeries: Hashable, Sendable {
    let stationID: String
    let metric: AmedasMetric
    let date: String
    let points: [AmedasSeriesPoint]

    var minimum: Double? { points.map(\.value).min() }
    var maximum: Double? { points.map(\.value).max() }
}

struct AmedasSeriesPoint: Identifiable, Hashable, Sendable {
    let timestamp: Date
    let value: Double

    var id: Date { timestamp }
}

struct AmedasStationRecord: Decodable, Sendable {
    let kjName: String?
    let enName: String?
    let lat: [Double]?
    let lon: [Double]?

    var coordinate: GeoCoordinate? {
        guard let lat, lat.count >= 2, let lon, lon.count >= 2 else { return nil }
        return GeoCoordinate(
            latitude: lat[0] + lat[1] / 60,
            longitude: lon[0] + lon[1] / 60
        )
    }
}

struct AmedasObservationRecord: Decodable, Sendable {
    let temp: [Double?]?
    let precipitation1h: [Double?]?
    let wind: [Double?]?
    let humidity: [Double?]?
    let normalPressure: [Double?]?
    let snow: [Double?]?
    let snow1h: [Double?]?

    var values: AmedasValues {
        AmedasValues(
            temperature: observedValue(temp),
            precipitation: observedValue(precipitation1h),
            wind: observedValue(wind),
            humidity: observedValue(humidity),
            pressure: observedValue(normalPressure),
            snow: observedValue(snow) ?? observedValue(snow1h)
        )
    }

    private func observedValue(_ source: [Double?]?) -> Double? {
        guard let source, let first = source.first, let value = first else { return nil }
        let quality = source.count > 1 ? (source[1] ?? -1) : 0
        guard quality == 0 else { return nil }
        return value
    }
}

enum AmedasSnapshotBuilder {
    static func mapTimestamp(from latestTime: String) -> String? {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: latestTime.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            let digits = latestTime.filter(\.isNumber)
            guard digits.count >= 12 else { return nil }
            return String(digits.prefix(12)) + "00"
        }

        let output = DateFormatter()
        output.calendar = Calendar(identifier: .gregorian)
        output.locale = Locale(identifier: "en_US_POSIX")
        output.timeZone = TimeZone(identifier: "Asia/Tokyo")
        output.dateFormat = "yyyyMMddHHmmss"
        return output.string(from: date)
    }

    static func buildStations(
        observations: [String: AmedasObservationRecord],
        metadata: [String: AmedasStationRecord]
    ) -> [AmedasStationObservation] {
        observations.compactMap { stationID, observation in
            guard let station = metadata[stationID], let coordinate = station.coordinate else { return nil }
            return AmedasStationObservation(
                id: stationID,
                name: station.kjName ?? station.enName ?? stationID,
                coordinate: coordinate,
                values: observation.values
            )
        }
        .sorted { $0.name < $1.name }
    }

    static func parseDailyPressureMinimum(
        html: String,
        stations: [AmedasStationObservation]
    ) -> [AmedasRankingItem] {
        let stationsByName = Dictionary(
            stations.map { ($0.name, $0) },
            uniquingKeysWith: { current, _ in current }
        )
        let rowPattern = #"<tr[^>]*class=[\"'][^\"']*o[12][^\"']*[\"'][^>]*>(.*?)</tr>"#
        let cellPattern = #"<td[^>]*>(.*?)</td>"#
        guard let rowRegex = try? NSRegularExpression(pattern: rowPattern, options: [.dotMatchesLineSeparators]),
              let cellRegex = try? NSRegularExpression(pattern: cellPattern, options: [.dotMatchesLineSeparators])
        else {
            return []
        }

        let fullRange = NSRange(html.startIndex..<html.endIndex, in: html)
        return rowRegex.matches(in: html, range: fullRange).compactMap { rowMatch in
            guard let contentRange = Range(rowMatch.range(at: 1), in: html) else { return nil }
            let row = String(html[contentRange])
            let cells = cellRegex.matches(in: row, range: NSRange(row.startIndex..<row.endIndex, in: row)).compactMap { match -> String? in
                guard let range = Range(match.range(at: 1), in: row) else { return nil }
                return plainText(String(row[range]))
            }
            guard cells.count > 4,
                  let station = stationsByName[cells[0]],
                  let value = Double(cells[3].replacingOccurrences(of: "]", with: ""))
            else {
                return nil
            }
            return AmedasRankingItem(
                id: station.id,
                name: station.name,
                coordinate: station.coordinate,
                value: value,
                observationTime: normalizedClock(cells[4])
            )
        }
    }

    private static func plainText(_ html: String) -> String {
        html
            .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&#8722;", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizedClock(_ value: String) -> String? {
        guard let match = value.range(of: #"\d{1,2}:\d{2}"#, options: .regularExpression) else { return nil }
        let parts = value[match].split(separator: ":")
        guard parts.count == 2 else { return nil }
        return String(format: "%02d:%02d", Int(parts[0]) ?? 0, Int(parts[1]) ?? 0)
    }
}

enum AmedasSeriesBuilder {
    static func chunkURLs(stationID: String, referenceTime: String) -> [URL] {
        guard let timestamp = AmedasSnapshotBuilder.mapTimestamp(from: referenceTime), timestamp.count >= 10 else {
            return []
        }
        let date = String(timestamp.prefix(8))
        let currentHour = Int(timestamp.dropFirst(8).prefix(2)) ?? 0
        return stride(from: 0, through: (currentHour / 3) * 3, by: 3).map { hour in
            MeteoScopeEndpoints.amedasPointBase
                .appending(path: stationID)
                .appending(path: "\(date)_\(String(format: "%02d", hour)).json")
        }
    }

    static func build(
        stationID: String,
        referenceTime: String,
        metric: AmedasMetric,
        chunks: [[String: AmedasObservationRecord]]
    ) -> AmedasDailySeries {
        let timestamp = AmedasSnapshotBuilder.mapTimestamp(from: referenceTime) ?? ""
        let date = String(timestamp.prefix(8))
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "yyyyMMddHHmmss"

        var valuesByTimestamp: [String: Double] = [:]
        for chunk in chunks {
            for (rawTimestamp, observation) in chunk where rawTimestamp.hasPrefix(date) {
                if let value = observation.values.value(for: metric) {
                    valuesByTimestamp[rawTimestamp] = value
                }
            }
        }
        let points = valuesByTimestamp.compactMap { rawTimestamp, value -> AmedasSeriesPoint? in
            guard let parsed = formatter.date(from: rawTimestamp) else { return nil }
            return AmedasSeriesPoint(timestamp: parsed, value: value)
        }
        .sorted { $0.timestamp < $1.timestamp }

        return AmedasDailySeries(stationID: stationID, metric: metric, date: date, points: points)
    }
}

extension AmedasDailySeries {
    static func preview(metric: AmedasMetric = .temperature) -> AmedasDailySeries {
        let calendar = Calendar(identifier: .gregorian)
        let start = calendar.date(from: DateComponents(year: 2026, month: 7, day: 13)) ?? .now
        let values = [27.4, 28.1, 29.8, 31.4, 30.9, 29.7]
        return AmedasDailySeries(
            stationID: "62078",
            metric: metric,
            date: "20260713",
            points: values.enumerated().map { index, value in
                AmedasSeriesPoint(
                    timestamp: calendar.date(byAdding: .hour, value: index * 3, to: start) ?? start,
                    value: metric == .humidity ? value + 35 : value
                )
            }
        )
    }
}

extension AmedasSnapshot {
    static let preview: AmedasSnapshot = {
        let stations = [
            AmedasStationObservation(
                id: "62078",
                name: "奈良",
                coordinate: GeoCoordinate(latitude: 34.69, longitude: 135.83),
                values: AmedasValues(
                    temperature: 31.4,
                    precipitation: 0,
                    wind: 3.2,
                    humidity: 58,
                    pressure: 1005.8,
                    snow: nil
                )
            ),
            AmedasStationObservation(
                id: "44132",
                name: "東京",
                coordinate: GeoCoordinate(latitude: 35.69, longitude: 139.75),
                values: AmedasValues(
                    temperature: 29.6,
                    precipitation: 0.5,
                    wind: 4.1,
                    humidity: 76,
                    pressure: 1005.5,
                    snow: nil
                )
            )
        ]
        return AmedasSnapshot(
            updatedAt: "2026-07-13T19:00:00+09:00",
            stations: stations,
            dailyPressureMinimum: stations.compactMap { station in
                station.values.pressure.map {
                    AmedasRankingItem(
                        id: station.id,
                        name: station.name,
                        coordinate: station.coordinate,
                        value: $0 - 1.2,
                        observationTime: "15:30"
                    )
                }
            }
        )
    }()
}
