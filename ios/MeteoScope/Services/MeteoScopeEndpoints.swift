import Foundation

enum MeteoScopeEndpoints {
    static let mapStyle = URL(string: "https://meteoscope.pages.dev/map-style.json")!
    static let privacyPolicy = URL(string: "https://meteoscope.pages.dev/privacy.html")!
    static let termsOfUse = URL(string: "https://meteoscope.pages.dev/terms.html")!
    static let support = URL(string: "https://meteoscope.pages.dev/support.html")!
    static let quizAPI = URL(string: "https://meteoscope.pages.dev/api/quiz")!
    static let jmaOfficial = URL(string: "https://www.jma.go.jp/bosai/")!
    static let jmaTsunamiInformation = URL(
        string: "https://www.jma.go.jp/bosai/map.html#contents=tsunami"
    )!
    static let jmaTerms = URL(string: "https://www.jma.go.jp/jma/kishou/info/coment.html")!
    static let jmaDataPortal = URL(string: "https://www.data.jma.go.jp/developer/index.html")!
    static let gsiTiles = URL(string: "https://maps.gsi.go.jp/development/ichiran.html")!
    static let jshisMajorFaultAPI = URL(
        string: "https://www.j-shis.bosai.go.jp/api-vectortile-majorfault"
    )!
    static let jshisTerms = URL(string: "https://www.j-shis.bosai.go.jp/agreement")!
    static let jshisMajorFaultTileTemplate =
        "https://www.j-shis.bosai.go.jp/map/xyz/major_fault/Y2022/MAX/{z}/{x}/{y}.mvt?lang=ja"
    static let plateBoundaryGeoJSON = URL(
        string: "https://meteoscope.pages.dev/data/usgs-plate-boundaries-japan.geojson"
    )!
    static let plateDepthContourGeoJSON = URL(
        string: "https://meteoscope.pages.dev/data/usgs-slab2-depth-contours-japan.geojson"
    )!
    static let plateDepthSurfaceGeoJSON = URL(
        string: "https://meteoscope.pages.dev/data/usgs-slab2-surface-japan.geojson?v=20260720-7"
    )!
    static let usgsPlateBoundarySource = URL(
        string: "https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer"
    )!
    static let usgsSlab2Source = URL(
        string: "https://www.usgs.gov/data/slab2-a-comprehensive-subduction-zone-geometry-model"
    )!
    static let usgsCopyright = URL(
        string: "https://www.usgs.gov/faqs/are-usgs-reportspublications-copyrighted"
    )!
    static let radarTimeList = URL(
        string: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"
    )!
    static let publicConfig = URL(
        string: "https://meteoscope.pages.dev/api/public/config"
    )!
    static let iosPushConfig = URL(
        string: "https://meteoscope.pages.dev/api/push/ios/config"
    )!
    static let iosPushRegister = URL(
        string: "https://meteoscope.pages.dev/api/push/ios/register"
    )!
    static let iosPushUnregister = URL(
        string: "https://meteoscope.pages.dev/api/push/ios/unregister"
    )!
    static let communityReports = URL(
        string: "https://meteoscope.pages.dev/api/community/reports"
    )!
    static let earlyAccess = URL(
        string: "https://meteoscope.pages.dev/api/public/early-access"
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
    static let volcanoStatus = URL(
        string: "https://www.jma.go.jp/bosai/volcano/data/info/900.json"
    )!
    static let volcanoCatalog = URL(
        string: "https://www.jma.go.jp/bosai/volcano/const/volcano_list.json"
    )!
    static let jmaVolcanoInformation = URL(
        string: "https://www.jma.go.jp/bosai/volcano/"
    )!
    private static let earthquakeAPIBase = URL(
        string: "https://meteoscope.pages.dev/api/earthquakes"
    )!
    static func hypocenterDistribution(
        dayOffset: Int,
        minMagnitude: String,
        maxDepth: String
    ) -> URL {
        var components = URLComponents(
            url: earthquakeAPIBase.appending(path: "distribution"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "dayOffset", value: String(dayOffset)),
            URLQueryItem(name: "minMagnitude", value: minMagnitude),
            URLQueryItem(name: "maxDepth", value: maxDepth)
        ]
        return components.url!
    }
    static let earthquakeStationCatalog = URL(
        string: "https://meteoscope.pages.dev/data/jma-intensity-stations.json"
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
    static let tsunamiForecastAreaBoundaries = URL(
        string: "https://meteoscope.pages.dev/data/jma-tsunami-forecast-areas.geojson"
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
