import questions from "../../ios/MeteoScope/Resources/disaster-quiz.json" with { type: "json" };

export const DISASTER_QUIZ_QUESTION_COUNT = 10;
export const DISASTER_QUIZ_POOL_SIZE = 30;

export const DISASTER_QUIZ_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "beginner", label: "初級", description: "基本の備えと避難行動" }),
  Object.freeze({ id: "intermediate", label: "中級", description: "警戒レベルと災害別の行動" }),
  Object.freeze({ id: "advanced", label: "上級", description: "防災情報の意味と仕組み" })
]);

const difficultyIDs = new Set(DISASTER_QUIZ_DIFFICULTIES.map((item) => item.id));

export function validateDisasterQuizQuestions(items = questions) {
  const errors = [];
  const ids = new Set();
  const questionTexts = new Set();
  for (const item of items) {
    if (!item?.id || ids.has(item.id)) errors.push(`invalid_or_duplicate_id:${item?.id ?? ""}`);
    ids.add(item?.id);
    if (!difficultyIDs.has(item?.difficulty)) errors.push(`invalid_difficulty:${item?.id ?? ""}`);
    if (!Array.isArray(item?.choices) || item.choices.length < 3) errors.push(`invalid_choices:${item?.id ?? ""}`);
    if (Array.isArray(item?.choices) && new Set(item.choices).size !== item.choices.length) {
      errors.push(`duplicate_choices:${item?.id ?? ""}`);
    }
    if (!Number.isInteger(item?.correctIndex) || item.correctIndex < 0 || item.correctIndex >= (item.choices?.length ?? 0)) {
      errors.push(`invalid_correct_index:${item?.id ?? ""}`);
    }
    if (!item?.question || !item?.explanation || !item?.sourceLabel || !isOfficialSourceURL(item?.sourceURL)) {
      errors.push(`missing_content_or_source:${item?.id ?? ""}`);
    }
    if (item?.question && questionTexts.has(item.question)) errors.push(`duplicate_question:${item.id ?? ""}`);
    questionTexts.add(item?.question);
  }
  for (const difficulty of DISASTER_QUIZ_DIFFICULTIES) {
    const count = items.filter((item) => item.difficulty === difficulty.id).length;
    if (count !== DISASTER_QUIZ_POOL_SIZE) errors.push(`invalid_question_count:${difficulty.id}:${count}`);
  }
  return errors;
}

export function getDisasterQuizQuestions(difficulty) {
  if (!difficultyIDs.has(difficulty)) return [];
  return questions.filter((item) => item.difficulty === difficulty).map((item) => ({ ...item, choices: [...item.choices] }));
}

export function shuffledDisasterQuizQuestions(difficulty, random = Math.random) {
  const result = getDisasterQuizQuestions(difficulty);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result
    .slice(0, DISASTER_QUIZ_QUESTION_COUNT)
    .map((question) => shuffleQuestionChoices(question, random));
}

function shuffleQuestionChoices(question, random) {
  const choices = question.choices.map((choice, originalIndex) => ({ choice, originalIndex }));
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  return {
    ...question,
    choices: choices.map((item) => item.choice),
    correctIndex: choices.findIndex((item) => item.originalIndex === question.correctIndex)
  };
}

function isOfficialSourceURL(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "www.jma.go.jp" || hostname === "www.data.jma.go.jp" ||
      hostname === "www.bousai.go.jp" || hostname === "www.fdma.go.jp";
  }
  catch {
    return false;
  }
}
