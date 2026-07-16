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
        case .beginner: "基本の備えと避難行動"
        case .intermediate: "警戒レベルと災害別の行動"
        case .advanced: "防災情報の意味と仕組み"
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
    static let all: [DisasterQuizQuestion] = loadQuestions()

    static func questions(for difficulty: DisasterQuizDifficulty) -> [DisasterQuizQuestion] {
        all.filter { $0.difficulty == difficulty }
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
