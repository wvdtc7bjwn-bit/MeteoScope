import {
  DISASTER_QUIZ_DIFFICULTIES,
  disasterQuizQuestionsByIDs,
  shuffledDisasterQuizQuestions
} from "../domain/disasterQuiz.js";
import { QuizRankingClient } from "../domain/quizRankingClient.js";

let initialized = false;
let selectedDifficulty = "beginner";
let quizQuestions = [];
let currentIndex = 0;
let score = 0;
let answeredIndex = null;
let challengeID = null;
let submittedAnswers = [];
let rankingSubmissionStarted = false;
let rankingEnabled = false;
let account = null;
let authMode = "login";

export function setupDisasterQuizModal() {
  if (initialized) return;
  initialized = true;
  const modal = document.getElementById("disaster-quiz-modal");
  const openButton = document.getElementById("disaster-quiz-button");
  if (!modal || !openButton) return;
  openButton.addEventListener("click", openModal);
  modal.addEventListener("click", handleModalClick);
  document.getElementById("quiz-login-form")?.addEventListener("submit", login);
  document.getElementById("quiz-register-form")?.addEventListener("submit", register);
  document.getElementById("quiz-delete-form")?.addEventListener("submit", deleteAccount);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  renderDifficultySelection();
  void refreshAccountState();
}

export function openDisasterQuizModal() {
  openModal();
}

function handleModalClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-disaster-quiz-close]")) return closeModal();
  const difficultyButton = event.target.closest("[data-quiz-difficulty]");
  if (difficultyButton instanceof HTMLButtonElement) {
    selectedDifficulty = difficultyButton.dataset.quizDifficulty || "beginner";
    return renderDifficultySelection();
  }
  const authModeButton = event.target.closest("[data-quiz-auth-mode]");
  if (authModeButton instanceof HTMLButtonElement) {
    authMode = authModeButton.dataset.quizAuthMode === "register" ? "register" : "login";
    return renderAccountState();
  }
  if (event.target.closest("[data-quiz-logout]")) return void logout();
  if (event.target.closest("[data-quiz-ranking-refresh]")) return void refreshLeaderboard();
  if (event.target.closest("[data-quiz-start]")) return void startQuiz();
  const choiceButton = event.target.closest("[data-quiz-choice]");
  if (choiceButton instanceof HTMLButtonElement) return selectAnswer(Number(choiceButton.dataset.quizChoice));
  if (event.target.closest("[data-quiz-next]")) return advanceQuiz();
  if (event.target.closest("[data-quiz-retry]")) return void startQuiz();
  if (event.target.closest("[data-quiz-change-difficulty]")) renderDifficultySelection();
}

function openModal() {
  const modal = document.getElementById("disaster-quiz-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  void refreshAccountState();
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
    button.setAttribute("aria-pressed", String(selectedDifficulty === difficulty.id));
    const title = document.createElement("strong");
    title.textContent = difficulty.label;
    const description = document.createElement("span");
    description.textContent = difficulty.description;
    button.append(title, description);
    return button;
  }));
  const selected = DISASTER_QUIZ_DIFFICULTIES.find((item) => item.id === selectedDifficulty);
  setText("quiz-leaderboard-difficulty", `${selected?.label ?? "初級"}・本日`);
  void refreshLeaderboard();
}

async function startQuiz() {
  setStartBusy(true);
  challengeID = null;
  submittedAnswers = [];
  rankingSubmissionStarted = false;
  setText("quiz-result-ranking", "");
  try {
    if (account && rankingEnabled) {
      const challenge = await QuizRankingClient.challenge(selectedDifficulty);
      const challengeQuestions = disasterQuizQuestionsByIDs(challenge.questionIDs);
      if (challengeQuestions.length === 10) {
        challengeID = challenge.challengeID;
        quizQuestions = challengeQuestions;
      }
    }
  } catch (error) {
    setAccountMessage(error.message);
  }
  if (!quizQuestions.length || !challengeID) quizQuestions = shuffledDisasterQuizQuestions(selectedDifficulty);
  currentIndex = 0;
  score = 0;
  answeredIndex = null;
  setStartBusy(false);
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
  if (feedback) {
    feedback.hidden = true;
    delete feedback.dataset.result;
  }
  window.requestAnimationFrame(() => choices?.querySelector("button")?.focus());
}

function selectAnswer(index) {
  const question = quizQuestions[currentIndex];
  if (!question || answeredIndex !== null || !Number.isInteger(index) || index < 0 || index >= question.choices.length) return;
  answeredIndex = index;
  submittedAnswers[currentIndex] = { questionId: question.id, answer: question.choices[index] };
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
  if (feedback) {
    feedback.hidden = false;
    feedback.dataset.result = isCorrect ? "correct" : "incorrect";
  }
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
  const message = score === quizQuestions.length
    ? "全問正解です。日頃の備えを続けましょう。"
    : score >= 7
      ? "よくできました。解説を思い出しながら備えを確認しましょう。"
      : "もう一度挑戦して、避難行動と情報の見方を確認しましょう。";
  setText("quiz-result-message", message);
  if (!account) setText("quiz-result-ranking", "ランキングへ記録するにはアカウントでログインしてください。");
  else if (!challengeID) setText("quiz-result-ranking", "今回はランキング対象外です。通信状態を確認して再挑戦してください。");
  else if (!rankingSubmissionStarted) void submitRanking();
  window.requestAnimationFrame(() => document.querySelector("[data-quiz-retry]")?.focus());
}

async function submitRanking() {
  rankingSubmissionStarted = true;
  setText("quiz-result-ranking", "ランキングへ記録しています…");
  try {
    const result = await QuizRankingClient.submit(challengeID, submittedAnswers);
    setText("quiz-result-ranking", `サーバー採点で${result.pointsEarned ?? result.score}点を本日の合計へ加算しました。`);
    await refreshLeaderboard();
  } catch (error) {
    setText("quiz-result-ranking", error.message);
  }
}

async function refreshAccountState() {
  try {
    const config = await QuizRankingClient.configuration();
    rankingEnabled = config.enabled === true;
    if (rankingEnabled) {
      const result = await QuizRankingClient.account();
      account = result.authenticated ? result.account : null;
    } else account = null;
  } catch (error) {
    rankingEnabled = false;
    account = null;
    setAccountMessage(error.message);
  }
  renderAccountState();
  void refreshLeaderboard();
}

function renderAccountState() {
  const authPanel = document.getElementById("quiz-auth-panel");
  const logoutButton = document.querySelector("[data-quiz-logout]");
  const deletePanel = document.getElementById("quiz-account-delete");
  if (!rankingEnabled) {
    setText("quiz-account-summary", "ランキング基盤は現在準備中です。クイズはそのまま利用できます。");
    if (authPanel) authPanel.hidden = true;
    if (logoutButton instanceof HTMLElement) logoutButton.hidden = true;
    if (deletePanel) deletePanel.hidden = true;
    return;
  }
  if (account) {
    setText("quiz-account-summary", `${account.displayName} でログイン中です。結果はサーバー採点後に記録されます。`);
    if (authPanel) authPanel.hidden = true;
    if (logoutButton instanceof HTMLElement) logoutButton.hidden = false;
    if (deletePanel) deletePanel.hidden = false;
    return;
  }
  setText("quiz-account-summary", "ログインするとWeb版とiOS版で同じランキングに参加できます。");
  if (authPanel) authPanel.hidden = false;
  if (logoutButton instanceof HTMLElement) logoutButton.hidden = true;
  if (deletePanel) deletePanel.hidden = true;
  document.querySelectorAll("[data-quiz-auth-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.getAttribute("data-quiz-auth-mode") === authMode));
  });
  const loginForm = document.getElementById("quiz-login-form");
  const registerForm = document.getElementById("quiz-register-form");
  if (loginForm) loginForm.hidden = authMode !== "login";
  if (registerForm) registerForm.hidden = authMode !== "register";
}

async function login(event) {
  event.preventDefault();
  if (!(event.currentTarget instanceof HTMLFormElement)) return;
  await authenticateWithForm(event.currentTarget, "login");
}

async function register(event) {
  event.preventDefault();
  if (!(event.currentTarget instanceof HTMLFormElement)) return;
  await authenticateWithForm(event.currentTarget, "register");
}

async function authenticateWithForm(form, action) {
  setAuthBusy(true);
  setAccountMessage("");
  const values = Object.fromEntries(new FormData(form));
  try {
    const result = action === "register"
      ? await QuizRankingClient.register(values)
      : await QuizRankingClient.login(values);
    account = result.account;
    form.reset();
    setAccountMessage(action === "register" ? "アカウントを作成しました。" : "ログインしました。");
    renderAccountState();
    await refreshLeaderboard();
  } catch (error) {
    setAccountMessage(error.message);
  } finally {
    setAuthBusy(false);
  }
}

async function logout() {
  setAuthBusy(true);
  try {
    await QuizRankingClient.logout();
    account = null;
    setAccountMessage("ログアウトしました。");
  } catch (error) {
    setAccountMessage(error.message);
  } finally {
    setAuthBusy(false);
    renderAccountState();
    void refreshLeaderboard();
  }
}

async function deleteAccount(event) {
  event.preventDefault();
  if (!(event.currentTarget instanceof HTMLFormElement)) return;
  if (!window.confirm("アカウントとすべてのクイズ記録を完全に削除しますか？")) return;
  const password = String(new FormData(event.currentTarget).get("password") ?? "");
  setAuthBusy(true);
  try {
    await QuizRankingClient.deleteAccount(password);
    account = null;
    event.currentTarget.reset();
    setAccountMessage("アカウントと記録を削除しました。");
  } catch (error) {
    setAccountMessage(error.message);
  } finally {
    setAuthBusy(false);
    renderAccountState();
    void refreshLeaderboard();
  }
}

async function refreshLeaderboard() {
  const requestedDifficulty = selectedDifficulty;
  const list = document.getElementById("quiz-leaderboard-list");
  const empty = document.getElementById("quiz-leaderboard-empty");
  list?.replaceChildren();
  if (empty) {
    empty.hidden = false;
    empty.textContent = rankingEnabled ? "ランキングを取得しています。" : "ランキング基盤は現在準備中です。";
  }
  setText("quiz-current-rank", "");
  if (!rankingEnabled) return;
  try {
    const result = await QuizRankingClient.leaderboard(requestedDifficulty);
    if (requestedDifficulty !== selectedDifficulty) return;
    const entries = Array.isArray(result.entries) ? result.entries : [];
    list?.replaceChildren(...entries.map(createLeaderboardItem));
    if (empty) {
      empty.hidden = entries.length > 0;
      empty.textContent = "まだ記録がありません。最初の挑戦者になりましょう。";
    }
    if (result.currentUser) {
      setText("quiz-current-rank", `あなたの本日順位：${result.currentUser.rank}位・${result.currentUser.points}点`);
    }
  } catch (error) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = error.message;
    }
  }
}

function createLeaderboardItem(entry) {
  const item = document.createElement("li");
  if (entry.isCurrentUser) item.classList.add("is-current-user");
  const rank = document.createElement("strong");
  rank.textContent = `${entry.rank}位`;
  const name = document.createElement("span");
  name.textContent = entry.displayName;
  const scoreText = document.createElement("b");
  scoreText.textContent = `${entry.points}点`;
  const date = document.createElement("time");
  date.dateTime = entry.completedAt;
  date.textContent = formatDate(entry.completedAt);
  item.append(rank, name, scoreText, date);
  return item;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function setStartBusy(isBusy) {
  document.querySelectorAll("[data-quiz-start], [data-quiz-retry]").forEach((button) => {
    if (button instanceof HTMLButtonElement) button.disabled = isBusy;
  });
}

function setAuthBusy(isBusy) {
  document.querySelectorAll("#quiz-auth-panel button, #quiz-account-delete button, [data-quiz-logout]").forEach((button) => {
    if (button instanceof HTMLButtonElement) button.disabled = isBusy;
  });
}

function setAccountMessage(message) {
  setText("quiz-account-message", message);
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
