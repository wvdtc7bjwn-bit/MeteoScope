import Foundation

enum DisasterQuizDifficulty: String, CaseIterable, Codable, Identifiable {
    case beginner
    case intermediate
    case advanced

    var id: String { rawValue }

    var label: String {
        switch self {
        case .beginner: "初級"
        case .intermediate: "中級"
        case .advanced: "上級"
        }
    }

    var description: String {
        switch self {
        case .beginner: "基本の備えと天気の基礎"
        case .intermediate: "現行の防災情報と気象の仕組み"
        case .advanced: "気象予報士試験レベルの独自問題"
        }
    }
}

struct DisasterQuizQuestion: Codable, Identifiable, Hashable {
    let id: String
    let difficulty: DisasterQuizDifficulty
    let question: String
    let choices: [String]
    let correctIndex: Int
    let explanation: String
    let sourceLabel: String
    let sourceURL: URL

    var hasValidAnswer: Bool {
        choices.count >= 3 && choices.indices.contains(correctIndex)
    }

    func shufflingChoices() -> DisasterQuizQuestion {
        let shuffled = choices.enumerated().shuffled()
        return DisasterQuizQuestion(
            id: id,
            difficulty: difficulty,
            question: question,
            choices: shuffled.map(\.element),
            correctIndex: shuffled.firstIndex { $0.offset == correctIndex } ?? correctIndex,
            explanation: explanation,
            sourceLabel: sourceLabel,
            sourceURL: sourceURL
        )
    }
}

enum DisasterQuizCatalog {
    static let questionCount = 10
    static let all: [DisasterQuizQuestion] = loadQuestions()

    static func questions(for difficulty: DisasterQuizDifficulty) -> [DisasterQuizQuestion] {
        all.filter { $0.difficulty == difficulty }
    }

    static func randomQuestions(for difficulty: DisasterQuizDifficulty) -> [DisasterQuizQuestion] {
        questions(for: difficulty)
            .shuffled()
            .prefix(questionCount)
            .map { $0.shufflingChoices() }
    }

    static func questions(ids: [String]) -> [DisasterQuizQuestion] {
        guard ids.count == questionCount, Set(ids).count == questionCount else { return [] }
        let catalog = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
        let selected = ids.compactMap { catalog[$0] }
        guard selected.count == questionCount else { return [] }
        return selected.map { $0.shufflingChoices() }
    }

    private static func loadQuestions() -> [DisasterQuizQuestion] {
        let bundles = [Bundle.main, Bundle(for: DisasterQuizResourceLocator.self)]
        guard let url = bundles.lazy.compactMap({
            $0.url(forResource: "disaster-quiz", withExtension: "json")
        }).first,
        let data = try? Data(contentsOf: url),
        let questions = try? JSONDecoder().decode([DisasterQuizQuestion].self, from: data)
        else {
            return []
        }
        return questions
    }
}

private final class DisasterQuizResourceLocator {}
