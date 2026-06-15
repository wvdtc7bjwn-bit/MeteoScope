export function setupTabs({ onChange }) {
  const buttons = [...document.querySelectorAll(".tab-button")];

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.tab;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      onChange?.(tabId);
    });
  });
}
