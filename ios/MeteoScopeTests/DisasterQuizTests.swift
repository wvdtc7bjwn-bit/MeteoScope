import XCTest
@testable import MeteoScope

final class DisasterQuizTests: XCTestCase {
    func testCatalogContainsTenValidQuestionsPerDifficulty() {
        XCTAssertEqual(DisasterQuizCatalog.all.count, 30)
        XCTAssertEqual(Set(DisasterQuizCatalog.all.map(\.id)).count, 30)

        for difficulty in DisasterQuizDifficulty.allCases {
            let questions = DisasterQuizCatalog.questions(for: difficulty)
            XCTAssertEqual(questions.count, 10, difficulty.rawValue)
            XCTAssertTrue(questions.allSatisfy(\.hasValidAnswer))
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
