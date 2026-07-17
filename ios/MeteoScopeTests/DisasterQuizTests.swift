import XCTest
@testable import MeteoScope

final class DisasterQuizTests: XCTestCase {
    func testCatalogContainsFortyValidQuestionsPerDifficulty() {
        XCTAssertEqual(DisasterQuizCatalog.all.count, 120)
        XCTAssertEqual(Set(DisasterQuizCatalog.all.map(\.id)).count, 120)

        for difficulty in DisasterQuizDifficulty.allCases {
            let questions = DisasterQuizCatalog.questions(for: difficulty)
            XCTAssertEqual(questions.count, 40, difficulty.rawValue)
            XCTAssertTrue(questions.allSatisfy(\.hasValidAnswer))
        }
    }

    func testCatalogDoesNotContainRetiredInformationNames() {
        let retiredTerms = [
            "土砂災害警戒情報",
            "相当情報",
            "災害切迫",
            "竜巻注意情報",
            "顕著な大雨に関する気象情報"
        ]
        XCTAssertTrue(DisasterQuizCatalog.all.allSatisfy { question in
            retiredTerms.allSatisfy { !question.question.contains($0) }
        })
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

    func testServerSelectedQuestionIDsKeepOrderAndShuffleChoices() {
        let ids = DisasterQuizCatalog.questions(for: .intermediate).dropFirst(5).prefix(10).map(\.id)
        let selected = DisasterQuizCatalog.questions(ids: ids)

        XCTAssertEqual(selected.map(\.id), ids)
        XCTAssertEqual(selected.count, DisasterQuizCatalog.questionCount)
        XCTAssertEqual(DisasterQuizCatalog.questions(ids: [ids[0]]), [])
        XCTAssertEqual(DisasterQuizCatalog.questions(ids: Array(repeating: ids[0], count: 10)), [])
    }
}
