import Foundation

enum MeteoScopeEndpoints {
    static let mapStyle = URL(string: "https://demotiles.maplibre.org/style.json")!
    static let radarTimeList = URL(
        string: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"
    )!
    static let publicConfig = URL(
        string: "https://meteoscope.pages.dev/api/public/config"
    )!
    static let iosPushRegister = URL(
        string: "https://meteoscope.pages.dev/api/push/ios/register"
    )!
    static let iosPushUnregister = URL(
        string: "https://meteoscope.pages.dev/api/push/ios/unregister"
    )!
    static let amedasLatestTime = URL(
        string: "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt"
    )!
    static let amedasStationTable = URL(
        string: "https://www.jma.go.jp/bosai/amedas/const/amedastable.json"
    )!
    static let amedasMapBase = URL(
        string: "https://www.jma.go.jp/bosai/amedas/data/map/"
    )!
    static let amedasPointBase = URL(
        string: "https://www.jma.go.jp/bosai/amedas/data/point/"
    )!
    static let amedasDailySurface = URL(
        string: "https://www.data.jma.go.jp/stats/data/mdrr/synopday/data1s.html"
    )!
    static let warningBase = URL(
        string: "https://www.jma.go.jp/bosai/warning/data/r8/"
    )!
    static let earlyWarningProbability = URL(
        string: "https://www.jma.go.jp/bosai/probability/data/probability/r8/map.json"
    )!
    static let areaCatalog = URL(
        string: "https://www.jma.go.jp/bosai/common/const/area.json"
    )!
    static let riverFloodFeeds = [
        URL(string: "https://www.data.jma.go.jp/developer/xml/feed/extra.xml")!,
        URL(string: "https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml")!
    ]
    static let typhoonBase = URL(
        string: "https://www.jma.go.jp/bosai/typhoon/data/"
    )!
    static let typhoonTargets = typhoonBase.appending(path: "targetTc.json")
    static let earthquakeFeeds = [
        URL(string: "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml")!,
        URL(string: "https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml")!
    ]
    static let earthquakeStationCatalog = URL(
        string: "https://meteoscope.pages.dev/data/jma-stations.compact.json"
    )!
    static let warningMunicipalityBoundaries = URL(
        string: "https://meteoscope.pages.dev/data/jma-weather-warning-municipalities.geojson"
    )!
    static let prefectureBoundaries = URL(
        string: "https://meteoscope.pages.dev/data/japan-prefectures.geojson"
    )!
    static let earthquakeAreaBoundaries = URL(
        string: "https://meteoscope.pages.dev/data/earthquake-areas.geojson"
    )!
    static let riverFloodGeometry = URL(
        string: "https://services.arcgis.com/wlVTGRSYTzAbjjiC/ArcGIS/rest/services/flood_risk_all/FeatureServer/0/query"
    )!

    static let warningOfficeCodes = [
        "011000", "012000", "013000", "014100", "014030", "015000", "016000", "017000",
        "020000", "030000", "040000", "050000", "060000", "070000", "080000", "090000",
        "100000", "110000", "120000", "130000", "140000", "150000", "160000", "170000",
        "180000", "190000", "200000", "210000", "220000", "230000", "240000", "250000",
        "260000", "270000", "280000", "290000", "300000", "310000", "320000", "330000",
        "340000", "350000", "360000", "370000", "380000", "390000", "400000", "410000",
        "420000", "430000", "440000", "450000", "460040", "460100", "471000", "472000",
        "473000", "474000"
    ]

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
