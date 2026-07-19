import CoreLocation
import MapLibre
import SwiftUI
import UIKit

struct WeatherMapView: UIViewRepresentable {
    let radarFrame: RadarFrame?
    let userCoordinate: CLLocationCoordinate2D?
    let weatherOverlay: WeatherMapOverlay?
    let showsActiveFaults: Bool
    let showsPlateBoundaries: Bool
    let showsPlateDepthContours: Bool
    @Binding var selectedActiveFault: ActiveFaultInfo?

    func makeCoordinator() -> Coordinator {
        Coordinator(selectedActiveFault: $selectedActiveFault)
    }

    func makeUIView(context: Context) -> MLNMapView {
        let mapView = MLNMapView(frame: .zero, styleURL: MeteoScopeEndpoints.mapStyle)
        mapView.delegate = context.coordinator
        mapView.setCenter(
            CLLocationCoordinate2D(latitude: 37.6, longitude: 137.8),
            zoomLevel: 4.2,
            animated: false
        )
        context.coordinator.mapView = mapView
        context.coordinator.requestedFrame = radarFrame
        context.coordinator.requestedUserCoordinate = userCoordinate
        context.coordinator.requestedWeatherOverlay = weatherOverlay
        context.coordinator.requestedShowsActiveFaults = showsActiveFaults
        context.coordinator.requestedShowsPlateBoundaries = showsPlateBoundaries
        context.coordinator.requestedShowsPlateDepthContours = showsPlateDepthContours
        let activeFaultTap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleActiveFaultTap(_:))
        )
        activeFaultTap.cancelsTouchesInView = false
        activeFaultTap.delegate = context.coordinator
        mapView.addGestureRecognizer(activeFaultTap)
        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {
        context.coordinator.requestedFrame = radarFrame
        context.coordinator.requestedUserCoordinate = userCoordinate
        context.coordinator.requestedWeatherOverlay = weatherOverlay
        context.coordinator.requestedShowsActiveFaults = showsActiveFaults
        context.coordinator.requestedShowsPlateBoundaries = showsPlateBoundaries
        context.coordinator.requestedShowsPlateDepthContours = showsPlateDepthContours
        context.coordinator.applyRadarLayerIfPossible()
        context.coordinator.applyUserLocationIfNeeded()
        context.coordinator.applyPlateDepthContourLayerIfPossible()
        context.coordinator.applyPlateBoundaryLayerIfPossible()
        context.coordinator.applyActiveFaultLayerIfPossible()
        context.coordinator.applyWeatherOverlayIfNeeded()
    }

    final class Coordinator: NSObject, MLNMapViewDelegate, UIGestureRecognizerDelegate {
        private let sourceIdentifier = "meteoscope-radar-source"
        private let layerIdentifier = "meteoscope-radar-layer"
        private let activeFaultSourceIdentifier = "meteoscope-jshis-major-fault-source"
        private let activeFaultFillLayerIdentifier = "meteoscope-jshis-major-fault-fill"
        private let activeFaultLineLayerIdentifier = "meteoscope-jshis-major-fault-line"
        private let plateBoundarySourceIdentifier = "meteoscope-usgs-plate-boundaries-source"
        private let plateBoundaryLayerIdentifiers = [
            "meteoscope-usgs-plate-boundary-convergent",
            "meteoscope-usgs-plate-boundary-transform",
            "meteoscope-usgs-plate-boundary-other"
        ]
        private let plateDepthContourSourceIdentifier = "meteoscope-usgs-slab2-depth-source"
        private let plateDepthContourLineIdentifier = "meteoscope-usgs-slab2-depth-line"
        private let plateDepthContourLabelIdentifier = "meteoscope-usgs-slab2-depth-label"

        weak var mapView: MLNMapView?
        var requestedFrame: RadarFrame?
        var requestedUserCoordinate: CLLocationCoordinate2D?
        var requestedWeatherOverlay: WeatherMapOverlay?
        var requestedShowsActiveFaults = false
        var requestedShowsPlateBoundaries = false
        var requestedShowsPlateDepthContours = false
        private var renderedFrameID: RadarFrame.ID?
        private var renderedUserCoordinate: CLLocationCoordinate2D?
        private var userAnnotation: MLNPointAnnotation?
        private var renderedOverlayID: String?
        private var weatherAnnotations: [MLNAnnotation] = []
        private var polygonKinds: [ObjectIdentifier: WeatherMapPolygon.Kind] = [:]
        private var weatherSourceIdentifiers: [String] = []
        private var weatherLayerIdentifiers: [String] = []
        private let selectedActiveFault: Binding<ActiveFaultInfo?>

        init(selectedActiveFault: Binding<ActiveFaultInfo?>) {
            self.selectedActiveFault = selectedActiveFault
        }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            renderedFrameID = nil
            renderedOverlayID = nil
            weatherSourceIdentifiers = []
            weatherLayerIdentifiers = []
            applyRadarLayerIfPossible()
            applyUserLocationIfNeeded()
            applyPlateDepthContourLayerIfPossible()
            applyPlateBoundaryLayerIfPossible()
            applyActiveFaultLayerIfPossible()
            applyWeatherOverlayIfNeeded()
        }

        func applyRadarLayerIfPossible() {
            guard let mapView, let style = mapView.style else { return }
            guard renderedFrameID != requestedFrame?.id else { return }

            if let layer = style.layer(withIdentifier: layerIdentifier) {
                style.removeLayer(layer)
            }
            if let source = style.source(withIdentifier: sourceIdentifier) {
                style.removeSource(source)
            }

            guard let requestedFrame else {
                renderedFrameID = nil
                return
            }

            let source = MLNRasterTileSource(
                identifier: sourceIdentifier,
                tileURLTemplates: [requestedFrame.tileURLTemplate],
                options: [.tileSize: 256]
            )
            let layer = MLNRasterStyleLayer(identifier: layerIdentifier, source: source)
            layer.rasterOpacity = NSExpression(forConstantValue: 0.78)
            style.addSource(source)
            style.addLayer(layer)
            renderedFrameID = requestedFrame.id
        }

        func applyActiveFaultLayerIfPossible() {
            guard let style = mapView?.style else { return }
            guard requestedShowsActiveFaults else {
                removeActiveFaultLayers(from: style)
                selectedActiveFault.wrappedValue = nil
                return
            }
            guard style.source(withIdentifier: activeFaultSourceIdentifier) == nil else { return }

            let attribution = MLNAttributionInfo(
                title: NSAttributedString(string: "J-SHIS（防災科研）"),
                url: MeteoScopeEndpoints.jshisMajorFaultAPI
            )
            let source = MLNVectorTileSource(
                identifier: activeFaultSourceIdentifier,
                tileURLTemplates: [MeteoScopeEndpoints.jshisMajorFaultTileTemplate],
                options: [
                    .minimumZoomLevel: 4,
                    .maximumZoomLevel: 10,
                    .attributionInfos: [attribution]
                ]
            )
            style.addSource(source)

            let fillLayer = MLNFillStyleLayer(identifier: activeFaultFillLayerIdentifier, source: source)
            fillLayer.sourceLayerIdentifier = "major_fault"
            fillLayer.minimumZoomLevel = 4
            fillLayer.maximumZoomLevel = 11
            fillLayer.fillColor = NSExpression(forConstantValue: UIColor.systemOrange)
            fillLayer.fillOpacity = NSExpression(forConstantValue: 0.18)
            style.addLayer(fillLayer)

            let lineLayer = MLNLineStyleLayer(identifier: activeFaultLineLayerIdentifier, source: source)
            lineLayer.sourceLayerIdentifier = "major_fault"
            lineLayer.minimumZoomLevel = 4
            lineLayer.maximumZoomLevel = 11
            lineLayer.lineColor = NSExpression(forConstantValue: UIColor.systemOrange)
            lineLayer.lineOpacity = NSExpression(forConstantValue: 0.9)
            lineLayer.lineWidth = NSExpression(forConstantValue: 2)
            style.addLayer(lineLayer)
        }

        @objc func handleActiveFaultTap(_ recognizer: UITapGestureRecognizer) {
            guard recognizer.state == .ended, let mapView else { return }
            guard requestedShowsActiveFaults, (4..<11).contains(mapView.zoomLevel) else {
                selectedActiveFault.wrappedValue = nil
                return
            }
            let layerIdentifiers = Set([activeFaultFillLayerIdentifier, activeFaultLineLayerIdentifier])
            let point = recognizer.location(in: mapView)
            guard let feature = mapView.visibleFeatures(
                at: point,
                styleLayerIdentifiers: layerIdentifiers
            ).first,
                  let info = ActiveFaultInfo(attributes: feature.attributes)
            else {
                selectedActiveFault.wrappedValue = nil
                return
            }
            selectedActiveFault.wrappedValue = info
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }

        private func removeActiveFaultLayers(from style: MLNStyle) {
            for identifier in [activeFaultLineLayerIdentifier, activeFaultFillLayerIdentifier] {
                if let layer = style.layer(withIdentifier: identifier) { style.removeLayer(layer) }
            }
            if let source = style.source(withIdentifier: activeFaultSourceIdentifier) {
                style.removeSource(source)
            }
        }

        func applyPlateDepthContourLayerIfPossible() {
            guard let style = mapView?.style else { return }
            guard requestedShowsPlateDepthContours else {
                removePlateDepthContourLayers(from: style)
                return
            }
            guard style.source(withIdentifier: plateDepthContourSourceIdentifier) == nil else { return }

            let source = MLNShapeSource(
                identifier: plateDepthContourSourceIdentifier,
                url: MeteoScopeEndpoints.plateDepthContourGeoJSON,
                options: nil
            )
            style.addSource(source)

            let depthStops: [NSNumber: UIColor] = [
                0: UIColor(red: 0.94, green: 0.21, blue: 0.17, alpha: 1),
                30: UIColor(red: 1.00, green: 0.85, blue: 0.28, alpha: 1),
                100: UIColor(red: 0.29, green: 0.88, blue: 0.36, alpha: 1),
                300: UIColor(red: 0.27, green: 0.83, blue: 0.93, alpha: 1),
                700: UIColor(red: 0.11, green: 0.27, blue: 0.82, alpha: 1)
            ]
            let depthColor = NSExpression(
                format: "mgl_interpolate:withCurveType:parameters:stops:(depthKm, 'linear', nil, %@)",
                depthStops as NSDictionary
            )

            let lineLayer = MLNLineStyleLayer(identifier: plateDepthContourLineIdentifier, source: source)
            lineLayer.minimumZoomLevel = 3
            lineLayer.maximumZoomLevel = 12
            lineLayer.lineColor = depthColor
            lineLayer.lineOpacity = NSExpression(forConstantValue: 0.72)
            lineLayer.lineWidth = NSExpression(
                format: "mgl_interpolate:withCurveType:parameters:stops:($zoomLevel, 'linear', nil, %@)",
                [3: 0.7, 7: 1.2, 11: 1.8] as NSDictionary
            )
            style.addLayer(lineLayer)

            let labelLayer = MLNSymbolStyleLayer(identifier: plateDepthContourLabelIdentifier, source: source)
            labelLayer.minimumZoomLevel = 5
            labelLayer.maximumZoomLevel = 12
            labelLayer.symbolPlacement = NSExpression(forConstantValue: "line")
            labelLayer.symbolSpacing = NSExpression(forConstantValue: 260)
            labelLayer.text = NSExpression(forKeyPath: "label")
            labelLayer.textFontSize = NSExpression(forConstantValue: 10)
            labelLayer.textOffset = NSExpression(
                forConstantValue: NSValue(cgVector: CGVector(dx: 0, dy: -0.72))
            )
            labelLayer.textColor = depthColor
            labelLayer.textHaloColor = NSExpression(
                forConstantValue: UIColor { traits in
                    traits.userInterfaceStyle == .dark
                        ? UIColor(red: 0.03, green: 0.07, blue: 0.14, alpha: 0.9)
                        : UIColor(red: 0.96, green: 0.98, blue: 1, alpha: 0.92)
                }
            )
            labelLayer.textHaloWidth = NSExpression(forConstantValue: 1)
            labelLayer.textAllowsOverlap = NSExpression(forConstantValue: false)
            labelLayer.keepsTextUpright = NSExpression(forConstantValue: true)
            style.addLayer(labelLayer)
        }

        private func removePlateDepthContourLayers(from style: MLNStyle) {
            for identifier in [plateDepthContourLabelIdentifier, plateDepthContourLineIdentifier] {
                if let layer = style.layer(withIdentifier: identifier) { style.removeLayer(layer) }
            }
            if let source = style.source(withIdentifier: plateDepthContourSourceIdentifier) {
                style.removeSource(source)
            }
        }

        func applyPlateBoundaryLayerIfPossible() {
            guard let style = mapView?.style else { return }
            guard requestedShowsPlateBoundaries else {
                removePlateBoundaryLayers(from: style)
                return
            }
            guard style.source(withIdentifier: plateBoundarySourceIdentifier) == nil else { return }

            let source = MLNShapeSource(
                identifier: plateBoundarySourceIdentifier,
                url: MeteoScopeEndpoints.plateBoundaryGeoJSON,
                options: nil
            )
            style.addSource(source)

            let definitions: [(label: String, color: UIColor, dash: [NSNumber]?)] = [
                ("Convergent Boundary", UIColor(red: 0.88, green: 0.24, blue: 0.21, alpha: 1), nil),
                ("Transform Boundary", UIColor(red: 0.52, green: 0.35, blue: 0.75, alpha: 1), [2.5, 1.5]),
                ("Other", UIColor(red: 0.10, green: 0.57, blue: 0.50, alpha: 1), [1, 1.5])
            ]
            for (index, definition) in definitions.enumerated() {
                let layer = MLNLineStyleLayer(
                    identifier: plateBoundaryLayerIdentifiers[index],
                    source: source
                )
                layer.minimumZoomLevel = 3
                layer.maximumZoomLevel = 11
                layer.predicate = NSPredicate(format: "LABEL == %@", definition.label)
                layer.lineColor = NSExpression(forConstantValue: definition.color)
                layer.lineOpacity = NSExpression(forConstantValue: 0.86)
                layer.lineWidth = NSExpression(forConstantValue: 2.2)
                if let dash = definition.dash {
                    layer.lineDashPattern = NSExpression(forConstantValue: dash)
                }
                style.addLayer(layer)
            }
        }

        private func removePlateBoundaryLayers(from style: MLNStyle) {
            for identifier in plateBoundaryLayerIdentifiers.reversed() {
                if let layer = style.layer(withIdentifier: identifier) { style.removeLayer(layer) }
            }
            if let source = style.source(withIdentifier: plateBoundarySourceIdentifier) {
                style.removeSource(source)
            }
        }

        func applyUserLocationIfNeeded() {
            guard let mapView else { return }
            guard !coordinatesMatch(renderedUserCoordinate, requestedUserCoordinate) else { return }

            if let userAnnotation {
                mapView.removeAnnotation(userAnnotation)
                self.userAnnotation = nil
            }

            guard let requestedUserCoordinate else {
                renderedUserCoordinate = nil
                return
            }

            let annotation = MLNPointAnnotation()
            annotation.coordinate = requestedUserCoordinate
            annotation.title = "現在地"
            mapView.addAnnotation(annotation)
            mapView.setCenter(requestedUserCoordinate, zoomLevel: max(mapView.zoomLevel, 7), animated: true)
            userAnnotation = annotation
            renderedUserCoordinate = requestedUserCoordinate
        }

        func applyWeatherOverlayIfNeeded() {
            guard let mapView, let style = mapView.style else { return }
            guard renderedOverlayID != requestedWeatherOverlay?.id else { return }

            if !weatherAnnotations.isEmpty {
                mapView.removeAnnotations(weatherAnnotations)
                weatherAnnotations = []
            }
            polygonKinds = [:]
            removeGeoJSONLayers(from: style)

            guard let overlay = requestedWeatherOverlay else {
                renderedOverlayID = nil
                return
            }

            let lineAnnotations: [MLNPolyline] = overlay.polylines.compactMap { line in
                let coordinates = line.coordinates.map(\.clLocationCoordinate)
                guard coordinates.count >= 2 else { return nil }
                return coordinates.withUnsafeBufferPointer { buffer in
                    guard let baseAddress = buffer.baseAddress else { return nil }
                    return MLNPolyline(coordinates: baseAddress, count: UInt(coordinates.count))
                }
            }
            let polygonAnnotations: [MLNPolygon] = overlay.polygons.compactMap { polygon in
                let coordinates = polygon.coordinates.map(\.clLocationCoordinate)
                guard coordinates.count >= 4 else { return nil }
                let annotation = coordinates.withUnsafeBufferPointer { buffer -> MLNPolygon? in
                    guard let baseAddress = buffer.baseAddress else { return nil }
                    return MLNPolygon(coordinates: baseAddress, count: UInt(coordinates.count))
                }
                if let annotation {
                    polygonKinds[ObjectIdentifier(annotation)] = polygon.kind
                }
                return annotation
            }
            let pointAnnotations: [WeatherPointAnnotation] = overlay.points.map { point in
                let annotation = WeatherPointAnnotation()
                annotation.coordinate = point.coordinate.clLocationCoordinate
                annotation.title = point.title
                annotation.subtitle = point.subtitle
                annotation.kind = point.kind
                return annotation
            }
            let annotations = polygonAnnotations.map { $0 as MLNAnnotation }
                + lineAnnotations.map { $0 as MLNAnnotation }
                + pointAnnotations.map { $0 as MLNAnnotation }
            if !annotations.isEmpty {
                mapView.addAnnotations(annotations)
                weatherAnnotations = annotations
            }
            addGeoJSONLayers(overlay.geoJSONSources, to: style)

            renderedOverlayID = overlay.id
            if !annotations.isEmpty {
                mapView.showAnnotations(
                    annotations,
                    edgePadding: UIEdgeInsets(top: 120, left: 35, bottom: 220, right: 35),
                    animated: true
                )
            }
        }

        private func addGeoJSONLayers(_ sources: [WeatherMapGeoJSONSource], to style: MLNStyle) {
            for sourceDefinition in sources {
                let sourceIdentifier = "meteoscope-\(sourceDefinition.id)"
                let source = MLNShapeSource(
                    identifier: sourceIdentifier,
                    url: sourceDefinition.url,
                    options: nil
                )
                style.addSource(source)
                weatherSourceIdentifiers.append(sourceIdentifier)

                for layerDefinition in sourceDefinition.layers where !layerDefinition.values.isEmpty {
                    let layerIdentifier = "meteoscope-\(layerDefinition.id)"
                    let predicate = NSPredicate(
                        format: "%K IN %@",
                        layerDefinition.propertyName,
                        layerDefinition.values
                    )
                    let appearance = regionAppearance(for: layerDefinition.appearance)
                    switch layerDefinition.geometry {
                    case .fill:
                        let layer = MLNFillStyleLayer(identifier: layerIdentifier, source: source)
                        layer.predicate = predicate
                        layer.fillColor = NSExpression(forConstantValue: appearance.color)
                        layer.fillOpacity = NSExpression(forConstantValue: appearance.opacity)
                        layer.fillOutlineColor = NSExpression(forConstantValue: appearance.outlineColor)
                        style.addLayer(layer)
                    case .line:
                        let layer = MLNLineStyleLayer(identifier: layerIdentifier, source: source)
                        layer.predicate = predicate
                        layer.lineColor = NSExpression(forConstantValue: appearance.color)
                        layer.lineOpacity = NSExpression(forConstantValue: appearance.opacity)
                        layer.lineWidth = NSExpression(forConstantValue: appearance.lineWidth)
                        style.addLayer(layer)
                    }
                    weatherLayerIdentifiers.append(layerIdentifier)
                }
            }
        }

        private func removeGeoJSONLayers(from style: MLNStyle) {
            for identifier in weatherLayerIdentifiers.reversed() {
                if let layer = style.layer(withIdentifier: identifier) { style.removeLayer(layer) }
            }
            for identifier in weatherSourceIdentifiers.reversed() {
                if let source = style.source(withIdentifier: identifier) { style.removeSource(source) }
            }
            weatherLayerIdentifiers = []
            weatherSourceIdentifiers = []
        }

        func mapView(_ mapView: MLNMapView, viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
            guard let point = annotation as? WeatherPointAnnotation else { return nil }
            let reuseIdentifier = "meteoscope-weather-point"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: reuseIdentifier)
                ?? MLNAnnotationView(reuseIdentifier: reuseIdentifier)
            let appearance = markerAppearance(for: point.kind)
            view.frame = CGRect(origin: .zero, size: appearance.size)
            view.backgroundColor = appearance.color
            view.layer.cornerRadius = appearance.size.width / 2
            view.layer.borderWidth = appearance.borderWidth
            view.layer.borderColor = UIColor.white.cgColor
            view.layer.shadowColor = UIColor.black.cgColor
            view.layer.shadowOpacity = 0.24
            view.layer.shadowRadius = 2
            return view
        }

        func mapView(_ mapView: MLNMapView, annotationCanShowCallout annotation: MLNAnnotation) -> Bool {
            annotation is WeatherPointAnnotation
        }

        func mapView(_ mapView: MLNMapView, strokeColorForShapeAnnotation annotation: MLNShape) -> UIColor {
            if let polygon = annotation as? MLNPolygon,
               let kind = polygonKinds[ObjectIdentifier(polygon)] {
                return polygonAppearance(for: kind).stroke
            }
            return UIColor.systemOrange
        }

        func mapView(_ mapView: MLNMapView, fillColorForPolygonAnnotation annotation: MLNPolygon) -> UIColor {
            guard let kind = polygonKinds[ObjectIdentifier(annotation)] else {
                return UIColor.systemOrange.withAlphaComponent(0.15)
            }
            return polygonAppearance(for: kind).fill
        }

        func mapView(_ mapView: MLNMapView, lineWidthForPolylineAnnotation annotation: MLNPolyline) -> CGFloat {
            3.5
        }

        func mapView(_ mapView: MLNMapView, lineWidthForShapeAnnotation annotation: MLNShape) -> CGFloat {
            if let polygon = annotation as? MLNPolygon,
               let kind = polygonKinds[ObjectIdentifier(polygon)] {
                return polygonAppearance(for: kind).lineWidth
            }
            return 3.5
        }

        private func polygonAppearance(
            for kind: WeatherMapPolygon.Kind
        ) -> (fill: UIColor, stroke: UIColor, lineWidth: CGFloat) {
            switch kind {
            case .typhoonProbability:
                (UIColor.systemOrange.withAlphaComponent(0.16), UIColor.systemOrange, 2)
            case .typhoonStrongWind:
                (UIColor.systemYellow.withAlphaComponent(0.14), UIColor.systemYellow, 2)
            case .typhoonStorm:
                (UIColor.systemRed.withAlphaComponent(0.18), UIColor.systemRed, 2.5)
            }
        }

        private func regionAppearance(
            for appearance: WeatherMapGeoJSONLayer.Appearance
        ) -> (color: UIColor, outlineColor: UIColor, opacity: NSNumber, lineWidth: NSNumber) {
            let color: UIColor
            let opacity: Double
            let width: Double
            switch appearance {
            case .warning(let severity):
                switch severity {
                case .advisory: color = .systemYellow
                case .warning: color = .systemRed
                case .danger: color = .systemPurple
                case .emergency: color = UIColor(red: 0.33, green: 0, blue: 0.46, alpha: 1)
                }
                opacity = severity == .emergency ? 0.72 : 0.58
                width = 1.4
            case .early(let level):
                color = level == .high
                    ? .earlyWarningHigh
                    : .earlyWarningMiddle
                opacity = level == .high ? 0.52 : 0.42
                width = 1.3
            case .river(let level):
                switch level {
                case 5: color = UIColor(red: 0.33, green: 0, blue: 0.46, alpha: 1)
                case 4: color = .systemPurple
                case 3: color = .systemRed
                default: color = .systemYellow
                }
                opacity = 0.92
                width = level >= 4 ? 6 : 4
            case .seismicIntensity(let label):
                color = intensityColor(label)
                opacity = 0.48
                width = 1.3
            case .tsunami(let level):
                switch level {
                case .majorWarning: color = UIColor(red: 0.71, green: 0, blue: 1, alpha: 1)
                case .warning: color = UIColor(red: 1, green: 0.17, blue: 0.07, alpha: 1)
                case .advisory: color = UIColor(red: 0.96, green: 0.82, blue: 0, alpha: 1)
                case .forecast: color = UIColor(red: 0.09, green: 0.55, blue: 0.82, alpha: 1)
                case .none: color = .systemGray
                }
                opacity = 0.96
                width = Double(level.rank + 2)
            }
            return (color, color.withAlphaComponent(0.92), NSNumber(value: opacity), NSNumber(value: width))
        }

        private func markerAppearance(for kind: WeatherMapPoint.Kind) -> (color: UIColor, size: CGSize, borderWidth: CGFloat) {
            switch kind {
            case .typhoonCenter:
                (UIColor.systemRed, CGSize(width: 22, height: 22), 3)
            case .typhoonForecast:
                (UIColor.systemOrange, CGSize(width: 14, height: 14), 2)
            case .earthquakeHypocenter:
                (UIColor.black, CGSize(width: 22, height: 22), 3)
            case .hypocenterDistribution(let depthKm):
                (hypocenterDepthColor(depthKm).withAlphaComponent(0.68), CGSize(width: 9, height: 9), 0)
            case .seismicIntensity(let label):
                (intensityColor(label), CGSize(width: 13, height: 13), 1.5)
            case .communityReport(let weather, let hasHazard):
                (hasHazard ? UIColor.systemOrange : communityReportColor(weather), CGSize(width: 14, height: 14), 2)
            }
        }

        private func hypocenterDepthColor(_ depthKm: Int?) -> UIColor {
            guard let depthKm else { return .systemGray }
            let depth = min(700, max(0, depthKm))
            let stops: [(depth: Int, red: CGFloat, green: CGFloat, blue: CGFloat)] = [
                (0, 239, 54, 43),
                (30, 255, 218, 71),
                (100, 75, 224, 91),
                (300, 69, 211, 238),
                (700, 28, 68, 210)
            ]
            guard let upperIndex = stops.firstIndex(where: { depth <= $0.depth }), upperIndex > 0 else {
                let color = stops[0]
                return UIColor(red: color.red / 255, green: color.green / 255, blue: color.blue / 255, alpha: 1)
            }
            let lower = stops[upperIndex - 1]
            let upper = stops[upperIndex]
            let progress = CGFloat(depth - lower.depth) / CGFloat(upper.depth - lower.depth)
            return UIColor(
                red: (lower.red + (upper.red - lower.red) * progress) / 255,
                green: (lower.green + (upper.green - lower.green) * progress) / 255,
                blue: (lower.blue + (upper.blue - lower.blue) * progress) / 255,
                alpha: 1
            )
        }

        private func communityReportColor(_ weather: String) -> UIColor {
            switch weather {
            case "sunny": UIColor.systemYellow
            case "cloudy": UIColor.systemGray
            case "light-rain": UIColor.systemTeal
            case "heavy-rain": UIColor.systemBlue
            case "snow": UIColor.systemCyan
            case "thunder": UIColor.systemPurple
            case "fog": UIColor.systemGray2
            default: UIColor.systemTeal
            }
        }

        private func intensityColor(_ label: String) -> UIColor {
            if label.contains("7") { return UIColor(red: 0.26, green: 0, blue: 0.57, alpha: 1) }
            if label.contains("6") { return UIColor.systemPurple }
            if label.contains("5") { return UIColor.systemRed }
            if label.contains("4") { return UIColor.systemOrange }
            if label.contains("3") { return UIColor.systemYellow }
            if label.contains("2") { return UIColor.systemGreen }
            return UIColor.systemBlue
        }

        private func coordinatesMatch(
            _ left: CLLocationCoordinate2D?,
            _ right: CLLocationCoordinate2D?
        ) -> Bool {
            switch (left, right) {
            case (nil, nil):
                true
            case let (.some(left), .some(right)):
                abs(left.latitude - right.latitude) < 0.000_001 &&
                    abs(left.longitude - right.longitude) < 0.000_001
            default:
                false
            }
        }
    }
}

private final class WeatherPointAnnotation: MLNPointAnnotation {
    var kind: WeatherMapPoint.Kind = .typhoonForecast
}

private extension GeoCoordinate {
    var clLocationCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
