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

            Text("更新 \(DateTextFormatter.shortDateTime(snapshot.updatedAt))")
                .font(.caption2)
                .foregroundStyle(.tertiary)
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
    @State private var presentsDisasterMap = false

    var body: some View {
        @Bindable var model = model

        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("警報・防災情報", systemImage: "exclamationmark.triangle.fill")
                    .font(.headline)
                Spacer()
                Button {
                    presentsDisasterMap = true
                } label: {
                    Label("防災マップ", systemImage: "map")
                        .labelStyle(.iconOnly)
                }
                .accessibilityLabel("防災マップを開く")
                .meteoGlassButton()
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
        .sheet(isPresented: $presentsDisasterMap) { DisasterMapView() }
    }
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
                UpdatedAtLabel(value: snapshot.updatedAt)
            }
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
                            .foregroundStyle(.white)
                            .frame(width: 24, height: 24)
                            .background(area.highestLevel == .high ? Color.red : Color.orange, in: Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text(area.areaName).font(.subheadline.weight(.semibold))
                            Text(area.items.prefix(2).map(\.hazard).joined(separator: "・"))
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        Text(DateTextFormatter.shortDateTime(area.items.first?.validTime ?? ""))
                            .font(.caption2.monospacedDigit())
                    }
                }
                UpdatedAtLabel(value: snapshot.updatedAt)
            }
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
                UpdatedAtLabel(value: snapshot.updatedAt)
            }
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

private struct UpdatedAtLabel: View {
    let value: String
    var body: some View {
        Text("更新 \(DateTextFormatter.shortDateTime(value))")
            .font(.caption2).foregroundStyle(.tertiary)
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
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        TyphoonValue(label: "中心気圧", value: typhoon.pressure)
                        TyphoonValue(label: "最大風速", value: typhoon.maximumWind)
                        TyphoonValue(label: "最大瞬間", value: typhoon.maximumGust)
                        TyphoonValue(label: "移動", value: "\(typhoon.course) \(typhoon.speed)")
                    }
                    Text("更新 \(DateTextFormatter.shortDateTime(typhoon.updatedAt))")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding()
                .meteoGlassSurface(cornerRadius: 18)
                .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
            } else {
                FeatureEmptyCard(
                    title: "現在、台風情報は発表されていません",
                    systemImage: "checkmark.circle.fill"
                )
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
            Text(value)
                .font(.caption.monospacedDigit().weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EarthquakeDashboardCard: View {
    @Environment(WeatherAppModel.self) private var model

    var body: some View {
        switch model.earthquakeState {
        case .idle, .loading:
            FeatureLoadingCard(title: "地震情報を読み込んでいます")
        case .failed(let message):
            FeatureErrorCard(title: "地震情報を取得できません", message: message)
        case .loaded(let snapshot):
            if let earthquake = snapshot.earthquakes.first {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        Text(earthquake.maximumIntensity)
                            .font(.headline.weight(.black))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(Color.intensityColor(earthquake.maximumIntensity), in: RoundedRectangle(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(earthquake.hypocenterName)
                                .font(.headline)
                            Text("\(earthquake.magnitude)・深さ \(earthquake.depth)")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    if !earthquake.headline.isEmpty {
                        Text(earthquake.headline)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Text("発生 \(DateTextFormatter.shortDateTime(earthquake.eventTime))")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding()
                .meteoGlassSurface(cornerRadius: 18)
                .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
            } else {
                FeatureEmptyCard(title: "表示できる地震情報はありません", systemImage: "waveform.path.ecg")
            }
        }
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
    static func shortDateTime(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "MM/dd HH:mm"
        return formatter.string(from: date)
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
