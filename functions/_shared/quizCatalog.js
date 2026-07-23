import questions from "../../data/disaster-quiz.json" with { type: "json" };

export const QUIZ_DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced"]);
export const QUIZ_QUESTION_COUNT = 10;

const questionByID = new Map(questions.map((question) => [question.id, question]));

export function isQuizDifficulty(value) {
  return QUIZ_DIFFICULTIES.includes(value);
}

export function createQuizQuestionIDs(difficulty, random = Math.random) {
  if (!isQuizDifficulty(difficulty)) return [];
  const ids = questions.filter((question) => question.difficulty === difficulty).map((question) => question.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids.slice(0, QUIZ_QUESTION_COUNT);
}

export function scoreQuizAnswers(questionIDs, answers) {
  if (!Array.isArray(questionIDs) || !Array.isArray(answers) || questionIDs.length !== QUIZ_QUESTION_COUNT || answers.length !== QUIZ_QUESTION_COUNT) {
    return null;
  }
  let score = 0;
  for (let index = 0; index < questionIDs.length; index += 1) {
    const question = questionByID.get(String(questionIDs[index]));
    const answer = answers[index];
    if (!question || answer?.questionId !== question.id || typeof answer?.answer !== "string") return null;
    if (answer.answer === question.choices[question.correctIndex]) score += 1;
  }
  return score;
}
