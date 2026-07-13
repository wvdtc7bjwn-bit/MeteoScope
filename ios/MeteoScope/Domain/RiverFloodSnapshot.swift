import Foundation

struct RiverFloodSnapshot: Sendable {
    let updatedAt: String
    let reports: [RiverFloodSummary]
}

struct RiverFloodSummary: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let forecastAreaCode: String
    let forecastAreaName: String
    let riverNames: [String]
    let headline: String
    let updatedAt: String
    let level: Int
    let active: Bool
    let sourceURL: URL

    var levelLabel: String {
        switch level {
        case 5: "レベル5 氾濫特別警報・発生情報"
        case 4: "レベル4 氾濫危険警報"
        case 3: "レベル3 氾濫警報"
        case 2: "レベル2 氾濫注意報"
        default: "指定河川洪水予報"
        }
    }
}

struct RiverFloodFeedEntry: Hashable, Sendable {
    let id: String
    let title: String
    let updated: String
    let url: URL
}

enum RiverFloodXMLDecoder {
    static func feedEntries(data: Data) throws -> [RiverFloodFeedEntry] {
        let root = try XMLTreeDecoder.decode(data: data)
        return root.descendants(named: "entry").compactMap { entry in
            guard let href = entry.children.first(where: { $0.name == "link" })?.attributes["href"],
                  href.range(of: #"_VXKO\d{2}_"#, options: .regularExpression) != nil,
                  let url = URL(string: href)
            else {
                return nil
            }
            return RiverFloodFeedEntry(
                id: entry.firstChild(named: "id")?.text ?? href,
                title: entry.firstChild(named: "title")?.text ?? "指定河川洪水予報",
                updated: entry.firstChild(named: "updated")?.text ?? "",
                url: url
            )
        }
        .sorted { $0.updated > $1.updated }
    }

    static func report(data: Data, entry: RiverFloodFeedEntry) throws -> RiverFloodSummary {
        let root = try XMLTreeDecoder.decode(data: data)
        let title = root.firstDescendant(named: "Title")?.text ?? entry.title
        let headlineNode = root.firstDescendant(named: "Headline")
        let headline = headlineNode?.firstDescendant(named: "Text")?.text ?? ""
        let information = headlineNode?.descendants(named: "Information") ?? []
        let forecastArea = information.first { ($0.attributes["type"] ?? "").contains("予報区域") }?
            .firstDescendant(named: "Area")
        let forecastAreaCode = forecastArea?.firstDescendant(named: "Code")?.text ?? ""
        let forecastAreaName = forecastArea?.firstDescendant(named: "Name")?.text ?? title
        let riverNames = information
            .filter { ($0.attributes["type"] ?? "").contains("河川") }
            .flatMap { $0.descendants(named: "Area") }
            .compactMap { $0.firstDescendant(named: "Name")?.text }
        let updatedAt = root.firstDescendant(named: "ReportDateTime")?.text
            ?? root.firstDescendant(named: "DateTime")?.text
            ?? entry.updated
        let eventID = root.firstDescendant(named: "EventID")?.text ?? entry.id
        let level = warningLevel(in: "\(title) \(headline)")
        let active = !"\(title) \(headline)".contains("解除")

        return RiverFloodSummary(
            id: eventID,
            title: title,
            forecastAreaCode: forecastAreaCode,
            forecastAreaName: forecastAreaName,
            riverNames: Array(Set(riverNames)).sorted(),
            headline: headline,
            updatedAt: updatedAt,
            level: level,
            active: active,
            sourceURL: entry.url
        )
    }

    private static func warningLevel(in value: String) -> Int {
        if value.range(of: #"レベル\s*5|氾濫(?:特別警報|発生情報)"#, options: .regularExpression) != nil { return 5 }
        if value.range(of: #"レベル\s*4|氾濫危険"#, options: .regularExpression) != nil { return 4 }
        if value.range(of: #"レベル\s*3|氾濫警報"#, options: .regularExpression) != nil { return 3 }
        if value.range(of: #"レベル\s*2|氾濫注意"#, options: .regularExpression) != nil { return 2 }
        return 0
    }
}

extension RiverFloodSnapshot {
    static let preview = RiverFloodSnapshot(
        updatedAt: "2026-07-13T18:00:00+09:00",
        reports: [
            RiverFloodSummary(
                id: "preview-river",
                title: "大和川上流氾濫注意情報",
                forecastAreaCode: "860604000001",
                forecastAreaName: "大和川上流",
                riverNames: ["大和川"],
                headline: "今後の水位上昇に注意してください。",
                updatedAt: "2026-07-13T18:00:00+09:00",
                level: 2,
                active: true,
                sourceURL: URL(string: "https://www.jma.go.jp/")!
            )
        ]
    )
}
