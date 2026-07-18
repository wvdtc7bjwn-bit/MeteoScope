import CoreLocation
import Observation

@MainActor
@Observable
final class LocationService: NSObject, @preconcurrency CLLocationManagerDelegate {
    enum State {
        case idle
        case requesting
        case located(CLLocationCoordinate2D)
        case denied
        case failed(String)
    }

    private(set) var state: State = .idle
    private let manager: CLLocationManager

    override init() {
        manager = CLLocationManager()
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    init(manager: CLLocationManager) {
        self.manager = manager
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    var coordinate: CLLocationCoordinate2D? {
        guard case .located(let coordinate) = state else { return nil }
        return coordinate
    }

    var statusMessage: String? {
        switch state {
        case .idle, .located:
            nil
        case .requesting:
            "現在地を取得しています"
        case .denied:
            "位置情報が許可されていません。端末の設定から変更できます。"
        case .failed(let message):
            message
        }
    }

    func requestCurrentLocation() {
        switch manager.authorizationStatus {
        case .notDetermined:
            state = .requesting
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            state = .requesting
            manager.requestLocation()
        case .restricted, .denied:
            state = .denied
        @unknown default:
            state = .failed("位置情報の状態を確認できませんでした。")
        }
    }

    func requestCurrentLocationOnLaunch() {
        guard case .idle = state else { return }
        requestCurrentLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            if case .requesting = state {
                manager.requestLocation()
            }
        case .restricted, .denied:
            state = .denied
        case .notDetermined:
            break
        @unknown default:
            state = .failed("位置情報の状態を確認できませんでした。")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            state = .failed("現在地を取得できませんでした。")
            return
        }
        state = .located(location.coordinate)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let locationError = error as? CLError, locationError.code == .denied {
            state = .denied
        } else {
            state = .failed("現在地を取得できませんでした。時間をおいて再試行してください。")
        }
    }
}
extension LocationService {
    static var preview: LocationService {
        LocationService(manager: CLLocationManager())
    }
}
