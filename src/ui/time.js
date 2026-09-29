export function startClock(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  let timerId = null;
  const update = () => {
    const now = new Date();
    const value = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(now);
    element.textContent = value;
    const displayTime = document.getElementById("clock-display-time");
    if (displayTime) displayTime.textContent = value;
    const delay = Math.max(20, 1000 - (Date.now() % 1000) + 8);
    timerId = window.setTimeout(update, delay);
  };

  update();
  return () => {
    if (timerId !== null) window.clearTimeout(timerId);
  };
}
