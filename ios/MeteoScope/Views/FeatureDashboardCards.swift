import Foundation
import Charts
import SwiftUI

struct AmedasDashboardCard: View {
    @Environment(WeatherAppModel.self) private var model
    @State private var metric: AmedasMetric = .temperature
    @State private var order: AmedasRankingOrder = .high
    @State private var period: AmedasRankingPeriod = .current
    @State private var selectedStation: AmedasRankingItem?

    var body: some View {
        Group {
            switch model.amedasState {
            case .idle, .loading:
                FeatureLoadingCard(title: "アメダスを読み込んでいます")
            case .failed(let message):
                FeatureErrorCard(title: "アメダスを取得できません", message: message)
            case .loaded(let snapshot):
                loadedContent(snapshot)
            }
        }
        .sheet(item: $selectedStation) { station in
            AmedasStationDetailView(
                station: station,
                referenceTime: loadedAmedasTimestamp,
                initialMetric: metric
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var loadedAmedasTimestamp: String {
        guard case .loaded(let snapshot) = model.amedasState else { return "" }
        return snapshot.updatedAt
    }

    private func loadedContent(_ snapshot: AmedasSnapshot) -> some View {
        let ranking = snapshot.ranking(metric: metric, period: period, order: order, limit: 5)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("\(metric.label)ランキング", systemImage: metric.systemImage)
                    .font(.headline)
                Spacer()
                Text(period.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                MeteoGlassGroup(spacing: 8) {
                    HStack(spacing: 7) {
                        ForEach(AmedasMetric.allCases) { item in
                            Button {
                                withAnimation(.snappy(duration: 0.22)) {
                                    metric = item
                                    if !item.supportsTodayRanking { period = .current }
                                    if !item.supportsLowRanking { order = .high }
                                }
                            } label: {
                                Label(item.label, systemImage: item.systemImage)
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 9)
                                    .padding(.vertical, 7)
                                    .foregroundStyle(metric == item ? Color.white : Color.primary)
                                    .meteoGlassSurface(
                                        cornerRadius: 14,
                                        interactive: true,
                                        tint: metric == item ? Color.meteoscopeAccent : nil
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            if metric.supportsTodayRanking {
                Picker("集計期間", selection: $period) {
                    ForEach(AmedasRankingPeriod.allCases) { item in
                        Text(item.label).tag(item)
                    }
                }
                .pickerStyle(.segmented)
            }

            if metric.supportsLowRanking {
                Picker("表示順", selection: $order) {
                    ForEach(AmedasRankingOrder.allCases) { item in
                        Text(item.label).tag(item)
                    }
                }
                .pickerStyle(.segmented)
            }

            if ranking.isEmpty {
                Label("表示できる観測値がありません", systemImage: "tray")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 7) {
                    ForEach(ranking) { item in
                        Button {
                            selectedStation = item
                        } label: {
                            AmedasRankingRow(
                                rank: (ranking.firstIndex(of: item) ?? 0) + 1,
                                item: item,
                                metric: metric
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            DataFreshnessLabel(feature: .amedas, dataTime: snapshot.updatedAt, dataTimeLabel: "観測時刻")
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18)
        .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
    }
}

private struct AmedasStationDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WeatherAppModel.self) private var model
    let station: AmedasRankingItem
    let referenceTime: String
    @State private var metric: AmedasMetric
    @State private var state: LoadState<AmedasDailySeries> = .idle

    init(station: AmedasRankingItem, referenceTime: String, initialMetric: AmedasMetric) {
        self.station = station
        self.referenceTime = referenceTime
        _metric = State(initialValue: initialMetric)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                Picker("観測項目", selection: $metric) {
                    ForEach(AmedasMetric.allCases) { item in
                        Text(item.label).tag(item)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)

                AmedasSeriesContent(state: state, metric: metric, onRetry: reload)
                Spacer(minLength: 0)
            }
            .padding()
            .navigationTitle(station.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("閉じる") { dismiss() } }
            }
            .task(id: metric) { await load() }
        }
    }

    private func reload() {
        Task { await load() }
    }

    private func load() async {
        state = .loading
        do {
            let series = try await model.fetchAmedasDailySeries(
                stationID: station.id,
                referenceTime: referenceTime,
                metric: metric
            )
            guard !Task.isCancelled else { return }
            state = .loaded(series)
        } catch is CancellationError {
            return
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

private struct AmedasSeriesContent: View {
    let state: LoadState<AmedasDailySeries>
    let metric: AmedasMetric
    let onRetry: () -> Void

    var body: some View {
        Group {
            switch state {
            case .idle, .loading:
                VStack(spacing: 10) {
                    ProgressView()
                    Text("今日の観測値を読み込んでいます").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 220)
            case .failed(let message):
                ContentUnavailableView {
                    Label("観測履歴を取得できません", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("再試行", action: onRetry)
                }
            case .loaded(let series):
                if series.points.isEmpty {
                    ContentUnavailableView("今日の観測値はありません", systemImage: "chart.xyaxis.line")
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            AmedasSeriesValue(label: "最低", value: series.minimum, metric: metric)
                            Spacer()
                            AmedasSeriesValue(label: "最高", value: series.maximum, metric: metric)
                        }
                        Chart(series.points) { point in
                            LineMark(
                                x: .value("時刻", point.timestamp),
                                y: .value(metric.label, point.value)
                            )
                            .foregroundStyle(Color.meteoscopeAccent)
                            .interpolationMethod(.catmullRom)
                            PointMark(
                                x: .value("時刻", point.timestamp),
                                y: .value(metric.label, point.value)
                            )
                            .foregroundStyle(Color.meteoscopeAccent)
                        }
                        .chartXAxis {
                            AxisMarks(values: .stride(by: .hour, count: 3)) { value in
                                AxisGridLine()
                                AxisTick()
                                AxisValueLabel(format: .dateTime.hour().minute())
                            }
                        }
                        .frame(minHeight: 220)
                        .accessibilityLabel("\(metric.label)の時系列グラフ")
                    }
                }
            }
        }
    }
}

private struct AmedasSeriesValue: View {
    let label: String
    let value: Double?
    let metric: AmedasMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value.map { MeasurementText.value($0, unit: metric.unit) } ?? "--")
                .font(.title3.monospacedDigit().weight(.bold))
        }
    }
}

private struct AmedasRankingRow: View {
    let rank: Int
    let item: AmedasRankingItem
    let metric: AmedasMetric

    var body: some View {
        HStack(spacing: 10) {
            Text("\(rank)")
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(.secondary)
                .frame(width: 20)
            Text(item.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(MeasurementText.value(item.value, unit: metric.unit))
                    .font(.subheadline.monospacedDigit().weight(.bold))
                if let observationTime = item.observationTime {
                    Text(DateTextFormatter.clock(observationTime))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct WarningDashboardCard: View {
    @Environment(WeatherAppModel.self) private var model
    @State private var presentedSheet: WarningDashboardSheet?

    var body: some View {
        @Bindable var model = model

        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("警報・防災情報", systemImage: "exclamationmark.triangle.fill")
                    .font(.headline)
                Spacer()
                HStack(spacing: 8) {
                    Button {
                        presentedSheet = .disasterQuiz
                    } label: {
                        Label("防災クイズ", systemImage: "questionmark.shield")
                            .labelStyle(.iconOnly)
                    }
                    .accessibilityLabel("防災クイズを開く")
                    .meteoGlassButton()

                    Button {
                        presentedSheet = .disasterMap
                    } label: {
                        Label("防災マップ", systemImage: "map")
                            .labelStyle(.iconOnly)
                    }
                    .accessibilityLabel("防災マップを開く")
                    .meteoGlassButton()
                }
            }

            Picker("表示情報", selection: $model.warningMapMode) {
                ForEach(WarningMapMode.allCases) { item in
                    Text(item.label).tag(item)
                }
            }
            .pickerStyle(.segmented)

            switch model.warningMapMode {
            case .announcements:
                WarningAnnouncementContent(state: model.warningState)
            case .early:
                EarlyWarningContent(state: model.earlyWarningState)
            case .river:
                RiverFloodContent(state: model.riverFloodState)
            }
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18)
        .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .disasterMap:
                DisasterMapView()
            case .disasterQuiz:
                DisasterQuizView()
            }
        }
    }
}

private enum WarningDashboardSheet: String, Identifiable {
    case disasterMap
    case disasterQuiz

    var id: String { rawValue }
}

private struct WarningAnnouncementContent: View {
    let state: LoadState<WarningSnapshot>

    @ViewBuilder
    var body: some View {
        switch state {
        case .idle, .loading:
            InlineLoadingRow(title: "警報・注意報を読み込んでいます")
        case .failed(let message):
            InlineErrorRow(message: message)
        case .loaded(let snapshot):
            if snapshot.prefectures.isEmpty {
                InlineEmptyRow(title: "現在、表示対象の警報・注意報はありません")
            } else {
                ForEach(snapshot.prefectures.prefix(5)) { prefecture in
                    HStack(spacing: 10) {
                        Circle().fill(prefecture.highestSeverity.color).frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(prefecture.name).font(.subheadline.weight(.semibold))
                            Text(prefecture.warnings.prefix(2).map(\.label).joined(separator: "・"))
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        Text("\(prefecture.areaCount)地域").font(.caption.monospacedDigit())
                    }
                }
            }
            DataFreshnessLabel(feature: .warnings, dataTime: snapshot.updatedAt, dataTimeLabel: "発表時刻")
        }
    }
}

private struct EarlyWarningContent: View {
    let state: LoadState<EarlyWarningSnapshot>

    @ViewBuilder
    var body: some View {
        switch state {
        case .idle, .loading:
            InlineLoadingRow(title: "早期注意情報を読み込んでいます")
        case .failed(let message):
            InlineErrorRow(message: message)
        case .loaded(let snapshot):
            if snapshot.areas.isEmpty {
                InlineEmptyRow(title: "警報級の可能性「中」「高」はありません")
            } else {
                ForEach(snapshot.areas.prefix(5)) { area in
                    HStack(spacing: 10) {
                        Text(area.highestLevel.label)
                            .font(.caption2.weight(.black))
                            .foregroundStyle(area.highestLevel == .high ? Color.white : Color(red: 0.14, green: 0.07, blue: 0.05))
                            .frame(width: 24, height: 24)
                            .background(
                                area.highestLevel == .high
                                    ? Color.earlyWarningHigh
                                    : Color.earlyWarningMiddle,
                                in: Circle()
                            )
                        Text(area.areaName).font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(DateTextFormatter.shortDateTime(area.items.first?.validTime ?? ""))
                            .font(.caption2.monospacedDigit())
                    }
                }
            }
            DataFreshnessLabel(feature: .warnings, dataTime: snapshot.updatedAt, dataTimeLabel: "発表時刻")
        }
    }
}

private struct RiverFloodContent: View {
    let state: LoadState<RiverFloodSnapshot>

    @ViewBuilder
    var body: some View {
        switch state {
        case .idle, .loading:
            InlineLoadingRow(title: "指定河川洪水予報を読み込んでいます")
        case .failed(let message):
            InlineErrorRow(message: message)
        case .loaded(let snapshot):
            if snapshot.reports.isEmpty {
                InlineEmptyRow(title: "現在、発表中の指定河川洪水予報はありません")
            } else {
                ForEach(snapshot.reports.prefix(5)) { report in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(report.forecastAreaName).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Spacer()
                            Text(report.levelLabel).font(.caption2.weight(.bold)).foregroundStyle(.orange)
                        }
                        Text(report.riverNames.isEmpty ? report.title : report.riverNames.joined(separator: "・"))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
            DataFreshnessLabel(feature: .warnings, dataTime: snapshot.updatedAt, dataTimeLabel: "発表時刻")
        }
    }
}

private struct InlineLoadingRow: View {
    let title: String
    var body: some View { HStack { ProgressView(); Text(title).font(.caption); Spacer() } }
}

private struct InlineErrorRow: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.caption).foregroundStyle(.secondary).lineLimit(2)
    }
}

private struct InlineEmptyRow: View {
    let title: String
    var body: some View {
        Label(title, systemImage: "checkmark.circle.fill")
            .font(.caption).foregroundStyle(.secondary).padding(.vertical, 6)
    }
}

private struct DataFreshnessLabel: View {
    @Environment(WeatherAppModel.self) private var model
    let feature: WeatherFeature
    let dataTime: String
    let dataTimeLabel: String

    var body: some View {
        let freshness = model.freshness(for: feature)
        VStack(alignment: .leading, spacing: 2) {
            Text("\(dataTimeLabel) \(DateTextFormatter.shortDateTime(dataTime))")
            Text("最終正常取得 \(freshness.fetchedAt.map(DateTextFormatter.shortDateTime) ?? "未取得")")
            if freshness.latestnessUnconfirmed {
                Label("最新性を確認できていません", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            }
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }
}

struct TyphoonDashboardCard: View {
    @Environment(WeatherAppModel.self) private var model

    var body: some View {
        switch model.typhoonState {
        case .idle, .loading:
            FeatureLoadingCard(title: "台風情報を読み込んでいます")
        case .failed(let message):
            FeatureErrorCard(title: "台風情報を取得できません", message: message)
        case .loaded(let snapshot):
            if let typhoon = snapshot.typhoons.first {
                VStack(alignment: .leading, spacing: 11) {
                    HStack {
                        Label("台風\(typhoon.number)号 \(typhoon.name)", systemImage: "hurricane")
                            .font(.headline)
                        Spacer()
                        Text(typhoon.category)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.meteoscopeAccent)
                    }
                    Text(typhoon.location)
                        .font(.subheadline.weight(.semibold))
                    if let transitionStatus = typhoon.transitionStatus {
                        Label(transitionStatus, systemImage: "arrow.triangle.2.circlepath")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.meteoscopeAccent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.meteoscopeAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                            .accessibilityLabel("現在の状態 \(transitionStatus)")
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        TyphoonValue(label: "中心気圧", value: typhoon.pressure)
                        TyphoonValue(label: "最大風速", value: typhoon.maximumWind)
                        TyphoonValue(label: "最大瞬間", value: typhoon.maximumGust)
                        TyphoonValue(label: "移動", value: typhoon.movement)
                    }
                    DataFreshnessLabel(feature: .typhoon, dataTime: typhoon.updatedAt, dataTimeLabel: "発表時刻")
                }
                .padding()
                .meteoGlassSurface(cornerRadius: 18)
                .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    FeatureEmptyCard(
                        title: "現在、台風情報は発表されていません",
                        systemImage: "checkmark.circle.fill"
                    )
                    DataFreshnessLabel(feature: .typhoon, dataTime: snapshot.updatedAt, dataTimeLabel: "発表時刻")
                }
            }
        }
    }
}

private struct TyphoonValue: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(displayValue)
                .font(.caption.monospacedDigit().weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var displayValue: String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty || ["--", "未取得", "取得中"].contains(normalized) ? "-" : normalized
    }
}

struct EarthquakeDashboardCard: View {
    @Environment(WeatherAppModel.self) private var model
    @Environment(AppPreferences.self) private var preferences
    @State private var collapsedEarthquakeID: EarthquakeSummary.ID?

    var body: some View {
        @Bindable var preferences = preferences
        switch model.earthquakeState {
        case .idle, .loading:
            FeatureLoadingCard(title: "地震情報を読み込んでいます")
        case .failed(let message):
            FeatureErrorCard(title: "地震情報を取得できません", message: message)
        case .loaded(let snapshot):
            if let selectedEarthquake = model.selectedEarthquake(in: snapshot) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Label("主要活断層帯", systemImage: "map")
                            .font(.caption.weight(.semibold))
                        Spacer()
                        Toggle("主要活断層帯を表示", isOn: $preferences.showsActiveFaults)
                            .labelsHidden()
                            .toggleStyle(.switch)
                    }

                    ScrollView(.vertical) {
                        LazyVStack(spacing: 10) {
                            ForEach(snapshot.earthquakes) { earthquake in
                                let isSelected = earthquake.id == selectedEarthquake.id
                                EarthquakeHistoryCard(
                                    earthquake: earthquake,
                                    tsunami: snapshot.tsunami,
                                    tsunamiStatus: snapshot.tsunamiStatus,
                                    isExpanded: isSelected && collapsedEarthquakeID != earthquake.id
                                ) {
                                    withAnimation(.easeInOut(duration: 0.18)) {
                                        if isSelected && collapsedEarthquakeID != earthquake.id {
                                            collapsedEarthquakeID = earthquake.id
                                        } else {
                                            collapsedEarthquakeID = nil
                                            model.selectEarthquake(earthquake)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .frame(maxHeight: 440)

                    DataFreshnessLabel(
                        feature: .earthquake,
                        dataTime: selectedEarthquake.reportTime,
                        dataTimeLabel: "発表時刻"
                    )
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    FeatureEmptyCard(title: "表示できる地震情報はありません", systemImage: "waveform.path.ecg")
                    DataFreshnessLabel(feature: .earthquake, dataTime: snapshot.updatedAt, dataTimeLabel: "発表時刻")
                }
            }
        }
    }
}

private struct TsunamiAreaRow: View {
    let area: TsunamiArea

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(area.level.displayName)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(.secondary.opacity(0.5), lineWidth: 1)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(area.name)
                    .font(.caption.weight(.bold))
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .background(.black.opacity(0.06), in: RoundedRectangle(cornerRadius: 9))
    }

    private var detail: String {
        let arrival = area.arrivalCondition.isEmpty
            ? (area.arrivalTime.isEmpty ? "到達予想時刻なし" : "到達予想 \(DateTextFormatter.shortDateTime(area.arrivalTime))")
            : area.arrivalCondition
        let height = area.heightCondition.isEmpty
            ? (area.height.isEmpty ? "高さ未発表" : "予想最大波 \(area.height)")
            : area.heightCondition
        return "\(arrival) / \(height)"
    }
}

private struct EarthquakeHistoryCard: View {
    let earthquake: EarthquakeSummary
    let tsunami: TsunamiSnapshot?
    let tsunamiStatus: TsunamiFetchStatus
    let isExpanded: Bool
    let onSelect: () -> Void

    private var intensityText: String {
        earthquake.maximumIntensity.replacingOccurrences(of: "震度", with: "")
    }

    private var orderedPoints: [EarthquakeIntensityPoint] {
        earthquake.intensityPoints.sorted {
            SeismicIntensityCatalog.rank($0.intensity) > SeismicIntensityCatalog.rank($1.intensity)
        }
    }

    private var observationCount: Int {
        orderedPoints.isEmpty ? earthquake.intensityAreas.count : orderedPoints.count
    }

    private var matchingTsunami: TsunamiSnapshot? {
        guard !earthquake.eventID.isEmpty,
              let tsunami,
              !tsunami.eventID.isEmpty,
              earthquake.eventID == tsunami.eventID
        else { return nil }
        return tsunami
    }

    private var tsunamiLabel: String? {
        if tsunamiStatus == .unavailable { return "津波情報を確認できません" }
        if let matchingTsunami { return matchingTsunami.highestLevel.displayName }
        let comment = earthquake.tsunamiComment.isEmpty ? earthquake.headline : earthquake.tsunamiComment
        if comment.contains("津波の心配はありません") { return "津波の心配なし" }
        if comment.contains("若干の海面変動") { return "若干の海面変動" }
        return "津波情報未確認"
    }

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onSelect) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 5) {
                        Text("最大震度")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(intensityText)
                            .font(.title2.weight(.black))
                            .foregroundStyle(Color.intensityForeground(earthquake.maximumIntensity))
                            .frame(width: 58, height: 58)
                            .background(
                                Color.intensityColor(earthquake.maximumIntensity),
                                in: RoundedRectangle(cornerRadius: 14)
                            )
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(DateTextFormatter.shortDateTime(earthquake.eventTime))頃発生")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Text("震源地")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(earthquake.hypocenterName)
                            .font(.headline.weight(.bold))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 8) {
                            Text(earthquake.magnitude)
                            Text("深さ \(earthquake.depth)")
                            if let tsunamiLabel {
                                Text(tsunamiLabel)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(tsunamiAccent)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.72)
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 3)
                                    .overlay(
                                        Capsule().stroke(tsunamiAccent.opacity(0.7), lineWidth: 1)
                                    )
                            }
                        }
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .frame(minHeight: 58)
                }
                .padding(12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                "最大\(earthquake.maximumIntensity)、震源地\(earthquake.hypocenterName)、\(earthquake.magnitude)、深さ\(earthquake.depth)"
            )
            .accessibilityValue(isExpanded ? "各地の震度を表示中" : "折りたたみ")

            if isExpanded {
                Divider().opacity(0.45)
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(orderedPoints.isEmpty ? "各地の震度（地域）" : "各地の震度")
                            .font(.subheadline.weight(.bold))
                        Spacer()
                        Text("\(observationCount)地点")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }

                    if !orderedPoints.isEmpty {
                        LazyVStack(spacing: 0) {
                            ForEach(orderedPoints) { point in
                                EarthquakeObservationRow(
                                    intensity: point.intensity,
                                    prefecture: point.prefecture,
                                    name: point.name
                                )
                                if point.id != orderedPoints.last?.id {
                                    Divider().padding(.leading, 52)
                                }
                            }
                        }
                        .background(.black.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    } else if !earthquake.intensityAreas.isEmpty {
                        LazyVStack(spacing: 0) {
                            ForEach(earthquake.intensityAreas) { area in
                                EarthquakeObservationRow(
                                    intensity: area.intensity,
                                    prefecture: "",
                                    name: area.name
                                )
                                if area.id != earthquake.intensityAreas.last?.id {
                                    Divider().padding(.leading, 52)
                                }
                            }
                        }
                        .background(.black.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    } else {
                        Text("各地の震度情報はありません。")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(.black.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                    }

                    if !earthquake.headline.isEmpty {
                        Text(earthquake.headline)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    if let matchingTsunami {
                        TsunamiEventDetails(tsunami: matchingTsunami)
                    }
                }
                .padding(12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .meteoGlassSurface(
            cornerRadius: 18,
            interactive: true
        )
        .shadow(color: .black.opacity(isExpanded ? 0.16 : 0.1), radius: 10, y: 4)
    }

    private var tsunamiAccent: Color {
        guard let level = matchingTsunami?.highestLevel else { return Color.secondary }
        switch level {
        case .majorWarning: return Color.purple
        case .warning: return Color.red
        case .advisory: return Color.yellow
        case .forecast: return Color.meteoscopeAccent
        case .none: return Color.secondary
        }
    }
}

private struct TsunamiEventDetails: View {
    let tsunami: TsunamiSnapshot

    private var visibleAreas: [TsunamiArea] {
        tsunami.areas.filter { $0.level != .none }
    }

    private var observations: [TsunamiObservation] {
        tsunami.observations + tsunami.offshoreObservations
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            HStack {
                Label("気象庁発表 \(tsunami.highestLevel.displayName)", systemImage: "water.waves")
                    .font(.caption.weight(.bold))
                Spacer()
                Text(DateTextFormatter.shortDateTime(tsunami.reportTime))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if !tsunami.headline.isEmpty {
                Text(tsunami.headline)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if !visibleAreas.isEmpty {
                DisclosureGroup("対象の津波予報区（\(visibleAreas.count)）") {
                    LazyVStack(spacing: 6) {
                        ForEach(visibleAreas) { area in
                            TsunamiAreaRow(area: area)
                        }
                    }
                    .padding(.top, 7)
                }
                .font(.caption.weight(.semibold))
            }
            if !observations.isEmpty {
                DisclosureGroup("観測された津波（\(observations.count)地点）") {
                    LazyVStack(spacing: 5) {
                        ForEach(observations.prefix(30)) { observation in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(observation.stationName)
                                    .lineLimit(2)
                                Spacer()
                                Text(observation.maximumHeightCondition.isEmpty
                                     ? (observation.maximumHeight.isEmpty ? "高さ未発表" : observation.maximumHeight)
                                     : observation.maximumHeightCondition)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.trailing)
                            }
                            .font(.caption2)
                        }
                    }
                    .padding(.top, 7)
                }
                .font(.caption.weight(.semibold))
            }
            Link(destination: MeteoScopeEndpoints.jmaTsunamiInformation) {
                Label("気象庁の津波情報を開く", systemImage: "safari")
                    .font(.caption.weight(.semibold))
            }
        }
    }
}

private struct EarthquakeObservationRow: View {
    let intensity: String
    let prefecture: String
    let name: String

    var body: some View {
        HStack(spacing: 10) {
            Text(intensity.replacingOccurrences(of: "震度", with: ""))
                .font(.subheadline.weight(.black))
                .foregroundStyle(Color.intensityForeground(intensity))
                .frame(width: 40, height: 36)
                .background(Color.intensityColor(intensity), in: RoundedRectangle(cornerRadius: 9))
            Text(prefecture.isEmpty ? "地域" : prefecture)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(minWidth: 58, alignment: .leading)
            Text(name)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .accessibilityElement(children: .combine)
    }
}

private struct FeatureLoadingCard: View {
    let title: String

    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text(title).font(.subheadline.weight(.semibold))
            Spacer()
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18)
    }
}

private struct FeatureErrorCard: View {
    let title: String
    let message: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(message).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18)
    }
}

private struct FeatureEmptyCard: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .meteoGlassSurface(cornerRadius: 18)
    }
}

private enum MeasurementText {
    static func value(_ value: Double, unit: String) -> String {
        let fractionDigits = value.rounded() == value ? 0 : 1
        return "\(String(format: "%.*f", fractionDigits, value))\(unit)"
    }
}

private enum DateTextFormatter {
    static func shortDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "MM/dd HH:mm"
        return formatter.string(from: date)
    }

    static func shortDateTime(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return shortDateTime(date)
    }

    static func clock(_ value: String) -> String {
        let pattern = #"\d{1,2}:\d{2}"#
        return value.range(of: pattern, options: .regularExpression).map { String(value[$0]) } ?? value
    }
}

private extension WarningSeverity {
    var color: Color {
        switch self {
        case .advisory: .yellow
        case .warning: .red
        case .danger: .purple
        case .emergency: .black
        }
    }
}

private extension Color {
    static func intensityColor(_ label: String) -> Color {
        if label.contains("7") { return Color(red: 0.26, green: 0, blue: 0.57) }
        if label.contains("6強") { return Color(red: 0.62, green: 0.03, blue: 0.8) }
        if label.contains("6弱") { return Color(red: 0.77, green: 0.03, blue: 0.53) }
        if label.contains("5") { return .red }
        if label.contains("4") { return .orange }
        if label.contains("3") { return .yellow }
        if label.contains("2") { return .green }
        return .blue
    }

    static func intensityForeground(_ label: String) -> Color {
        if label.contains("5") || label.contains("6") || label.contains("7") {
            return .white
        }
        return .black
    }
}

#Preview("AMeDAS") {
    AmedasDashboardCard()
        .padding()
        .background(Color.blue.opacity(0.18))
        .environment(WeatherAppModel.preview)
}

#Preview("AMeDAS観測点グラフ") {
    AmedasStationDetailView(
        station: AmedasRankingItem(
            id: "62078",
            name: "奈良",
            coordinate: GeoCoordinate(latitude: 34.69, longitude: 135.83),
            value: 31.4,
            observationTime: "2026-07-13T19:00:00+09:00"
        ),
        referenceTime: "2026-07-13T19:00:00+09:00",
        initialMetric: .temperature
    )
    .environment(WeatherAppModel.preview)
}

#Preview("警報・発表") {
    WarningDashboardCard()
        .padding()
        .environment(previewModel(warningMode: .announcements))
}

#Preview("警報・早期") {
    WarningDashboardCard()
        .padding()
        .environment(previewModel(warningMode: .early))
}

#Preview("警報・河川") {
    WarningDashboardCard()
        .padding()
        .environment(previewModel(warningMode: .river))
}

#Preview("台風") {
    TyphoonDashboardCard()
        .padding()
        .background(Color.blue.opacity(0.18))
        .environment(WeatherAppModel.preview)
}

#Preview("地震") {
    EarthquakeDashboardCard()
        .padding()
        .background(Color.blue.opacity(0.18))
        .environment(WeatherAppModel.preview)
}

@MainActor
private func previewModel(warningMode: WarningMapMode) -> WeatherAppModel {
    let model = WeatherAppModel.preview
    model.warningMapMode = warningMode
    return model
}
