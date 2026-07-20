import SwiftUI

struct MapDashboardView: View {
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(WeatherAppModel.self) private var model
    @Environment(AppPreferences.self) private var preferences
    @Environment(LocationService.self) private var locationService
    @Environment(CommunityReportModel.self) private var communityReports
    @State private var isMapReady = false
    @State private var selectedActiveFault: ActiveFaultInfo?
    @State private var showsCurrentLocationMarker = true
    @State private var suppressesNextLocationButtonTap = false

    var body: some View {
        @Bindable var model = model

        GeometryReader { geometry in
            ZStack {
                WeatherMapView(
                    radarFrame: model.selectedFeature == .radar ? model.selectedRadarFrame : nil,
                    userCoordinate: locationService.coordinate,
                    showsUserLocationMarker: showsCurrentLocationMarker,
                    weatherOverlay: weatherOverlay,
                    showsActiveFaults: model.selectedFeature == .earthquake && preferences.showsActiveFaults,
                    showsPlateBoundaries: model.selectedFeature == .earthquake && preferences.showsPlateBoundaries,
                    showsPlateDepthContours: model.selectedFeature == .earthquake && preferences.showsPlateDepthContours,
                    showsHypocenterDepth3D: model.selectedFeature == .earthquake
                        && model.earthquakeDisplayMode == .distribution
                        && model.hypocenterMapPresentation == .spatial,
                    isMapReady: $isMapReady,
                    selectedActiveFault: $selectedActiveFault
                )
                    .ignoresSafeArea(edges: .top)
                    .opacity(isMapReady ? 1 : 0)
                    .allowsHitTesting(isMapReady)

                if isMapReady {
                    if verticalSizeClass == .compact {
                        HStack(alignment: .top, spacing: 12) {
                            FeaturePicker(selection: $model.selectedFeature, axis: .vertical)
                                .frame(width: 68)
                            Spacer(minLength: 12)
                            dashboardDetails
                                .frame(width: min(370, max(290, geometry.size.width * 0.43)))
                        }
                        .padding(.horizontal, 10)
                        .padding(.bottom, 8)
                    } else {
                        VStack(spacing: 12) {
                            FeaturePicker(selection: $model.selectedFeature)
                            dashboardDetails
                        }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                    }
                } else {
                    InitialMapLoadingView()
                }
            }
        }
        .navigationTitle("MeteoScope")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(isMapReady ? .visible : .hidden, for: .navigationBar)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    if suppressesNextLocationButtonTap {
                        suppressesNextLocationButtonTap = false
                        return
                    }
                    locationService.requestCurrentLocation()
                } label: {
                    Image(systemName: showsCurrentLocationMarker ? "location.fill" : "location.slash")
                }
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.65)
                        .onEnded { _ in
                            suppressesNextLocationButtonTap = true
                            showsCurrentLocationMarker.toggle()
                        }
                )
                .accessibilityLabel("現在地を表示")
                .accessibilityHint(showsCurrentLocationMarker ? "長押しで現在地マーカーを非表示" : "長押しで現在地マーカーを表示")
                .accessibilityAction(named: Text(showsCurrentLocationMarker ? "現在地マーカーを非表示" : "現在地マーカーを表示")) {
                    showsCurrentLocationMarker.toggle()
                }
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
            locationService.requestCurrentLocationOnLaunch()
            await model.loadRadarIfNeeded()
        }
        .task(id: model.selectedFeature) {
            await model.loadSelectedFeatureIfNeeded()
            guard model.selectedFeature == .radar else { return }
            await communityReports.refresh()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                guard !Task.isCancelled, model.selectedFeature == .radar else { return }
                await communityReports.refresh()
            }
        }
        .onChange(of: model.selectedFeature) { _, feature in
            if feature != .earthquake { selectedActiveFault = nil }
        }
        .onChange(of: preferences.showsActiveFaults) { _, isVisible in
            if !isVisible { selectedActiveFault = nil }
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
            if model.earthquakeDisplayMode == .distribution {
                guard case .loaded(let snapshot) = model.hypocenterDistributionState else { return nil }
                return WeatherMapOverlayBuilder.hypocenterDistribution(snapshot)
            } else {
                guard case .loaded(let snapshot) = model.earthquakeState else { return nil }
                return WeatherMapOverlayBuilder.earthquake(
                    model.selectedEarthquake(in: snapshot),
                    tsunami: snapshot.tsunami
                )
            }
        case .radar:
            return WeatherMapOverlayBuilder.communityReports(communityReports.reports)
        case .amedas:
            return nil
        }
    }

    private var dashboardDetails: some View {
        VStack(spacing: 12) {
            if let statusMessage = locationService.statusMessage {
                LocationStatusBanner(message: statusMessage)
            }
            Spacer()
            if model.selectedFeature == .earthquake, let selectedActiveFault {
                ActiveFaultInfoCard(info: selectedActiveFault) {
                    self.selectedActiveFault = nil
                }
            }
            FeatureOverlay()
        }
    }
}

private struct InitialMapLoadingView: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView()
                    .controlSize(.large)
                Text("地図を読み込み中")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(.primary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("地図を読み込み中")
    }
}

private struct ActiveFaultInfoCard: View {
    let info: ActiveFaultInfo
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Text(info.breakableName)
                    .font(.subheadline.weight(.bold))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(1)
                Spacer(minLength: 4)
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("活断層情報を閉じる")
            }
            Divider()
            HStack(spacing: 18) {
                ActiveFaultValue(label: "想定規模", value: info.magnitude)
                ActiveFaultValue(label: "30年確率", value: info.thirtyYearProbability)
            }
            Text("J-SHIS 2022年版・最大ケース")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: 310, alignment: .leading)
        .meteoGlassSurface(cornerRadius: 14)
        .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
    }
}

private struct ActiveFaultValue: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.caption.monospacedDigit().weight(.bold))
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
    var axis: Axis.Set = .horizontal

    var body: some View {
        let stack = axis == .horizontal
            ? AnyLayout(HStackLayout(spacing: 8))
            : AnyLayout(VStackLayout(spacing: 8))

        ScrollView(axis, showsIndicators: false) {
            MeteoGlassGroup(spacing: 10) {
                stack {
                    ForEach(WeatherFeature.allCases) { feature in
                        Button {
                            withAnimation(.snappy(duration: 0.25)) {
                                selection = feature
                            }
                        } label: {
                            FeaturePickerLabel(feature: feature, isVertical: axis == .vertical)
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

private struct FeaturePickerLabel: View {
    let feature: WeatherFeature
    let isVertical: Bool

    var body: some View {
        Group {
            if isVertical {
                VStack(spacing: 2) {
                    Image(systemName: feature.systemImage)
                        .font(.system(size: 17, weight: .semibold))
                    Text(feature.shortTitle)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)
            } else {
                Label(feature.shortTitle, systemImage: feature.systemImage)
                    .font(.caption.weight(.semibold))
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
    @Environment(LocationService.self) private var locationService
    @Environment(CommunityReportModel.self) private var communityReports
    @State private var showsReportComposer = false

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
                    Text(model.selectedRadarFrame?.displayTime ?? "--:--")
                        .font(.callout.monospacedDigit().weight(.semibold))
                    Text(model.selectedRadarFrame?.isForecast == true ? "予報" : "観測")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("投稿") { showsReportComposer = true }
                        .font(.caption.weight(.bold))
                        .buttonStyle(.bordered)
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
        .sheet(isPresented: $showsReportComposer) {
            CommunityReportComposerView(
                coordinate: locationService.coordinate,
                isLoggedIn: QuizSessionKeychain.load() != nil,
                reports: communityReports
            )
        }
    }
}

#Preview("Radar loaded") {
    NavigationStack {
        MapDashboardView()
    }
    .environment(WeatherAppModel.preview)
    .environment(AppPreferences(store: .preview))
    .environment(LocationService.preview)
    .environment(CommunityReportModel())
    .environment(EarlyAccessModel())
}
