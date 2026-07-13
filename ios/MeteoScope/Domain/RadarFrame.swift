import Foundation

struct RadarFrame: Identifiable, Hashable, Sendable {
    let baseTime: String
    let validTime: String
    let member: String
    let isForecast: Bool

    var id: String {
        "\(baseTime)-\(validTime)-\(member)-\(isForecast)"
    }

    var tileURLTemplate: String {
        MeteoScopeEndpoints.radarTileTemplate(
            baseTime: baseTime,
            member: member,
            validTime: validTime
        )
    }

    var displayTime: String {
        guard validTime.count >= 12 else { return validTime }
        let month = validTime.substring(from: 4, length: 2)
        let day = validTime.substring(from: 6, length: 2)
        let hour = validTime.substring(from: 8, length: 2)
        let minute = validTime.substring(from: 10, length: 2)
        return "\(month)/\(day) \(hour):\(minute)"
    }
}

struct RadarTimeRecord: Decodable, Sendable {
    let baseTime: String
    let validTime: String
    let member: String?
    let elements: [String]?

    enum CodingKeys: String, CodingKey {
        case baseTime = "basetime"
        case validTime = "validtime"
        case member
        case elements
    }
}

enum RadarFrameBuilder {
    static let observationFrameCount = 37
    static let forecastFrameCount = 12

    static func build(from records: [RadarTimeRecord]) -> [RadarFrame] {
        let observations = records
            .filter { record in
                record.elements?.contains("hrpns") ?? true
            }
            .sorted { $0.validTime < $1.validTime }
            .suffix(observationFrameCount)
            .map {
                RadarFrame(
                    baseTime: $0.baseTime,
                    validTime: $0.validTime,
                    member: $0.member ?? "none",
                    isForecast: false
                )
            }

        guard let latest = observations.last,
              let latestDate = JMADateCodec.date(from: latest.validTime)
        else {
            return Array(observations)
        }

        let forecasts = (1...forecastFrameCount).compactMap { step -> RadarFrame? in
            guard let date = Calendar.utc.date(byAdding: .minute, value: step * 5, to: latestDate) else {
                return nil
            }
            return RadarFrame(
                baseTime: latest.baseTime,
                validTime: JMADateCodec.string(from: date),
                member: latest.member,
                isForecast: true
            )
        }

        return Array(observations) + forecasts
    }
}

private enum JMADateCodec {
    static func date(from value: String) -> Date? {
        guard value.count >= 12 else { return nil }
        var components = DateComponents()
        components.calendar = .utc
        components.timeZone = TimeZone(secondsFromGMT: 0)
        components.year = Int(value.substring(from: 0, length: 4))
        components.month = Int(value.substring(from: 4, length: 2))
        components.day = Int(value.substring(from: 6, length: 2))
        components.hour = Int(value.substring(from: 8, length: 2))
        components.minute = Int(value.substring(from: 10, length: 2))
        components.second = value.count >= 14 ? Int(value.substring(from: 12, length: 2)) : 0
        return components.date
    }

    static func string(from date: Date) -> String {
        let components = Calendar.utc.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: date
        )
        return String(
            format: "%04d%02d%02d%02d%02d%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0,
            components.hour ?? 0,
            components.minute ?? 0,
            components.second ?? 0
        )
    }
}

private extension Calendar {
    static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }
}

private extension String {
    func substring(from offset: Int, length: Int) -> String {
        let start = index(startIndex, offsetBy: offset)
        let end = index(start, offsetBy: length)
        return String(self[start..<end])
    }
}
