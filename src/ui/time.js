export function startClock(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const update = () => {
    const now = new Date();
    element.textContent = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(now);
  };

  update();
  window.setInterval(update, 1000);
}
