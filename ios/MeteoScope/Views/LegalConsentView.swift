import SwiftUI

struct LegalConsentView: View {
    @State private var acceptsTerms = false
    @State private var acceptsPrivacy = false

    let onAccept: () -> Void

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MeteoScope")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text("はじめに")
                            .font(.title.bold())
                    }

                    Text("ご利用前に、利用規約とプライバシーポリシーをご確認ください。本アプリは気象庁などの行政機関が提供する公式アプリではありません。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(spacing: 0) {
                        legalLink("利用規約", destination: MeteoScopeEndpoints.termsOfUse)
                        Divider()
                        legalLink("プライバシーポリシー", destination: MeteoScopeEndpoints.privacyPolicy)
                    }
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

                    VStack(spacing: 0) {
                        Toggle("利用規約を確認し、同意します", isOn: $acceptsTerms)
                            .padding(.vertical, 11)
                        Divider()
                        Toggle("プライバシーポリシーを確認し、同意します", isOn: $acceptsPrivacy)
                            .padding(.vertical, 11)
                    }
                    .font(.subheadline.weight(.medium))

                    Text("同意しない場合はMeteoScopeを利用できません。同意状態はこの端末に保存されます。")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Button("同意して利用を開始", action: onAccept)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .frame(maxWidth: .infinity)
                        .disabled(!(acceptsTerms && acceptsPrivacy))
                }
                .padding(24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityAddTraits(.isModal)
    }

    private func legalLink(_ title: String, destination: URL) -> some View {
        Link(destination: destination) {
            HStack {
                Text(title)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.primary)
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview("Legal consent") {
    LegalConsentView(onAccept: {})
}
