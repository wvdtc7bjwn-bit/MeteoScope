import SwiftUI

struct DisasterQuizView: View {
    private enum AuthMode: String, CaseIterable, Identifiable {
        case login
        case register
        var id: String { rawValue }
        var label: String { self == .login ? "ログイン" : "新規作成" }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var ranking = QuizRankingModel()
    @State private var selectedDifficulty = DisasterQuizDifficulty.beginner
    @State private var questions: [DisasterQuizQuestion] = []
    @State private var currentIndex = 0
    @State private var selectedAnswer: Int?
    @State private var score = 0
    @State private var challengeID: String?
    @State private var submittedAnswers: [QuizRankingAnswer?] = []
    @State private var rankingResultMessage = ""
    @State private var isStarting = false
    @State private var authMode = AuthMode.login
    @State private var username = ""
    @State private var displayName = ""
    @State private var password = ""
    @State private var deletePassword = ""
    @State private var confirmAccountDeletion = false

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
            .task { await ranking.refresh(difficulty: selectedDifficulty) }
            .onChange(of: selectedDifficulty) { _, difficulty in
                Task { await ranking.refresh(difficulty: difficulty) }
            }
            .confirmationDialog(
                "アカウントとすべてのクイズ記録を完全に削除しますか？",
                isPresented: $confirmAccountDeletion,
                titleVisibility: .visible
            ) {
                Button("完全に削除", role: .destructive) {
                    Task {
                        await ranking.deleteAccount(password: deletePassword, difficulty: selectedDifficulty)
                        deletePassword = ""
                    }
                }
                Button("キャンセル", role: .cancel) {}
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

            accountSection
            leaderboardSection

            Button {
                Task { await startQuiz() }
            } label: {
                if isStarting {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("この難易度で始める")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
            }
            .meteoGlassButton(prominent: true)
            .disabled(isStarting || DisasterQuizCatalog.questions(for: selectedDifficulty).count < DisasterQuizCatalog.questionCount)
            .accessibilityHint("10問の防災クイズを開始します")
        }
    }

    @ViewBuilder
    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ランキング参加").font(.caption2).foregroundStyle(.secondary)
                    Text("MeteoScopeアカウント")
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                Spacer()
                if ranking.account != nil {
                    Button("ログアウト") {
                        Task { await ranking.logout(difficulty: selectedDifficulty) }
                    }
                    .buttonStyle(.bordered)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                }
            }

            if !ranking.enabled {
                Text(ranking.message ?? "ランキング基盤の状態を確認しています。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let account = ranking.account {
                Label("\(account.displayName) でログイン中", systemImage: "person.crop.circle.fill.badge.checkmark")
                    .font(.subheadline.weight(.semibold))
                Text("正解1問を1点として、結果を本日の難易度別合計得点へ加算します。")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                DisclosureGroup("アカウントと記録を削除") {
                    VStack(spacing: 10) {
                        SecureField("確認用パスワード", text: $deletePassword)
                            .textContentType(.password)
                            .textFieldStyle(.roundedBorder)
                        Button("完全に削除", role: .destructive) {
                            confirmAccountDeletion = true
                        }
                        .disabled(deletePassword.count < 10)
                    }
                    .padding(.top, 8)
                }
                .font(.caption)
            } else {
                Text("ログインするとWeb版とiOS版で同じランキングに参加できます。")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Picker("アカウント操作", selection: $authMode) {
                    ForEach(AuthMode.allCases) { mode in Text(mode.label).tag(mode) }
                }
                .pickerStyle(.segmented)

                TextField("アカウントID（半角英数字と_）", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textContentType(.username)
                    .textFieldStyle(.roundedBorder)

                if authMode == .register {
                    TextField("ランキング表示名", text: $displayName)
                        .textContentType(.nickname)
                        .textFieldStyle(.roundedBorder)
                }

                SecureField("パスワード（10文字以上）", text: $password)
                    .textContentType(authMode == .register ? .newPassword : .password)
                    .textFieldStyle(.roundedBorder)

                if authMode == .register {
                    Text("表示名・当日の合計得点・難易度・達成日はランキングで公開されます。アカウントIDは公開されません。")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Link("プライバシーポリシーを確認", destination: MeteoScopeEndpoints.privacyPolicy)
                        .font(.caption)
                }

                Button(authMode == .register ? "アカウントを作成" : "ログイン") {
                    Task { await authenticate() }
                }
                .meteoGlassButton(prominent: true)
                .disabled(ranking.isLoading || username.count < 4 || password.count < 10 || (authMode == .register && displayName.count < 2))
            }

            if let message = ranking.message, ranking.enabled {
                Text(message).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18)
    }

    private var leaderboardSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(selectedDifficulty.label)・本日").font(.caption2).foregroundStyle(.secondary)
                    Text("合計得点ランキング").font(.headline)
                }
                Spacer()
                Button {
                    Task { await ranking.refresh(difficulty: selectedDifficulty) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("ランキングを更新")
            }

            if let current = ranking.currentUser {
                Text("あなたの本日順位：\(current.rank)位・\(current.points)点")
                    .font(.caption.weight(.semibold))
            }

            if ranking.isLoading && ranking.entries.isEmpty {
                ProgressView("ランキングを取得中")
                    .font(.caption)
            } else if ranking.entries.isEmpty {
                Text(ranking.enabled ? "まだ記録がありません。" : "ランキング基盤は現在準備中です。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(ranking.entries) { entry in
                    HStack(spacing: 10) {
                        Text("\(entry.rank)位")
                            .font(.caption.bold().monospacedDigit())
                            .frame(width: 36, alignment: .leading)
                        Text(entry.displayName)
                            .font(.subheadline.weight(entry.isCurrentUser ? .bold : .regular))
                            .lineLimit(1)
                        Spacer()
                        Text("\(entry.points)点")
                            .font(.subheadline.bold().monospacedDigit())
                        Text(formattedDate(entry.completedAt))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    if entry.id != ranking.entries.last?.id { Divider() }
                }
            }
        }
        .padding()
        .meteoGlassSurface(cornerRadius: 18, tint: difficultyColor.opacity(0.1))
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
                            Image(systemName: optionSymbol(index: index, question: question)).frame(width: 22)
                            Text(choice).frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
                        }
                        .padding(.vertical, 5)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .meteoGlassSurface(cornerRadius: 15, interactive: selectedAnswer == nil, tint: optionTint(index: index, question: question))
                    .disabled(selectedAnswer != nil)
                    .accessibilityLabel("選択肢\(index + 1)、\(choice)")
                }
            }

            if let selectedAnswer {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        selectedAnswer == question.correctIndex ? "正解です" : "不正解です",
                        systemImage: selectedAnswer == question.correctIndex ? "checkmark.circle.fill" : "xmark.circle.fill"
                    )
                    .font(.headline)
                    .foregroundStyle(selectedAnswer == question.correctIndex ? Color.green : Color.red)
                    Text(question.explanation).font(.subheadline)
                    Link(destination: question.sourceURL) {
                        Label("出典：\(question.sourceLabel)", systemImage: "arrow.up.right.square").font(.caption)
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
            Text("結果").font(.headline).foregroundStyle(.secondary)
            Text("\(score) / \(questions.count)")
                .font(.system(size: 46, weight: .bold, design: .rounded).monospacedDigit())
            Text(resultMessage).multilineTextAlignment(.center).foregroundStyle(.secondary)
            if !rankingResultMessage.isEmpty {
                Text(rankingResultMessage)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            Button { Task { await startQuiz() } } label: {
                Text("もう一度挑戦").frame(maxWidth: .infinity)
            }
            .meteoGlassButton(prominent: true)
            Button("難易度を選び直す") { resetToDifficultySelection() }.meteoGlassButton()
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

    private func authenticate() async {
        if authMode == .register {
            await ranking.register(username: username, displayName: displayName, password: password, difficulty: selectedDifficulty)
        } else {
            await ranking.login(username: username, password: password, difficulty: selectedDifficulty)
        }
        if ranking.account != nil {
            username = ""
            displayName = ""
            password = ""
        }
    }

    private func startQuiz() async {
        isStarting = true
        defer { isStarting = false }
        challengeID = nil
        rankingResultMessage = ""
        if let challenge = await ranking.challenge(difficulty: selectedDifficulty) {
            let selected = DisasterQuizCatalog.questions(ids: challenge.questionIDs)
            if selected.count == DisasterQuizCatalog.questionCount {
                challengeID = challenge.challengeID
                questions = selected
            }
        }
        if questions.isEmpty || challengeID == nil {
            questions = DisasterQuizCatalog.randomQuestions(for: selectedDifficulty)
        }
        currentIndex = 0
        selectedAnswer = nil
        score = 0
        submittedAnswers = Array(repeating: nil, count: questions.count)
    }

    private func chooseAnswer(_ index: Int, for question: DisasterQuizQuestion) {
        guard selectedAnswer == nil, question.choices.indices.contains(index) else { return }
        selectedAnswer = index
        submittedAnswers[currentIndex] = QuizRankingAnswer(questionId: question.id, answer: question.choices[index])
        if index == question.correctIndex { score += 1 }
    }

    private func advance() {
        guard selectedAnswer != nil else { return }
        currentIndex += 1
        selectedAnswer = nil
        if currentIndex >= questions.count { Task { await recordRanking() } }
    }

    private func recordRanking() async {
        guard ranking.account != nil else {
            rankingResultMessage = "ランキングへ記録するにはアカウントでログインしてください。"
            return
        }
        guard let challengeID, submittedAnswers.allSatisfy({ $0 != nil }) else {
            rankingResultMessage = "今回はランキング対象外です。通信状態を確認して再挑戦してください。"
            return
        }
        rankingResultMessage = "ランキングへ記録しています…"
        if let result = await ranking.submit(
            challengeID: challengeID,
            answers: submittedAnswers.compactMap { $0 },
            difficulty: selectedDifficulty
        ) {
            rankingResultMessage = "サーバー採点で\(result.pointsEarned)点を本日の合計へ加算しました。"
        } else {
            rankingResultMessage = ranking.message ?? "ランキングへ記録できませんでした。"
        }
    }

    private func resetToDifficultySelection() {
        questions = []
        currentIndex = 0
        selectedAnswer = nil
        score = 0
        challengeID = nil
        submittedAnswers = []
        rankingResultMessage = ""
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

    private func formattedDate(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return "-" }
        return date.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits))
    }
}

#Preview("防災クイズ") {
    DisasterQuizView()
}
