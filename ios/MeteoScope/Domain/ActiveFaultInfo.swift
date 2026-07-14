import Foundation

struct ActiveFaultInfo: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let magnitude: String
    let thirtyYearProbability: String

    init?(attributes: [String: Any]) {
        let name = Self.stringValue(attributes["LTENAME"])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }

        self.id = Self.stringValue(attributes["FLT_ID"]).nonEmpty ?? name
        self.name = name
        self.magnitude = Self.formatMagnitude(attributes["MAG"])
        self.thirtyYearProbability = Self.formatProbability(attributes["MAX_T30P"])
    }

    var breakableName: String {
        name
            .replacingOccurrences(of: "（", with: "\u{200B}（")
            .replacingOccurrences(of: "(", with: "\u{200B}(")
    }

    private static func formatMagnitude(_ value: Any?) -> String {
        guard let magnitude = doubleValue(value), magnitude > -900 else { return "--" }
        return String(format: "%@ %.1f", magnitude < 0 ? "Mw" : "M", abs(magnitude))
    }

    private static func formatProbability(_ value: Any?) -> String {
        guard let probability = doubleValue(value), probability >= 0 else { return "--" }
        let percent = probability <= 1 ? probability * 100 : probability
        if percent == 0 { return "0%" }
        if percent < 0.001 { return "0.001%未満" }
        let digits = percent < 0.1 ? 3 : percent < 1 ? 2 : 1
        var formatted = String(format: "%.*f", digits, percent)
        while formatted.last == "0" { formatted.removeLast() }
        if formatted.last == "." { formatted.removeLast() }
        return "\(formatted)%"
    }

    private static func doubleValue(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        return Double(stringValue(value))
    }

    private static func stringValue(_ value: Any?) -> String {
        guard let value else { return "" }
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        default:
            return String(describing: value)
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
