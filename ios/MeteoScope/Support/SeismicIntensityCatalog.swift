import Foundation

enum SeismicIntensityCatalog {
    static func rank(_ label: String) -> Int {
        if label.contains("7") { return 9 }
        if label.contains("6強") { return 8 }
        if label.contains("6弱") { return 7 }
        if label.contains("5強") { return 6 }
        if label.contains("5弱") { return 5 }
        if label.contains("4") { return 4 }
        if label.contains("3") { return 3 }
        if label.contains("2") { return 2 }
        if label.contains("1") { return 1 }
        return 0
    }
}
