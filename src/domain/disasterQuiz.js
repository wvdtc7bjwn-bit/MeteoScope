import questions from "../../data/scienceQuizQuestions.js";

export const DISASTER_QUIZ_QUESTION_COUNT = 10;
export const DISASTER_QUIZ_POOL_SIZE = 1000;
export const DISASTER_QUIZ_POOL_SIZE_BY_DIFFICULTY = Object.freeze({
  beginner: 334,
  intermediate: 333,
  advanced: 333
});

export const DISASTER_QUIZ_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "beginner", label: "基礎", description: "大学導入レベルの大気・地球物理" }),
  Object.freeze({ id: "intermediate", label: "標準", description: "学部基礎の総観気象・宇宙天気" }),
  Object.freeze({ id: "advanced", label: "発展", description: "大気力学・数値予報・宇宙環境" })
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
    if (count !== DISASTER_QUIZ_POOL_SIZE_BY_DIFFICULTY[difficulty.id]) {
      errors.push(`invalid_question_count:${difficulty.id}:${count}`);
    }
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

export function disasterQuizQuestionsByIDs(ids, random = Math.random) {
  if (!Array.isArray(ids) || ids.length !== DISASTER_QUIZ_QUESTION_COUNT || new Set(ids).size !== ids.length) return [];
  const byID = new Map(questions.map((question) => [question.id, question]));
  const selected = ids.map((id) => byID.get(String(id)));
  if (selected.some((question) => !question)) return [];
  return selected.map((question) => shuffleQuestionChoices({ ...question, choices: [...question.choices] }, random));
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
      hostname === "science.nasa.gov" || hostname === "www.swpc.noaa.gov";
  }
  catch {
    return false;
  }
}
