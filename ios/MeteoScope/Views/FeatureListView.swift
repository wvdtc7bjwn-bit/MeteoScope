import SwiftUI

struct FeatureListView: View {
    @Environment(WeatherAppModel.self) private var model

    var body: some View {
        List(WeatherFeature.allCases) { feature in
            Button {
                model.selectFeature(feature)
            } label: {
                HStack(spacing: 14) {
                    Image(systemName: feature.systemImage)
                        .font(.title3)
                        .frame(width: 32)
                        .foregroundStyle(Color.meteoscopeAccent)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(feature.title)
                            .foregroundStyle(.primary)
                        Text(feature.implementationStatus.label)
                            .font(.caption)
                            .foregroundStyle(
                                feature.implementationStatus == .available ? Color.green : Color.secondary
                            )
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .navigationTitle("気象・防災情報")
    }
}

#Preview {
    NavigationStack {
        FeatureListView()
    }
    .environment(WeatherAppModel.preview)
}
