// Transcript presentation only. Never streams unvalidated partial answers or
// starts additional requests. All scrolling stays inside the conversation.
export function createWarningChatConversation({viewport, messages, latestButton,
  requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id),
  reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true}) {
  const doc = messages.ownerDocument;
  let pending = null, currentQuestion = null, latestAnswer = null, frame = null, following = true;
  const nearBottom = () => viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 48;
  const cancelScroll = () => { if (frame !== null) cancelFrame(frame); frame = null; };
  function scrollTo(node, force = false) {
    cancelScroll();
    if (!force && !following) return;
    frame = requestFrame(() => {
      frame = null;
      if (!messages.contains(node)) return;
      const top = Math.max(0, viewport.scrollTop + node.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16);
      viewport.scrollTo({top, behavior: reducedMotion() ? "instant" : "smooth"});
    });
  }
  function createMessage(label, text, user) {
    const article = doc.createElement("article");
    article.className = user ? "warning-chat-user-message" : "warning-chat-answer-message";
    article.tabIndex = -1;
    const heading = doc.createElement("strong"); heading.textContent = label;
    const body = doc.createElement("p"); body.textContent = text;
    article.append(heading, body);
    return article;
  }
  function stopPending() {
    pending?.remove(); pending = null;
    messages.setAttribute("aria-busy", "false");
  }
  function addQuestion(label, text) {
    stopPending();
    following = true; latestButton.hidden = true;
    currentQuestion = createMessage(label, text, true);
    messages.append(currentQuestion); scrollTo(currentQuestion, true);
  }
  function startPending() {
    stopPending();
    pending = doc.createElement("article");
    pending.className = "warning-chat-pending";
    // The existing status live region announces this once. The visual dots
    // must not be announced repeatedly by the transcript's live region.
    pending.setAttribute("aria-hidden", "true");
    const label = doc.createElement("span"); label.textContent = "回答を準備しています";
    const dots = doc.createElement("span"); dots.className = "warning-chat-pending-dots";
    for (let i = 0; i < 3; i++) dots.append(doc.createElement("i"));
    pending.append(label, dots); messages.append(pending);
    messages.setAttribute("aria-busy", "true");
    scrollTo(pending);
  }
  function addAnswer(label, text) {
    const follow = following || nearBottom();
    latestAnswer = createMessage(label, text, false);
    if (pending) { pending.replaceWith(latestAnswer); pending = null; }
    else messages.append(latestAnswer);
    messages.setAttribute("aria-busy", "false");
    following = follow; latestButton.hidden = follow;
    scrollTo(latestAnswer);
  }
  function clear({keepCurrentTurn = false} = {}) {
    cancelScroll();
    if (keepCurrentTurn && currentQuestion && messages.contains(currentQuestion)) {
      for (const child of [...messages.children]) if (child !== currentQuestion && child !== pending) child.remove();
      latestAnswer = null;
    } else {
      messages.replaceChildren(); pending = null; currentQuestion = null; latestAnswer = null;
      messages.setAttribute("aria-busy", "false"); following = true;
      viewport.scrollTo({top: 0, behavior: "instant"});
    }
    latestButton.hidden = true;
  }
  function detach() { following = false; cancelScroll(); }
  viewport.addEventListener("wheel", detach, {passive: true});
  viewport.addEventListener("touchmove", detach, {passive: true});
  viewport.addEventListener("pointerdown", detach, {passive: true});
  viewport.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) detach();
  });
  viewport.addEventListener("scroll", () => {
    if (nearBottom()) { following = true; latestButton.hidden = true; }
  }, {passive: true});
  latestButton.addEventListener("click", () => {
    if (!latestAnswer) return;
    following = true; latestButton.hidden = true;
    latestAnswer.focus({preventScroll: true}); scrollTo(latestAnswer, true);
  });
  return {addQuestion, startPending, stopPending, addAnswer, clear};
}
