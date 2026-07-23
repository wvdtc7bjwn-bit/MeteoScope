import Foundation
import SwiftUI

struct VolcanoDashboardCard: View {
    @Environment(WeatherAppModel.self) private var model
    @Binding var selectedVolcanoCode: String?
    @Binding var selectedAshForecastIndex: Int
    @State private var selectedBulletinID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("火山情報")
                        .font(.headline)
                    Text("気象庁発表・警戒度の高い順")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("長押しで地震へ")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Divider()

            switch model.volcanoState {
            case .idle, .loading:
                FeatureLoadingCard(title: "火山情報を読み込んでいます")
            case .failed(let message):
                FeatureErrorCard(title: "火山情報を取得できません", message: message)
            case .loaded(let snapshot):
                if let selectedVolcanoCode,
                   let volcano = snapshot.volcanoes.first(where: { $0.code == selectedVolcanoCode }) {
                    selectedVolcano(volcano, updatedAt: snapshot.updatedAt)
                } else {
                    volcanoLevelGuide()
                }
            }
        }
        .onChange(of: selectedVolcanoCode) { _, _ in
            selectedBulletinID = nil
            selectedAshForecastIndex = 0
        }
    }

    private func selectedVolcano(_ volcano: VolcanoSummary, updatedAt: String) -> some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 16) {
                if let selectedBulletin = selectedBulletin(for: volcano) {
                    selectedBulletinDetail(volcano: volcano, bulletin: selectedBulletin)
                } else {
                    ashForecastTimeline(volcano)
                    HStack(spacing: 12) {
                        Button {
                            selectedBulletinID = nil
                            selectedVolcanoCode = nil
                        } label: {
                            Label("火山情報の見方", systemImage: "chevron.left")
                        }
                        .font(.caption.weight(.semibold))
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.meteoscopeAccent)
                        Spacer()
                        Text("地図で選択中")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }

                    if let detail = detailBulletin(for: volcano) {
                        bulletinDetail(volcano: volcano, bulletin: detail)
                    } else {
                        VolcanoStatusRow(volcano: volcano)
                        Text("この火山の詳細な発表本文は現在取得できません。最新の警戒状況は気象庁の公式情報で確認してください。")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    if let coordinate = volcano.coordinate {
                        LabeledContent("位置") {
                            Text(String(format: "北緯%.3f°・東経%.3f°", coordinate.latitude, coordinate.longitude))
                                .monospacedDigit()
                        }
                        .font(.caption)
                    }

                    LabeledContent("最終取得") {
                        Text(updatedAt)
                            .monospacedDigit()
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)

                    Link("気象庁の火山情報を開く", destination: MeteoScopeEndpoints.jmaVolcanoInformation)
                        .font(.caption.weight(.semibold))
                    Text("出典：気象庁「噴火警報・予報」「火山の状況に関する解説情報」「降灰予報」。本アプリは気象庁の公式サービスではありません。避難や規制は自治体等の公式発表も確認してください。")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .id(selectedBulletinID ?? "volcano-current")
        }
        .frame(maxHeight: 620)
    }

    @ViewBuilder
    private func ashForecastTimeline(_ volcano: VolcanoSummary) -> some View {
        let forecasts = volcano.availableAshForecasts()
        if !forecasts.isEmpty {
            let index = min(max(0, selectedAshForecastIndex), forecasts.count - 1)
            let forecast = forecasts[index]
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("降灰予報")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text("\(forecastTime(forecast.startTime))～\(forecastTime(forecast.endTime))")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                if forecasts.count > 1 {
                    Slider(
                        value: Binding(
                            get: { Double(index) },
                            set: { selectedAshForecastIndex = Int($0.rounded()) }
                        ),
                        in: 0...Double(forecasts.count - 1),
                        step: 1
                    )
                    .accessibilityLabel("降灰予報の予測時間")
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func forecastTime(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: value) else { return value }
        return date.formatted(.dateTime.month().day().hour().minute().locale(Locale(identifier: "ja_JP")))
    }

    @ViewBuilder
    private func selectedBulletinDetail(volcano: VolcanoSummary, bulletin: VolcanoBulletin) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Button("← \(volcano.name)の情報へ戻る") {
                    selectedBulletinID = nil
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                Spacer()
                Text("選択した発表")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(displayName(volcano: volcano, bulletin: bulletin))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(displayBulletinTitle(bulletin.title))
                    .font(.title2.weight(.bold))
                Text(displayDate(bulletin.reportTime))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            bulletinSection("発表内容", text: bulletin.headline)
            bulletinSection("警戒事項等", text: bulletin.prevention)
            bulletinSection("火山活動の状況", text: bulletin.activity)
            bulletinTargetAreas(bulletin, title: "対象地域")
            bulletinSection("今後の情報", text: bulletin.nextAdvisory)

            Link("気象庁XML原文を確認", destination: bulletin.sourceURL)
                .font(.caption)
                .fontWeight(.semibold)
        }
    }

    @ViewBuilder
    private func bulletinDetail(volcano: VolcanoSummary, bulletin: VolcanoBulletin) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(displayName(volcano: volcano, bulletin: bulletin))
                    .font(.title2.weight(.bold))
                Text(displayDate(bulletin.reportTime))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 2) {
                Text(alertLevelText(volcano: volcano, bulletin: bulletin))
                    .font(.caption.weight(.semibold))
                Text(restrictionText(volcano: volcano, bulletin: bulletin))
                    .font(.headline.weight(.bold))
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(alertTextColor(volcano.alertPriority))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .padding(.horizontal, 12)
            .background(alertColor(volcano.alertPriority))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            bulletinSection("現在の警戒事項等", text: joinedWarningText(bulletin))
            bulletinSection("火山活動の状況", text: bulletin.activity)

            bulletinTargetAreas(bulletin, title: "噴火警報・予報の対象市町村")

            bulletinSection("今後の情報", text: bulletin.nextAdvisory)

            if !volcano.bulletins.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("関連する発表")
                        .font(.headline)
                        .padding(.bottom, 4)
                    Divider()
                    ForEach(latestBulletinsByType(volcano.bulletins).prefix(8)) { item in
                        Button {
                            selectedBulletinID = item.id
                        } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(displayBulletinTitle(item.title))
                                        .font(.callout.weight(.semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.leading)
                                    Text(displayDate(item.reportTime))
                                        .font(.caption2.monospacedDigit())
                                        .foregroundStyle(.secondary)
                                    if !item.headline.isEmpty {
                                        Text(item.headline)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                            .lineSpacing(2)
                                            .multilineTextAlignment(.leading)
                                            .padding(.top, 3)
                                    }
                                }
                                Spacer(minLength: 4)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            .contentShape(Rectangle())
                            .padding(.horizontal, 2)
                            .padding(.vertical, 9)
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func bulletinSection(_ title: String, text: String) -> some View {
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                Text(text)
                    .font(.callout)
                    .lineSpacing(4)
                    .textSelection(.enabled)
            }
        }
    }

    @ViewBuilder
    private func bulletinTargetAreas(_ bulletin: VolcanoBulletin, title: String) -> some View {
        if !bulletin.targetAreaGroups.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.headline)
                ForEach(bulletin.targetAreaGroups, id: \.self) { group in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(group.kindName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(group.areas.joined(separator: "、"))
                            .font(.callout)
                    }
                }
            }
        }
    }

    private func joinedWarningText(_ bulletin: VolcanoBulletin) -> String {
        [bulletin.prevention, bulletin.headline]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n\n")
    }

    private func detailBulletin(for volcano: VolcanoSummary) -> VolcanoBulletin? {
        volcano.bulletins.first {
            ($0.bulletinCode == "VFVO50" || $0.bulletinCode == "VFVO51")
                && (!$0.prevention.isEmpty || !$0.activity.isEmpty || !$0.headline.isEmpty)
        }
    }

    private func latestBulletinsByType(_ bulletins: [VolcanoBulletin]) -> [VolcanoBulletin] {
        var seenTypes = Set<String>()
        return bulletins.filter { bulletin in
            seenTypes.insert(bulletin.bulletinCode).inserted
        }
    }

    private func selectedBulletin(for volcano: VolcanoSummary) -> VolcanoBulletin? {
        guard let selectedBulletinID else { return nil }
        return volcano.bulletins.first(where: { $0.id == selectedBulletinID })
    }

    private func displayName(volcano: VolcanoSummary, bulletin: VolcanoBulletin) -> String {
        guard !bulletin.craterName.isEmpty, !volcano.name.contains(bulletin.craterName) else {
            return volcano.name
        }
        return "\(volcano.name)（\(bulletin.craterName)）"
    }

    private func displayBulletinTitle(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("火山名") else { return trimmed.isEmpty ? "火山情報" : trimmed }
        let title = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? "火山情報" : title
    }

    private func alertLevelText(volcano: VolcanoSummary, bulletin: VolcanoBulletin) -> String {
        if volcano.level > 0 { return "噴火警戒レベル\(volcano.level)" }
        return bulletin.kindName.isEmpty ? volcano.kindName : bulletin.kindName
    }

    private func restrictionText(volcano: VolcanoSummary, bulletin: VolcanoBulletin) -> String {
        let source = bulletin.kindName.isEmpty ? volcano.kindName : bulletin.kindName
        if let start = source.firstIndex(of: "（"),
           let end = source[start...].firstIndex(of: "）"), start < end {
            return String(source[source.index(after: start)..<end])
        }
        if let start = source.firstIndex(of: "("),
           let end = source[start...].firstIndex(of: ")"), start < end {
            return String(source[source.index(after: start)..<end])
        }
        return source
    }

    private func displayDate(_ value: String) -> String {
        let normalized = value
            .replacingOccurrences(of: "T", with: " ")
            .replacingOccurrences(of: "+09:00", with: "")
        return normalized.isEmpty ? "発表時刻未取得" : "\(normalized) 発表"
    }

    private func alertColor(_ priority: Int) -> Color {
        let tone = VolcanoLevelPalette.tone(for: priority)
        return Color(red: tone.redUnit, green: tone.greenUnit, blue: tone.blueUnit)
    }

    private func alertTextColor(_ priority: Int) -> Color {
        VolcanoLevelPalette.tone(for: priority).usesLightText
            ? .white
            : Color(red: 0.07, green: 0.14, blue: 0.23)
    }

    private func volcanoLevelGuide() -> some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("火山情報の見方")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("噴火警戒レベル")
                        .font(.title2.weight(.bold))
                    Text("火山活動の状況と、防災上警戒すべき範囲を5段階で示します。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("警戒範囲の目安")
                            .font(.headline)
                        Spacer()
                        Text("活動に応じて範囲が広がります")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    GeometryReader { geometry in
                        VStack(alignment: .leading, spacing: 5) {
                            ForEach(volcanoGuideItems) { item in
                                HStack(spacing: 7) {
                                    Text("L\(item.level)")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 24, alignment: .leading)
                                    Text(item.chartKeyword)
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(alertTextColor(item.level))
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.72)
                                        .padding(.horizontal, 8)
                                        .frame(
                                            width: max(82, (geometry.size.width - 31) * item.scope),
                                            height: 26,
                                            alignment: .leading
                                        )
                                        .background(alertColor(item.level))
                                        .clipShape(RoundedRectangle(cornerRadius: 4))
                                        .accessibilityLabel(item.keyword)
                                }
                            }
                        }
                    }
                    .frame(height: 150)
                }
                .padding(14)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("レベル別の行動")
                            .font(.headline)
                        Spacer()
                        Text("対象範囲は火山ごとに異なります")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.bottom, 8)

                    ForEach(volcanoGuideItems) { item in
                        HStack(alignment: .top, spacing: 12) {
                            VStack(spacing: 2) {
                                Text("レベル")
                                    .font(.system(size: 8, weight: .bold))
                                Text("\(item.level)")
                                    .font(.title3.weight(.bold))
                            }
                            .foregroundStyle(alertTextColor(item.level))
                            .frame(width: 48, height: 48)
                            .background(alertColor(item.level))
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                            VStack(alignment: .leading, spacing: 4) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(item.keyword)
                                        .font(.subheadline.weight(.bold))
                                    Spacer()
                                    Text(item.range)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Text(item.action)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 10)
                        if item.level != 1 {
                            Divider()
                        }
                    }
                }
                .padding(14)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 14))

                Text("地図上の▲を選択すると、その火山の発表内容を表示します。噴火警戒レベルを運用していない火山では、警報・予報の表現が異なります。実際の規制や避難対象は、気象庁・自治体等の最新発表に従ってください。")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Link("気象庁の火山情報を開く", destination: MeteoScopeEndpoints.jmaVolcanoInformation)
                    .font(.caption.weight(.semibold))
                Text("出典：気象庁「噴火警報・予報」「噴火警戒レベルの説明」。MeteoScopeが独自に構成しています。")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxHeight: 620)
    }

    private var volcanoGuideItems: [VolcanoLevelGuideItem] {
        [
            .init(level: 5, keyword: "避難", range: "居住地域", action: "危険な居住地域から避難します。対象地域と避難方法は、自治体の指示を確認してください。", scope: 1.00),
            .init(level: 4, keyword: "高齢者等避難", range: "居住地域", action: "高齢者など避難に時間がかかる方は避難し、ほかの住民は避難の準備をします。", scope: 0.88),
            .init(level: 3, keyword: "入山規制", range: "火口から居住地域近くまで", action: "登山禁止や入山規制が行われます。状況により、高齢者などは避難の準備をします。", scope: 0.67),
            .init(level: 2, keyword: "火口周辺規制", range: "火口周辺", action: "火口周辺への立ち入りが規制されます。規制範囲には入らないでください。", scope: 0.45),
            .init(level: 1, keyword: "活火山であることに留意", range: "火口内など", action: "最新の火山情報を確認します。状況により、火口内への立ち入りが規制されます。", scope: 0.28)
        ]
    }
}

private struct VolcanoLevelGuideItem: Identifiable {
    let level: Int
    let keyword: String
    let range: String
    let action: String
    let scope: CGFloat

    var id: Int { level }
    var chartKeyword: String {
        level == 1 ? "活火山に留意" : keyword
    }
}
