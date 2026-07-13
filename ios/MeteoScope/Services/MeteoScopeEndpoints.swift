import Foundation

enum MeteoScopeEndpoints {
    static let mapStyle = URL(string: "https://demotiles.maplibre.org/style.json")!
    static let radarTimeList = URL(
        string: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"
    )!
    static let publicConfig = URL(
        string: "https://meteoscope.pages.dev/api/public/config"
    )!

    static func radarTileTemplate(
        baseTime: String,
        member: String,
        validTime: String
    ) -> String {
        "https://www.jma.go.jp/bosai/jmatile/data/nowc/\(baseTime)/\(member)/\(validTime)/surf/hrpns/{z}/{x}/{y}.png"
    }
}

enum MeteoScopeIntervals {
    static let automaticRefresh: Duration = .seconds(5 * 60)
}
