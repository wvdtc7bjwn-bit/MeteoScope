import Foundation

struct TyphoonSnapshot: Sendable {
    let updatedAt: String
    let typhoons: [TyphoonSummary]
}

struct TyphoonSummary: Identifiable, Hashable, Sendable {
    let id: String
    let number: String
    let name: String
    let category: String
    let transitionStatus: String?
    let updatedAt: String
    let location: String
    let pressure: String
    let maximumWind: String
    let maximumGust: String
    let course: String
    let speed: String
    let coordinate: GeoCoordinate?
    let forecastPoints: [TyphoonForecastPoint]
    let strongWindArea: TyphoonWindArea?
    let stormArea: TyphoonWindArea?

    var movement: String {
        let parts = [course, speed].filter {
            let value = $0.trimmingCharacters(in: .whitespacesAndNewlines)
            return !value.isEmpty && !["-", "--", "未取得", "取得中"].contains(value)
        }
        return parts.isEmpty ? "-" : parts.joined(separator: " ")
    }
}

struct TyphoonForecastPoint: Identifiable, Hashable, Sendable {
    let advancedHours: Int
    let validTime: String
    let coordinate: GeoCoordinate
    let probabilityCircleRadiusMeters: Double?

    var id: String { "\(advancedHours)-\(validTime)" }
}

struct TyphoonTargetRecord: Decodable, Sendable {
    let tropicalCyclone: String
    let typhoonNumber: String?
    let category: String?
    let issue: String?
}

struct TyphoonForecastRecord: Decodable, Sendable {
    let advancedHours: Int?
    let validtime: TyphoonTimeRecord?
    let center: [Double]?
    let probabilityCircle: TyphoonProbabilityCircleRecord?
    let galeWarningArea: TyphoonCircularAreaRecord?
    let stormWarningArea: TyphoonCircularAreaRecord?
}

struct TyphoonCircularAreaRecord: Decodable, Sendable {
    let center: [Double]?
    let radius: Double?
    let arc: [TyphoonStormArcRecord]?
}

struct TyphoonStormArcRecord: Decodable, Sendable {
    let center: [Double]?
    let radius: Double?

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        center = try? container.decode([Double].self)
        radius = try? container.decode(Double.self)
    }
}

struct TyphoonWindArea: Hashable, Sendable {
    let center: GeoCoordinate
    let radiusMeters: Double
}

struct TyphoonProbabilityCircleRecord: Decodable, Sendable {
    let radius: Double?
}

struct TyphoonTimeRecord: Decodable, Sendable {
    let JST: String?
    let UTC: String?
}

struct TyphoonSpecificationRecord: Decodable, Sendable {
    let advancedHours: Int?
    let typhoonNumber: String?
    let name: TyphoonLocalizedText?
    let category: TyphoonLocalizedText?
    let location: String?
    let course: String?
    let pressure: String?
    let speed: TyphoonSpeedRecord?
    let maximumWind: TyphoonMaximumWindRecord?
    let position: TyphoonPositionRecord?
    let validtime: TyphoonTimeRecord?
    let issue: TyphoonTimeRecord?
}

struct TyphoonLocalizedText: Decodable, Sendable {
    let jp: String?
    let en: String?
}

struct TyphoonSpeedRecord: Decodable, Sendable {
    let kilometersPerHour: String?
    let note: TyphoonLocalizedText?

    enum CodingKeys: String, CodingKey {
        case kilometersPerHour = "km/h"
        case note
    }
}

struct TyphoonMaximumWindRecord: Decodable, Sendable {
    let sustained: TyphoonWindRecord?
    let gust: TyphoonWindRecord?
}

struct TyphoonWindRecord: Decodable, Sendable {
    let metersPerSecond: String?

    enum CodingKeys: String, CodingKey {
        case metersPerSecond = "m/s"
    }
}

struct TyphoonPositionRecord: Decodable, Sendable {
    let deg: [Double]?
}

enum TyphoonSnapshotBuilder {
    static func build(
        targets: [TyphoonTargetRecord],
        forecasts: [String: [TyphoonForecastRecord]],
        specifications: [String: [TyphoonSpecificationRecord]]
    ) -> TyphoonSnapshot {
        let summaries = targets.map { target in
            let specs = specifications[target.tropicalCyclone] ?? []
            let forecastRecords = forecasts[target.tropicalCyclone] ?? []
            let title = specs.first { $0.name != nil || $0.typhoonNumber != nil }
            let current = specs.first { $0.advancedHours == 0 } ?? specs.first
            let currentForecast = forecastRecords.first { $0.advancedHours == 0 } ?? forecastRecords.first
            let points = forecastRecords.compactMap { record -> TyphoonForecastPoint? in
                guard let hours = record.advancedHours,
                      let center = record.center,
                      center.count >= 2
                else {
                    return nil
                }
                return TyphoonForecastPoint(
                    advancedHours: hours,
                    validTime: record.validtime?.JST ?? record.validtime?.UTC ?? "",
                    coordinate: GeoCoordinate(latitude: center[0], longitude: center[1]),
                    probabilityCircleRadiusMeters: record.probabilityCircle?.radius
                )
            }
            let position = current?.position?.deg
            let coordinate = position.flatMap { values -> GeoCoordinate? in
                guard values.count >= 2 else { return nil }
                return GeoCoordinate(latitude: values[0], longitude: values[1])
            } ?? points.first(where: { $0.advancedHours == 0 })?.coordinate
            let number = title?.typhoonNumber ?? target.typhoonNumber ?? target.tropicalCyclone
            let category = current?.category?.jp
                ?? current?.category?.en
                ?? title?.category?.jp
                ?? title?.category?.en
                ?? target.category
                ?? "台風"

            return TyphoonSummary(
                id: target.tropicalCyclone,
                number: number,
                name: title?.name?.jp ?? title?.name?.en ?? "台風",
                category: category,
                transitionStatus: transitionMessage(
                    category: category,
                    number: title?.typhoonNumber ?? target.typhoonNumber
                ),
                updatedAt: title?.issue?.JST ?? title?.issue?.UTC ?? target.issue ?? "-",
                location: current?.location ?? "-",
                pressure: valueWithUnit(current?.pressure, unit: "hPa"),
                maximumWind: valueWithUnit(current?.maximumWind?.sustained?.metersPerSecond, unit: "m/s"),
                maximumGust: valueWithUnit(current?.maximumWind?.gust?.metersPerSecond, unit: "m/s"),
                course: current?.course ?? "-",
                speed: speedText(current?.speed),
                coordinate: coordinate,
                forecastPoints: points.sorted { $0.advancedHours < $1.advancedHours },
                strongWindArea: windArea(currentForecast?.galeWarningArea, fallback: coordinate),
                stormArea: windArea(currentForecast?.stormWarningArea, fallback: coordinate)
            )
        }

        return TyphoonSnapshot(
            updatedAt: summaries.map(\.updatedAt).max() ?? "発表なし",
            typhoons: summaries
        )
    }

    private static func valueWithUnit(_ value: String?, unit: String) -> String {
        guard let value, !value.isEmpty, value != "-" else { return "-" }
        return "\(value) \(unit)"
    }

    private static func speedText(_ speed: TyphoonSpeedRecord?) -> String {
        if let value = speed?.kilometersPerHour, !value.isEmpty {
            return "\(value) km/h"
        }
        return speed?.note?.jp ?? speed?.note?.en ?? "-"
    }

    private static func transitionMessage(category: String, number: String?) -> String? {
        let normalizedCategory = category.uppercased()
        let changedTo: String?
        if normalizedCategory.contains("温帯低気圧")
            || normalizedCategory.contains("EXTRATROPICAL")
            || ["EX", "ET"].contains(normalizedCategory) {
            changedTo = "温帯低気圧"
        } else if normalizedCategory.contains("熱帯低気圧")
            || normalizedCategory.contains("TROPICAL DEPRESSION")
            || normalizedCategory == "TD" {
            changedTo = "熱帯低気圧"
        } else {
            changedTo = nil
        }
        guard let changedTo else { return nil }
        guard let number = normalizedTyphoonNumber(number) else {
            return "\(changedTo)に変わりました"
        }
        return "台風\(number)号は\(changedTo)に変わりました"
    }

    private static func normalizedTyphoonNumber(_ value: String?) -> String? {
        guard let value else { return nil }
        let groups = value.split(whereSeparator: { !$0.isNumber })
        guard var digits = groups.last.map(String.init), !digits.isEmpty else { return nil }
        if digits.count >= 4 {
            digits = String(digits.suffix(2))
        }
        guard let number = Int(digits), number > 0 else { return nil }
        return String(number)
    }

    private static func windArea(
        _ record: TyphoonCircularAreaRecord?,
        fallback: GeoCoordinate?
    ) -> TyphoonWindArea? {
        let directCoordinate = Self.coordinate(from: record?.center)
        let arc = record?.arc?.compactMap { item -> (GeoCoordinate, Double)? in
            guard let itemCoordinate = Self.coordinate(from: item.center),
                  let radius = item.radius,
                  radius > 0
            else {
                return nil
            }
            return (itemCoordinate, radius)
        }
        .min { left, right in
            distanceSquared(left.0, fallback) < distanceSquared(right.0, fallback)
        }
        let selectedCoordinate = directCoordinate ?? arc?.0 ?? fallback
        let radius = record?.radius ?? arc?.1
        guard let selectedCoordinate, let radius, radius > 0 else { return nil }
        return TyphoonWindArea(center: selectedCoordinate, radiusMeters: radius)
    }

    private static func coordinate(from values: [Double]?) -> GeoCoordinate? {
        values.flatMap { values -> GeoCoordinate? in
            guard values.count >= 2 else { return nil }
            return GeoCoordinate(latitude: values[0], longitude: values[1])
        }
    }

    private static func distanceSquared(_ coordinate: GeoCoordinate, _ target: GeoCoordinate?) -> Double {
        guard let target else { return 0 }
        let latitude = coordinate.latitude - target.latitude
        let longitude = coordinate.longitude - target.longitude
        return latitude * latitude + longitude * longitude
    }
}

extension TyphoonSnapshot {
    static let preview = TyphoonSnapshot(
        updatedAt: "2026-07-13T19:10:00+09:00",
        typhoons: [
            TyphoonSummary(
                id: "TC2612",
                number: "11",
                name: "ハイシェン",
                category: "台風",
                transitionStatus: nil,
                updatedAt: "2026-07-13T19:10:00+09:00",
                location: "フィリピンの東",
                pressure: "1002 hPa",
                maximumWind: "18 m/s",
                maximumGust: "25 m/s",
                course: "北西",
                speed: "ゆっくり",
                coordinate: GeoCoordinate(latitude: 11.8, longitude: 136.3),
                forecastPoints: [
                    TyphoonForecastPoint(
                        advancedHours: 24,
                        validTime: "2026-07-14T18:00:00+09:00",
                        coordinate: GeoCoordinate(latitude: 13.9, longitude: 134.9),
                        probabilityCircleRadiusMeters: 105_564
                    )
                ],
                strongWindArea: TyphoonWindArea(
                    center: GeoCoordinate(latitude: 11.8, longitude: 136.3),
                    radiusMeters: 444_480
                ),
                stormArea: nil
            )
        ]
    )
}
