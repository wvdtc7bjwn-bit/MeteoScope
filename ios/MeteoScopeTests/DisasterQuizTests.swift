import XCTest
@testable import MeteoScope

final class DisasterQuizTests: XCTestCase {
    func testCatalogContainsThirtyValidQuestionsPerDifficulty() {
        XCTAssertEqual(DisasterQuizCatalog.all.count, 90)
        XCTAssertEqual(Set(DisasterQuizCatalog.all.map(\.id)).count, 90)

        for difficulty in DisasterQuizDifficulty.allCases {
            let questions = DisasterQuizCatalog.questions(for: difficulty)
            XCTAssertEqual(questions.count, 30, difficulty.rawValue)
            XCTAssertTrue(questions.allSatisfy(\.hasValidAnswer))
        }
    }

    func testQuizDrawsTenUniqueQuestionsFromSelectedDifficulty() {
        for difficulty in DisasterQuizDifficulty.allCases {
            let questions = DisasterQuizCatalog.randomQuestions(for: difficulty)
            XCTAssertEqual(questions.count, DisasterQuizCatalog.questionCount)
            XCTAssertEqual(Set(questions.map(\.id)).count, DisasterQuizCatalog.questionCount)
            XCTAssertTrue(questions.allSatisfy { $0.difficulty == difficulty })
        }
    }

    func testCatalogUsesOfficialSources() {
        let allowedHosts = Set([
            "www.jma.go.jp",
            "www.data.jma.go.jp",
            "www.bousai.go.jp",
            "www.fdma.go.jp"
        ])
        XCTAssertTrue(DisasterQuizCatalog.all.allSatisfy { question in
            question.sourceURL.scheme == "https" && allowedHosts.contains(question.sourceURL.host ?? "")
        })
    }

    func testChoiceShufflePreservesCorrectAnswer() throws {
        let question = try XCTUnwrap(DisasterQuizCatalog.all.first)
        let correctAnswer = question.choices[question.correctIndex]
        let shuffled = question.shufflingChoices()

        XCTAssertEqual(shuffled.choices[shuffled.correctIndex], correctAnswer)
        XCTAssertEqual(Set(shuffled.choices), Set(question.choices))
    }
}
