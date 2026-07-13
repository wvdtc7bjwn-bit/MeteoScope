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

            return TyphoonSummary(
                id: target.tropicalCyclone,
                number: title?.typhoonNumber ?? target.typhoonNumber ?? target.tropicalCyclone,
                name: title?.name?.jp ?? title?.name?.en ?? "台風",
                category: current?.category?.jp ?? title?.category?.jp ?? target.category ?? "台風",
                updatedAt: title?.issue?.JST ?? title?.issue?.UTC ?? target.issue ?? "未取得",
                location: current?.location ?? "位置情報なし",
                pressure: valueWithUnit(current?.pressure, unit: "hPa"),
                maximumWind: valueWithUnit(current?.maximumWind?.sustained?.metersPerSecond, unit: "m/s"),
                maximumGust: valueWithUnit(current?.maximumWind?.gust?.metersPerSecond, unit: "m/s"),
                course: current?.course ?? "--",
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
        guard let value, !value.isEmpty, value != "-" else { return "--" }
        return "\(value) \(unit)"
    }

    private static func speedText(_ speed: TyphoonSpeedRecord?) -> String {
        if let value = speed?.kilometersPerHour, !value.isEmpty {
            return "\(value) km/h"
        }
        return speed?.note?.jp ?? speed?.note?.en ?? "--"
    }

    private static func windArea(
        _ record: TyphoonCircularAreaRecord?,
        fallback: GeoCoordinate?
    ) -> TyphoonWindArea? {
        let directCoordinate = coordinate(from: record?.center)
        let arc = record?.arc?.compactMap { item -> (GeoCoordinate, Double)? in
            guard let coordinate = coordinate(from: item.center), let radius = item.radius, radius > 0 else {
                return nil
            }
            return (coordinate, radius)
        }
        .min { left, right in
            distanceSquared(left.0, fallback) < distanceSquared(right.0, fallback)
        }
        let coordinate = directCoordinate ?? arc?.0 ?? fallback
        let radius = record?.radius ?? arc?.1
        guard let coordinate, let radius, radius > 0 else { return nil }
        return TyphoonWindArea(center: coordinate, radiusMeters: radius)
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
