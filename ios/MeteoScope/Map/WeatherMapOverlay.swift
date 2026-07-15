import Foundation

struct WeatherMapOverlay: Hashable, Sendable {
    let id: String
    let points: [WeatherMapPoint]
    let polylines: [WeatherMapPolyline]
    let polygons: [WeatherMapPolygon]
    let geoJSONSources: [WeatherMapGeoJSONSource]

    init(
        id: String,
        points: [WeatherMapPoint] = [],
        polylines: [WeatherMapPolyline] = [],
        polygons: [WeatherMapPolygon] = [],
        geoJSONSources: [WeatherMapGeoJSONSource] = []
    ) {
        self.id = id
        self.points = points
        self.polylines = polylines
        self.polygons = polygons
        self.geoJSONSources = geoJSONSources
    }
}

struct WeatherMapPoint: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case typhoonCenter
        case typhoonForecast
        case earthquakeHypocenter
        case seismicIntensity(String)
    }

    let id: String
    let coordinate: GeoCoordinate
    let title: String
    let subtitle: String
    let kind: Kind
}

struct WeatherMapPolyline: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case typhoonForecast
    }

    let id: String
    let coordinates: [GeoCoordinate]
    let kind: Kind
}

struct WeatherMapPolygon: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case typhoonProbability
        case typhoonStrongWind
        case typhoonStorm
    }

    let id: String
    let coordinates: [GeoCoordinate]
    let kind: Kind
}

struct WeatherMapGeoJSONSource: Identifiable, Hashable, Sendable {
    let id: String
    let url: URL
    let layers: [WeatherMapGeoJSONLayer]
}

struct WeatherMapGeoJSONLayer: Identifiable, Hashable, Sendable {
    enum Geometry: Hashable, Sendable {
        case fill
        case line
    }

    enum Appearance: Hashable, Sendable {
        case warning(WarningSeverity)
        case early(EarlyWarningLevel)
        case river(Int)
        case seismicIntensity(String)
    }

    let id: String
    let propertyName: String
    let values: [String]
    let geometry: Geometry
    let appearance: Appearance
}

enum WeatherMapOverlayBuilder {
    static func warnings(_ snapshot: WarningSnapshot) -> WeatherMapOverlay {
        let layers = WarningSeverity.allMapSeverities.compactMap { severity -> WeatherMapGeoJSONLayer? in
            let codes = snapshot.activeAreas
                .filter { $0.highestSeverity == severity }
                .map(\.areaCode)
            guard !codes.isEmpty else { return nil }
            return WeatherMapGeoJSONLayer(
                id: "warning-\(severity.rawValue)",
                propertyName: "code",
                values: codes,
                geometry: .fill,
                appearance: .warning(severity)
            )
        }
        return WeatherMapOverlay(
            id: "warnings-\(snapshot.updatedAt)-\(snapshot.activeAreas.count)",
            geoJSONSources: layers.isEmpty ? [] : [
                WeatherMapGeoJSONSource(
                    id: "warning-boundaries",
                    url: MeteoScopeEndpoints.warningMunicipalityBoundaries,
                    layers: layers
                )
            ]
        )
    }

    static func earlyWarnings(_ snapshot: EarlyWarningSnapshot) -> WeatherMapOverlay {
        let levels: [EarlyWarningLevel] = [.high, .middle]
        let layers = levels.compactMap { level -> WeatherMapGeoJSONLayer? in
            let names = snapshot.areas.filter { $0.highestLevel == level }.map(\.areaName)
            guard !names.isEmpty else { return nil }
            return WeatherMapGeoJSONLayer(
                id: "early-\(level.rawValue)",
                propertyName: "P",
                values: names,
                geometry: .fill,
                appearance: .early(level)
            )
        }
        return WeatherMapOverlay(
            id: "early-\(snapshot.updatedAt)-\(snapshot.areas.count)",
            geoJSONSources: layers.isEmpty ? [] : [
                WeatherMapGeoJSONSource(
                    id: "prefecture-boundaries",
                    url: MeteoScopeEndpoints.prefectureBoundaries,
                    layers: layers
                )
            ]
        )
    }

    static func rivers(_ snapshot: RiverFloodSnapshot) -> WeatherMapOverlay {
        let active = snapshot.reports.filter { $0.active && !$0.forecastAreaCode.isEmpty }
        let layers = (2...5).compactMap { level -> WeatherMapGeoJSONLayer? in
            let codes = active.filter { $0.level == level }.map(\.forecastAreaCode)
            guard !codes.isEmpty else { return nil }
            return WeatherMapGeoJSONLayer(
                id: "river-\(level)",
                propertyName: "FAREACODE",
                values: codes,
                geometry: .line,
                appearance: .river(level)
            )
        }
        guard let url = riverGeometryURL(codes: active.map(\.forecastAreaCode)), !layers.isEmpty else {
            return WeatherMapOverlay(id: "rivers-\(snapshot.updatedAt)-empty")
        }
        return WeatherMapOverlay(
            id: "rivers-\(snapshot.updatedAt)-\(active.count)",
            geoJSONSources: [WeatherMapGeoJSONSource(id: "river-geometry", url: url, layers: layers)]
        )
    }

    static func typhoon(_ typhoon: TyphoonSummary) -> WeatherMapOverlay {
        var points: [WeatherMapPoint] = []
        var track: [GeoCoordinate] = []
        var polygons: [WeatherMapPolygon] = []

        if let coordinate = typhoon.coordinate {
            points.append(
                WeatherMapPoint(
                    id: "\(typhoon.id)-center",
                    coordinate: coordinate,
                    title: "台風\(typhoon.number)号 \(typhoon.name)",
                    subtitle: "\(typhoon.location)・中心気圧 \(typhoon.pressure)",
                    kind: .typhoonCenter
                )
            )
            track.append(coordinate)
        }

        for forecast in typhoon.forecastPoints where forecast.advancedHours > 0 {
            points.append(
                WeatherMapPoint(
                    id: "\(typhoon.id)-\(forecast.id)",
                    coordinate: forecast.coordinate,
                    title: "\(forecast.advancedHours)時間後予報",
                    subtitle: forecast.validTime,
                    kind: .typhoonForecast
                )
            )
            track.append(forecast.coordinate)
            if let radius = forecast.probabilityCircleRadiusMeters, radius > 0 {
                polygons.append(
                    WeatherMapPolygon(
                        id: "\(typhoon.id)-probability-\(forecast.id)",
                        coordinates: geodesicCircle(center: forecast.coordinate, radiusMeters: radius),
                        kind: .typhoonProbability
                    )
                )
            }
        }

        if let area = typhoon.strongWindArea {
            polygons.append(
                WeatherMapPolygon(
                    id: "\(typhoon.id)-strong-wind",
                    coordinates: geodesicCircle(center: area.center, radiusMeters: area.radiusMeters),
                    kind: .typhoonStrongWind
                )
            )
        }
        if let area = typhoon.stormArea {
            polygons.append(
                WeatherMapPolygon(
                    id: "\(typhoon.id)-storm",
                    coordinates: geodesicCircle(center: area.center, radiusMeters: area.radiusMeters),
                    kind: .typhoonStorm
                )
            )
        }

        let lines = track.count >= 2
            ? [WeatherMapPolyline(id: "\(typhoon.id)-forecast", coordinates: track, kind: .typhoonForecast)]
            : []
        return WeatherMapOverlay(
            id: "typhoon-\(typhoon.id)-\(typhoon.updatedAt)",
            points: points,
            polylines: lines,
            polygons: polygons
        )
    }

    static func earthquake(_ earthquake: EarthquakeSummary) -> WeatherMapOverlay {
        var points: [WeatherMapPoint] = earthquake.intensityPoints
            .sorted {
                SeismicIntensityCatalog.rank($0.intensity) > SeismicIntensityCatalog.rank($1.intensity)
            }
            .prefix(600)
            .compactMap { station -> WeatherMapPoint? in
                guard let coordinate = station.coordinate else { return nil }
                return WeatherMapPoint(
                    id: "station-\(station.stationCode)",
                    coordinate: coordinate,
                    title: station.name,
                    subtitle: station.intensity,
                    kind: .seismicIntensity(station.intensity)
                )
            }

        if let coordinate = earthquake.coordinate {
            points.insert(
                WeatherMapPoint(
                    id: "\(earthquake.id)-hypocenter",
                    coordinate: coordinate,
                    title: earthquake.hypocenterName,
                    subtitle: "\(earthquake.magnitude)・深さ \(earthquake.depth)",
                    kind: .earthquakeHypocenter
                ),
                at: 0
            )
        }

        let intensityLabels = earthquake.intensityAreas.map(\.intensity).uniqued()
        let layers = intensityLabels.compactMap { intensity -> WeatherMapGeoJSONLayer? in
            let codes = earthquake.intensityAreas
                .filter { $0.intensity == intensity }
                .map(\.areaCode)
            guard !codes.isEmpty else { return nil }
            return WeatherMapGeoJSONLayer(
                id: "earthquake-\(intensity.replacingOccurrences(of: "震度", with: ""))",
                propertyName: "code",
                values: codes,
                geometry: .fill,
                appearance: .seismicIntensity(intensity)
            )
        }
        let sources = layers.isEmpty ? [] : [
            WeatherMapGeoJSONSource(
                id: "earthquake-boundaries",
                url: MeteoScopeEndpoints.earthquakeAreaBoundaries,
                layers: layers
            )
        ]

        return WeatherMapOverlay(
            id: "earthquake-\(earthquake.id)-\(earthquake.reportTime)-\(earthquake.intensityPoints.count)",
            points: points,
            geoJSONSources: sources
        )
    }

    private static func riverGeometryURL(codes: [String]) -> URL? {
        let safeCodes = codes.filter { !$0.isEmpty }.uniqued()
        guard !safeCodes.isEmpty else { return nil }
        var components = URLComponents(url: MeteoScopeEndpoints.riverFloodGeometry, resolvingAgainstBaseURL: false)
        let quotedCodes = safeCodes.map { "'\($0.replacingOccurrences(of: "'", with: "''"))'" }.joined(separator: ",")
        components?.queryItems = [
            URLQueryItem(name: "where", value: "FAREACODE IN (\(quotedCodes))"),
            URLQueryItem(name: "outFields", value: "FAREACODE,RIVERNAME"),
            URLQueryItem(name: "returnGeometry", value: "true"),
            URLQueryItem(name: "outSR", value: "4326"),
            URLQueryItem(name: "geometryPrecision", value: "6"),
            URLQueryItem(name: "f", value: "geojson")
        ]
        return components?.url
    }

    private static func geodesicCircle(
        center: GeoCoordinate,
        radiusMeters: Double,
        segments: Int = 72
    ) -> [GeoCoordinate] {
        let earthRadius = 6_371_008.8
        let angularDistance = radiusMeters / earthRadius
        let latitude = center.latitude * .pi / 180
        let longitude = center.longitude * .pi / 180
        return (0...segments).map { index in
            let bearing = 2 * Double.pi * Double(index) / Double(segments)
            let resultLatitude = asin(
                sin(latitude) * cos(angularDistance) +
                    cos(latitude) * sin(angularDistance) * cos(bearing)
            )
            let resultLongitude = longitude + atan2(
                sin(bearing) * sin(angularDistance) * cos(latitude),
                cos(angularDistance) - sin(latitude) * sin(resultLatitude)
            )
            return GeoCoordinate(
                latitude: resultLatitude * 180 / .pi,
                longitude: resultLongitude * 180 / .pi
            )
        }
    }

}

private extension WarningSeverity {
    static let allMapSeverities: [WarningSeverity] = [.emergency, .danger, .warning, .advisory]
}

private extension Sequence where Element: Hashable {
    func uniqued() -> [Element] {
        var seen: Set<Element> = []
        return filter { seen.insert($0).inserted }
    }
}
