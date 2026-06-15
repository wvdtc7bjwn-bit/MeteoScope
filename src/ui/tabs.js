export function setupTabs({ onChange }) {
  const buttons = [...document.querySelectorAll(".tab-button")];

  function setActiveButton(tabId) {
    buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabId));
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.tab;
      setActiveButton(tabId);
      onChange?.(tabId);
    });
  });

  return { setActiveButton };
}
