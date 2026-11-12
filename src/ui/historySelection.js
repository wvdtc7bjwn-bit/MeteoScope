import { renderFocalMechanism } from "./focalMechanism.js";

// Keep the selected card at the same screen position when removing a mechanism
// from an earlier card. Never focus/scroll an unrelated result into view.
export function updateHistorySelection(root, selectedId, items) {
  const buttons = [...root.querySelectorAll("[data-earthquake-archive-id]")];
  const id = String(selectedId ?? "");
  const selected = buttons.find(button => button.dataset.earthquakeArchiveId === id);
  const top = selected?.getBoundingClientRect().top;
  const scrollers = [];
  for (let node = root; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight) scrollers.push(node);
  }
  for (const button of buttons) {
    const active = button === selected;
    const card = button.closest(".earthquake-archive-item");
    card.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    const mechanism = card.querySelector("focal-mechanism");
    if (!active) mechanism?.remove();
    else if (!mechanism) {
      const item = items.find(item => String(item.id) === id);
      if (item) card.insertAdjacentHTML("beforeend", renderFocalMechanism(item));
    }
  }
  if (selected && Number.isFinite(top)) {
    for (const scroller of scrollers) {
      const delta = selected.getBoundingClientRect().top - top;
      if (Math.abs(delta) < 0.5) break;
      scroller.scrollTop += delta;
    }
  }
}
