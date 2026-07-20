import CoreLocation
import SwiftUI

struct CommunityReportComposerView: View {
    @Environment(\.dismiss) private var dismiss
    let coordinate: CLLocationCoordinate2D?
    let isLoggedIn: Bool
    let reports: CommunityReportModel

    @State private var weather = ""
    @State private var comment = ""
    @State private var sensation = ""
    @State private var temperature = ""
    @State private var hazards: Set<String> = []
    @State private var isSubmitting = false
    @State private var message: String?

    private let weatherOptions = [("sunny", "晴れ"), ("cloudy", "くもり"), ("light-rain", "弱い雨"),
                                  ("heavy-rain", "強い雨"), ("snow", "雪"), ("thunder", "雷"), ("fog", "霧")]
    private let sensationOptions = [("", "未選択"), ("cold", "寒い"), ("cool", "涼しい"),
                                    ("comfortable", "快適"), ("hot", "暑い"), ("very-hot", "非常に暑い")]
    private let hazardOptions = [("flooded-road", "道路冠水"), ("strong-wind", "強風"),
                                 ("poor-visibility", "視界不良"), ("thunder", "雷"), ("slippery", "路面凍結・滑りやすい")]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("80文字以内の短文を添えられます。写真は使用せず、正確な位置は保存しません。端末内で約2km単位に丸めます。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if !isLoggedIn {
                    Section { Label("投稿にはMeteoScopeアカウントへのログインが必要です。", systemImage: "person.crop.circle.badge.exclamationmark") }
                } else if coordinate == nil {
                    Section { Label("地図上部の現在地ボタンで投稿地点を取得してください。", systemImage: "location.slash") }
                }

                Section("現在の様子") {
                    Picker("天気", selection: $weather) {
                        Text("選択してください").tag("")
                        ForEach(weatherOptions, id: \.0) { value, label in Text(label).tag(value) }
                    }
                    Picker("体感", selection: $sensation) {
                        ForEach(sensationOptions, id: \.0) { value, label in Text(label).tag(value) }
                    }
                    TextField("ひとこと（任意・80文字まで）", text: $comment, axis: .vertical)
                        .lineLimit(2...4)
                        .onChange(of: comment) { _, value in
                            if value.count > 80 { comment = String(value.prefix(80)) }
                        }
                    Text("\(comment.count)/80文字・URLや個人情報は入力しないでください")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    TextField("気温（任意、例 24.5）", text: $temperature)
                        .keyboardType(.decimalPad)
                }

                Section("周辺の危険（3つまで）") {
                    ForEach(hazardOptions, id: \.0) { value, label in
                        Toggle(label, isOn: Binding(
                            get: { hazards.contains(value) },
                            set: { enabled in
                                if enabled, hazards.count < 3 { hazards.insert(value) }
                                else if !enabled { hazards.remove(value) }
                            }
                        ))
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting { ProgressView().frame(maxWidth: .infinity) }
                        else { Text("現在地の様子を投稿").frame(maxWidth: .infinity) }
                    }
                    .disabled(!canSubmit)
                    if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
                    Text("投稿は1日12回までです。5時間後に地図から消え、D1からも順次削除されます。緊急通報には使用しないでください。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("現在地の様子を投稿")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } } }
        }
    }

    private var canSubmit: Bool {
        isLoggedIn && coordinate != nil && !weather.isEmpty && !isSubmitting
    }

    private func submit() async {
        guard let coordinate else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await reports.create(draft: CommunityReportDraft(
                weather: weather,
                comment: comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? nil
                    : comment.trimmingCharacters(in: .whitespacesAndNewlines),
                sensation: sensation.isEmpty ? nil : sensation,
                temperature: Double(temperature.replacingOccurrences(of: ",", with: ".")),
                hazards: Array(hazards).sorted(),
                latitude: roundedReportCoordinate(coordinate.latitude),
                longitude: roundedReportCoordinate(coordinate.longitude),
                areaCode: "",
                areaName: "現在地周辺"
            ))
            message = "投稿しました。雨雲レーダーへ反映しました。"
            try? await Task.sleep(for: .milliseconds(700))
            dismiss()
        } catch {
            message = error.localizedDescription
        }
    }

    private func roundedReportCoordinate(_ value: Double) -> Double {
        (value / 0.02).rounded() * 0.02
    }
}
