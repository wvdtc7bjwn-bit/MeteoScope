import Foundation

enum WeatherFeature: String, CaseIterable, Identifiable, Hashable {
    case radar
    case amedas
    case warnings
    case typhoon
    case earthquake

    var id: String { rawValue }

    var title: String {
        switch self {
        case .radar: "雨雲レーダー"
        case .amedas: "アメダス"
        case .warnings: "警報・注意報"
        case .typhoon: "台風情報"
        case .earthquake: "地震情報"
        }
    }

    var shortTitle: String {
        switch self {
        case .radar: "雨雲"
        case .amedas: "観測"
        case .warnings: "警報"
        case .typhoon: "台風"
        case .earthquake: "地震"
        }
    }

    var systemImage: String {
        switch self {
        case .radar: "cloud.rain.fill"
        case .amedas: "thermometer.medium"
        case .warnings: "exclamationmark.triangle.fill"
        case .typhoon: "hurricane"
        case .earthquake: "waveform.path.ecg"
        }
    }

    var implementationStatus: FeatureImplementationStatus {
        self == .radar ? .available : .inProgress
    }
}

enum FeatureImplementationStatus: Equatable {
    case available
    case inProgress

    var label: String {
        switch self {
        case .available: "利用可能"
        case .inProgress: "移植中"
        }
    }
}
