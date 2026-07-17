import SwiftUI
import UIKit

extension Color {
    static let meteoscopeAccent = Color(red: 0.15, green: 0.58, blue: 0.95)
    static let meteoscopeSurface = Color(uiColor: .secondarySystemBackground).opacity(0.94)
    static let earlyWarningHigh = Color(red: 1, green: 0.42, blue: 0.45)
    static let earlyWarningMiddle = Color(red: 1, green: 0.78, blue: 0.72)
}

extension UIColor {
    static let earlyWarningHigh = UIColor(Color.earlyWarningHigh)
    static let earlyWarningMiddle = UIColor(Color.earlyWarningMiddle)
}
