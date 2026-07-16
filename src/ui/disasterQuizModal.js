import {
  DISASTER_QUIZ_DIFFICULTIES,
  shuffledDisasterQuizQuestions
} from "../domain/disasterQuiz.js";

let initialized = false;
let selectedDifficulty = "beginner";
let quizQuestions = [];
let currentIndex = 0;
let score = 0;
let answeredIndex = null;

export function setupDisasterQuizModal() {
  if (initialized) return;
  initialized = true;
  const modal = document.getElementById("disaster-quiz-modal");
  const openButton = document.getElementById("disaster-quiz-button");
  if (!modal || !openButton) return;
  openButton.addEventListener("click", openModal);
  modal.addEventListener("click", handleModalClick);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  renderDifficultySelection();
}

function handleModalClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-disaster-quiz-close]")) return closeModal();
  const difficultyButton = event.target.closest("[data-quiz-difficulty]");
  if (difficultyButton instanceof HTMLButtonElement) {
    selectedDifficulty = difficultyButton.dataset.quizDifficulty || "beginner";
    return renderDifficultySelection();
  }
  if (event.target.closest("[data-quiz-start]")) return startQuiz();
  const choiceButton = event.target.closest("[data-quiz-choice]");
  if (choiceButton instanceof HTMLButtonElement) return selectAnswer(Number(choiceButton.dataset.quizChoice));
  if (event.target.closest("[data-quiz-next]")) return advanceQuiz();
  if (event.target.closest("[data-quiz-retry]")) return startQuiz();
  if (event.target.closest("[data-quiz-change-difficulty]")) renderDifficultySelection();
}

function openModal() {
  const modal = document.getElementById("disaster-quiz-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => modal.querySelector("button:not([hidden])")?.focus());
}

function closeModal() {
  const modal = document.getElementById("disaster-quiz-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
  document.getElementById("disaster-quiz-button")?.focus();
}

function renderDifficultySelection() {
  showView("quiz-start-view");
  const container = document.getElementById("quiz-difficulty-options");
  if (!container) return;
  container.replaceChildren(...DISASTER_QUIZ_DIFFICULTIES.map((difficulty) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "disaster-quiz-difficulty";
    button.dataset.quizDifficulty = difficulty.id;
    button.dataset.difficulty = difficulty.id;
    button.setAttribute("aria-pressed", String(selectedDifficulty === difficulty.id));
    const title = document.createElement("strong");
    title.textContent = difficulty.label;
    const description = document.createElement("span");
    description.textContent = difficulty.description;
    button.append(title, description);
    return button;
  }));
}

function startQuiz() {
  quizQuestions = shuffledDisasterQuizQuestions(selectedDifficulty);
  currentIndex = 0;
  score = 0;
  answeredIndex = null;
  renderQuestion();
}

function renderQuestion() {
  const question = quizQuestions[currentIndex];
  if (!question) return renderResult();
  showView("quiz-question-view");
  setText("quiz-progress", `${currentIndex + 1} / ${quizQuestions.length}`);
  setText("quiz-score", `正解 ${score}`);
  setText("quiz-question", question.question);
  const progressBar = document.getElementById("quiz-progress-bar");
  if (progressBar instanceof HTMLElement) progressBar.style.width = `${((currentIndex + 1) / quizQuestions.length) * 100}%`;
  const choices = document.getElementById("quiz-choices");
  choices?.replaceChildren(...question.choices.map((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "disaster-quiz-choice";
    button.dataset.quizChoice = String(index);
    button.textContent = choice;
    return button;
  }));
  const feedback = document.getElementById("quiz-feedback");
  if (feedback) feedback.hidden = true;
  window.requestAnimationFrame(() => choices?.querySelector("button")?.focus());
}

function selectAnswer(index) {
  const question = quizQuestions[currentIndex];
  if (!question || answeredIndex !== null || !Number.isInteger(index)) return;
  answeredIndex = index;
  const isCorrect = index === question.correctIndex;
  if (isCorrect) score += 1;
  document.querySelectorAll("#quiz-choices [data-quiz-choice]").forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) return;
    const choiceIndex = Number(element.dataset.quizChoice);
    element.disabled = true;
    if (choiceIndex === question.correctIndex) element.classList.add("is-correct");
    if (choiceIndex === index && !isCorrect) element.classList.add("is-incorrect");
  });
  const feedback = document.getElementById("quiz-feedback");
  if (feedback) feedback.hidden = false;
  setText("quiz-feedback-title", isCorrect ? "正解です" : "不正解です");
  const title = document.getElementById("quiz-feedback-title");
  if (title) title.dataset.result = isCorrect ? "correct" : "incorrect";
  setText("quiz-explanation", question.explanation);
  const source = document.getElementById("quiz-source");
  if (source instanceof HTMLAnchorElement) {
    source.textContent = `出典：${question.sourceLabel}`;
    source.href = question.sourceURL;
  }
  const next = document.querySelector("[data-quiz-next]");
  if (next instanceof HTMLButtonElement) {
    next.textContent = currentIndex + 1 === quizQuestions.length ? "結果を見る" : "次の問題";
    next.focus();
  }
}

function advanceQuiz() {
  if (answeredIndex === null) return;
  currentIndex += 1;
  answeredIndex = null;
  if (currentIndex >= quizQuestions.length) renderResult();
  else renderQuestion();
}

function renderResult() {
  showView("quiz-result-view");
  setText("quiz-result-score", `${score} / ${quizQuestions.length}`);
  const message = score === 10
    ? "全問正解です。日頃の備えを続けましょう。"
    : score >= 7
      ? "よくできました。解説を思い出しながら備えを確認しましょう。"
      : "もう一度挑戦して、避難行動と情報の見方を確認しましょう。";
  setText("quiz-result-message", message);
  window.requestAnimationFrame(() => document.querySelector("[data-quiz-retry]")?.focus());
}

function showView(id) {
  for (const viewID of ["quiz-start-view", "quiz-question-view", "quiz-result-view"]) {
    const view = document.getElementById(viewID);
    if (view) view.hidden = viewID !== id;
  }
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}
