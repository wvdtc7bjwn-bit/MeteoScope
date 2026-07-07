const FEEDBACK_ENDPOINT = "/api/public/feedback";
const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 1000;

let feedbackModalInitialized = false;

export function setupFeedbackModal() {
  if (feedbackModalInitialized) return;
  feedbackModalInitialized = true;

  const openButton = document.getElementById("feedback-open");
  const modal = document.getElementById("feedback-modal");
  const form = document.getElementById("feedback-form");
  if (!openButton || !modal || !form) return;

  openButton.addEventListener("click", openFeedbackModal);
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-feedback-modal-close]")) closeFeedbackModal();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitFeedback();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFeedbackModal();
  });
}

function openFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  const status = document.getElementById("feedback-status");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  if (status) status.textContent = "";
  window.requestAnimationFrame(() => {
    document.getElementById("feedback-message")?.focus();
  });
}

function closeFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const settingsModal = document.getElementById("settings-modal");
  if (!settingsModal || settingsModal.hidden) document.body.classList.remove("modal-open");
}

async function submitFeedback() {
  const form = document.getElementById("feedback-form");
  const category = document.getElementById("feedback-category");
  const message = document.getElementById("feedback-message");
  const submit = document.getElementById("feedback-submit");
  const status = document.getElementById("feedback-status");
  if (!(form instanceof HTMLFormElement) || !(message instanceof HTMLTextAreaElement)) return;

  const trimmedMessage = message.value.trim();
  if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
    setFeedbackStatus("内容をもう少し入力してください。", "error");
    message.focus();
    return;
  }

  const payload = {
    category: category instanceof HTMLSelectElement ? category.value : "other",
    message: trimmedMessage.slice(0, MAX_MESSAGE_LENGTH),
    page: `${location.pathname}${location.search}`
  };

  if (submit instanceof HTMLButtonElement) submit.disabled = true;
  if (status) status.textContent = "送信しています...";

  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || "送信できませんでした。");
    }
    form.reset();
    setFeedbackStatus("送信しました。ありがとうございます。", "success");
  } catch (error) {
    console.warn("[MeteoScope] feedback submit failed", error);
    setFeedbackStatus("送信できませんでした。時間をおいてもう一度お試しください。", "error");
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
}

function setFeedbackStatus(text, type) {
  const status = document.getElementById("feedback-status");
  if (!status) return;
  status.textContent = text;
  status.dataset.status = type;
}
