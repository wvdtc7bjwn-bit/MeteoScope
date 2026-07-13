import CoreLocation
import MapLibre
import SwiftUI

struct WeatherMapView: UIViewRepresentable {
    let radarFrame: RadarFrame?
    let userCoordinate: CLLocationCoordinate2D?

    func makeCoordinator() -> Coordinator {
        Coordinator()
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
        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {
        context.coordinator.requestedFrame = radarFrame
        context.coordinator.requestedUserCoordinate = userCoordinate
        context.coordinator.applyRadarLayerIfPossible()
        context.coordinator.applyUserLocationIfNeeded()
    }

    final class Coordinator: NSObject, MLNMapViewDelegate {
        private let sourceIdentifier = "meteoscope-radar-source"
        private let layerIdentifier = "meteoscope-radar-layer"

        weak var mapView: MLNMapView?
        var requestedFrame: RadarFrame?
        var requestedUserCoordinate: CLLocationCoordinate2D?
        private var renderedFrameID: RadarFrame.ID?
        private var renderedUserCoordinate: CLLocationCoordinate2D?
        private var userAnnotation: MLNPointAnnotation?

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            applyRadarLayerIfPossible()
            applyUserLocationIfNeeded()
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
