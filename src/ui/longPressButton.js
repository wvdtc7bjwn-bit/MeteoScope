export function setupLongPressButton(element, options = {}) {
  if (!element) return () => {};

  const onPress = typeof options.onPress === "function" ? options.onPress : () => {};
  const onLongPress = typeof options.onLongPress === "function" ? options.onLongPress : () => {};
  const duration = Number.isFinite(options.duration) ? options.duration : 650;
  const moveTolerance = Number.isFinite(options.moveTolerance) ? options.moveTolerance : 10;
  let timer = null;
  let pointerId = null;
  let startPoint = null;
  let longPressTriggered = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function resetPress() {
    clearTimer();
    pointerId = null;
    startPoint = null;
    element.classList.remove("pressing");
  }

  function handlePointerDown(event) {
    if (element.disabled || (event.button !== undefined && event.button !== 0)) return;
    pointerId = event.pointerId;
    startPoint = { x: event.clientX, y: event.clientY };
    longPressTriggered = false;
    element.classList.add("pressing");
    timer = setTimeout(() => {
      timer = null;
      longPressTriggered = true;
      globalThis.navigator?.vibrate?.(30);
      onLongPress(event);
      element.classList.remove("pressing");
    }, duration);
  }

  function handlePointerMove(event) {
    if (event.pointerId !== pointerId || !startPoint) return;
    const distance = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
    if (distance > moveTolerance) resetPress();
  }

  function handlePointerEnd(event) {
    if (pointerId !== null && event.pointerId !== pointerId) return;
    resetPress();
  }

  function handleClick(event) {
    if (longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggered = false;
      return;
    }
    onPress(event);
  }

  function handleContextMenu(event) {
    event.preventDefault();
  }

  function handleKeyDown(event) {
    if (event.shiftKey && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onLongPress(event);
    }
  }

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerup", handlePointerEnd);
  element.addEventListener("pointercancel", handlePointerEnd);
  element.addEventListener("lostpointercapture", handlePointerEnd);
  element.addEventListener("click", handleClick);
  element.addEventListener("contextmenu", handleContextMenu);
  element.addEventListener("keydown", handleKeyDown);

  return () => {
    resetPress();
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerup", handlePointerEnd);
    element.removeEventListener("pointercancel", handlePointerEnd);
    element.removeEventListener("lostpointercapture", handlePointerEnd);
    element.removeEventListener("click", handleClick);
    element.removeEventListener("contextmenu", handleContextMenu);
    element.removeEventListener("keydown", handleKeyDown);
  };
}
