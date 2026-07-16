import SwiftUI

struct DisasterQuizView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDifficulty = DisasterQuizDifficulty.beginner
    @State private var questions: [DisasterQuizQuestion] = []
    @State private var currentIndex = 0
    @State private var selectedAnswer: Int?
    @State private var score = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                Group {
                    if questions.isEmpty {
                        difficultySelection
                    } else if currentIndex >= questions.count {
                        resultView
                    } else {
                        questionView(questions[currentIndex])
                    }
                }
                .padding()
            }
            .navigationTitle("防災クイズ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("閉じる") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Text("学習用のクイズです。実際の災害時は、気象庁・自治体などの最新の公式情報を確認してください。")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.bar)
            }
        }
    }

    private var difficultySelection: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("難易度を選んで10問に挑戦")
                    .font(.title3.bold())
                Text("気象庁・内閣府・消防庁の公開情報をもとに、災害時の行動と情報の見方を確認できます。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Picker("難易度", selection: $selectedDifficulty) {
                ForEach(DisasterQuizDifficulty.allCases) { difficulty in
                    Text(difficulty.label).tag(difficulty)
                }
            }
            .pickerStyle(.segmented)

            Label(selectedDifficulty.description, systemImage: difficultySymbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(difficultyColor)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .meteoGlassSurface(cornerRadius: 16, tint: difficultyColor.opacity(0.18))

            Button {
                startQuiz()
            } label: {
                Text("この難易度で始める")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .meteoGlassButton(prominent: true)
            .disabled(DisasterQuizCatalog.questions(for: selectedDifficulty).count < DisasterQuizCatalog.questionCount)
            .accessibilityHint("10問の防災クイズを開始します")
        }
    }

    private func questionView(_ question: DisasterQuizQuestion) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("\(currentIndex + 1) / \(questions.count)")
                Spacer()
                Text("正解 \(score)")
            }
            .font(.caption.monospacedDigit().weight(.bold))
            .foregroundStyle(.secondary)

            ProgressView(value: Double(currentIndex + 1), total: Double(questions.count))
                .tint(difficultyColor)

            Text(question.question)
                .font(.title3.bold())
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { index, choice in
                    Button {
                        chooseAnswer(index, for: question)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: optionSymbol(index: index, question: question))
                                .frame(width: 22)
                            Text(choice)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .multilineTextAlignment(.leading)
                        }
                        .padding(.vertical, 5)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .meteoGlassSurface(
                        cornerRadius: 15,
                        interactive: selectedAnswer == nil,
                        tint: optionTint(index: index, question: question)
                    )
                    .disabled(selectedAnswer != nil)
                    .accessibilityLabel("選択肢\(index + 1)、\(choice)")
                }
            }

            if let selectedAnswer {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        selectedAnswer == question.correctIndex ? "正解です" : "不正解です",
                        systemImage: selectedAnswer == question.correctIndex
                            ? "checkmark.circle.fill" : "xmark.circle.fill"
                    )
                    .font(.headline)
                    .foregroundStyle(selectedAnswer == question.correctIndex ? Color.green : Color.red)

                    Text(question.explanation)
                        .font(.subheadline)

                    Link(destination: question.sourceURL) {
                        Label("出典：\(question.sourceLabel)", systemImage: "arrow.up.right.square")
                            .font(.caption)
                    }

                    Button {
                        advance()
                    } label: {
                        Text(currentIndex + 1 == questions.count ? "結果を見る" : "次の問題")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .meteoGlassButton(prominent: true)
                }
                .padding()
                .meteoGlassSurface(cornerRadius: 18)
            }
        }
    }

    private var resultView: some View {
        VStack(spacing: 18) {
            Image(systemName: score == questions.count ? "trophy.fill" : "checkmark.seal.fill")
                .font(.system(size: 46))
                .foregroundStyle(difficultyColor)
            Text("結果")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("\(score) / \(questions.count)")
                .font(.system(size: 46, weight: .bold, design: .rounded).monospacedDigit())
            Text(resultMessage)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button {
                startQuiz()
            } label: {
                Text("もう一度挑戦")
                    .frame(maxWidth: .infinity)
            }
            .meteoGlassButton(prominent: true)

            Button("難易度を選び直す") {
                questions = []
                currentIndex = 0
                selectedAnswer = nil
                score = 0
            }
            .meteoGlassButton()
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28)
    }

    private var difficultyColor: Color {
        switch selectedDifficulty {
        case .beginner: .blue
        case .intermediate: .orange
        case .advanced: .purple
        }
    }

    private var difficultySymbol: String {
        switch selectedDifficulty {
        case .beginner: "leaf.fill"
        case .intermediate: "shield.fill"
        case .advanced: "brain.head.profile"
        }
    }

    private var resultMessage: String {
        if score == questions.count { return "全問正解です。日頃の備えを続けましょう。" }
        if score >= 7 { return "よくできました。解説を思い出しながら備えを確認しましょう。" }
        return "もう一度挑戦して、避難行動と情報の見方を確認しましょう。"
    }

    private func startQuiz() {
        questions = DisasterQuizCatalog.randomQuestions(for: selectedDifficulty)
        currentIndex = 0
        selectedAnswer = nil
        score = 0
    }

    private func chooseAnswer(_ index: Int, for question: DisasterQuizQuestion) {
        guard selectedAnswer == nil, question.choices.indices.contains(index) else { return }
        selectedAnswer = index
        if index == question.correctIndex { score += 1 }
    }

    private func advance() {
        guard selectedAnswer != nil else { return }
        currentIndex += 1
        selectedAnswer = nil
    }

    private func optionSymbol(index: Int, question: DisasterQuizQuestion) -> String {
        guard let selectedAnswer else { return "circle" }
        if index == question.correctIndex { return "checkmark.circle.fill" }
        if index == selectedAnswer { return "xmark.circle.fill" }
        return "circle"
    }

    private func optionTint(index: Int, question: DisasterQuizQuestion) -> Color? {
        guard let selectedAnswer else { return nil }
        if index == question.correctIndex { return .green.opacity(0.24) }
        if index == selectedAnswer { return .red.opacity(0.2) }
        return nil
    }
}

#Preview("防災クイズ") {
    DisasterQuizView()
}
