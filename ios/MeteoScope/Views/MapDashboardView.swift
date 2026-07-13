import SwiftUI

struct MapDashboardView: View {
    @Environment(WeatherAppModel.self) private var model
    @Environment(AppPreferences.self) private var preferences
    @Environment(LocationService.self) private var locationService

    var body: some View {
        @Bindable var model = model

        ZStack {
            WeatherMapView(
                radarFrame: model.selectedFeature == .radar ? model.selectedRadarFrame : nil,
                userCoordinate: locationService.coordinate,
                weatherOverlay: weatherOverlay
            )
                .ignoresSafeArea(edges: .top)

            VStack(spacing: 12) {
                FeaturePicker(selection: $model.selectedFeature)
                if let statusMessage = locationService.statusMessage {
                    LocationStatusBanner(message: statusMessage)
                }
                Spacer()
                FeatureOverlay()
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .navigationTitle("MeteoScope")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    locationService.requestCurrentLocation()
                } label: {
                    Image(systemName: "location.fill")
                }
                .accessibilityLabel("現在地を表示")
                .meteoGlassButton()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshSelectedFeature() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("気象データを更新")
                .meteoGlassButton()
            }
        }
        .task {
            await model.loadRadarIfNeeded()
        }
        .task(id: model.selectedFeature) {
            await model.loadSelectedFeatureIfNeeded()
        }
        .task(id: preferences.automaticallyRefresh) {
            guard preferences.automaticallyRefresh else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: MeteoScopeIntervals.automaticRefresh)
                guard !Task.isCancelled else { return }
                await model.refreshSelectedFeature()
            }
        }
    }

    private var weatherOverlay: WeatherMapOverlay? {
        switch model.selectedFeature {
        case .warnings:
            switch model.warningMapMode {
            case .announcements:
                guard case .loaded(let snapshot) = model.warningState else { return nil }
                return WeatherMapOverlayBuilder.warnings(snapshot)
            case .early:
                guard case .loaded(let snapshot) = model.earlyWarningState else { return nil }
                return WeatherMapOverlayBuilder.earlyWarnings(snapshot)
            case .river:
                guard case .loaded(let snapshot) = model.riverFloodState else { return nil }
                return WeatherMapOverlayBuilder.rivers(snapshot)
            }
        case .typhoon:
            guard case .loaded(let snapshot) = model.typhoonState,
                  let typhoon = snapshot.typhoons.first
            else {
                return nil
            }
            return WeatherMapOverlayBuilder.typhoon(typhoon)
        case .earthquake:
            guard case .loaded(let snapshot) = model.earthquakeState,
                  let earthquake = snapshot.earthquakes.first
            else {
                return nil
            }
            return WeatherMapOverlayBuilder.earthquake(earthquake)
        case .radar, .amedas:
            return nil
        }
    }
}

private struct LocationStatusBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "location.circle")
            .font(.caption)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .meteoGlassSurface(cornerRadius: 12)
    }
}

private struct FeaturePicker: View {
    @Binding var selection: WeatherFeature

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            MeteoGlassGroup(spacing: 10) {
                HStack(spacing: 8) {
                    ForEach(WeatherFeature.allCases) { feature in
                        Button {
                            withAnimation(.snappy(duration: 0.25)) {
                                selection = feature
                            }
                        } label: {
                            Label(feature.shortTitle, systemImage: feature.systemImage)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .foregroundStyle(selection == feature ? Color.white : Color.primary)
                                .meteoGlassSurface(
                                    cornerRadius: 18,
                                    interactive: true,
                                    tint: selection == feature ? Color.meteoscopeAccent : nil
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selection == feature ? .isSelected : [])
                    }
                }
            }
        }
    }
}

private struct FeatureOverlay: View {
    @Environment(WeatherAppModel.self) private var model

    @ViewBuilder
    var body: some View {
        switch model.selectedFeature {
        case .radar:
            RadarTimelineCard()
        case .amedas:
            AmedasDashboardCard()
        case .warnings:
            WarningDashboardCard()
        case .typhoon:
            TyphoonDashboardCard()
        case .earthquake:
            EarthquakeDashboardCard()
        }
    }
}

private struct RadarTimelineCard: View {
    @Environment(WeatherAppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        VStack(alignment: .leading, spacing: 10) {
            switch model.radarState {
            case .idle, .loading:
                HStack {
                    ProgressView()
                    Text("雨雲データを読み込んでいます")
                }
                .frame(maxWidth: .infinity, alignment: .leading)

            case .failed(let message):
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("読み込みに失敗しました")
                            .font(.headline)
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("再試行") {
                        Task { await model.refreshRadar() }
                    }
                    .buttonStyle(.borderedProminent)
                }

            case .loaded(let frames):
                HStack {
                    Label(
                        model.selectedRadarFrame?.isForecast == true ? "予報" : "観測",
                        systemImage: "clock"
                    )
                    .font(.caption.weight(.semibold))
                    Spacer()
                    Text(model.selectedRadarFrame?.displayTime ?? "--:--")
                        .font(.callout.monospacedDigit().weight(.semibold))
                }

                Picker("表示時刻", selection: $model.selectedRadarFrameID) {
                    ForEach(frames) { frame in
                        Text(frame.displayTime).tag(Optional(frame.id))
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18)
        .shadow(color: .black.opacity(0.18), radius: 14, y: 6)
    }
}

#Preview("Radar loaded") {
    NavigationStack {
        MapDashboardView()
    }
    .environment(WeatherAppModel.preview)
    .environment(AppPreferences(store: .preview))
    .environment(LocationService.preview)
}
