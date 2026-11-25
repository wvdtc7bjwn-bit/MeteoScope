import { normalizeTabOrder } from "./tabOrder.js";

export const UTILITY_ORDER_STORAGE_KEY = "meteoscope.utilityOrder.v1";

// Keep hidden early-access features in the saved order and append new features.
export function setupMapUtilityReorder(actions) {
  const doc = actions.ownerDocument;
  const view = doc.defaultView;
  const buttons = [...actions.querySelectorAll("button[id]")];
  const byId = new Map(buttons.map((button) => [button.id, button]));
  const hint = doc.createElement("p");
  hint.id = "map-utility-reorder-hint";
  hint.className = "map-utility-reorder-hint";
  hint.textContent = "長押しして並べ替え（キーボードは Alt＋矢印）";
  actions.append(hint);
  const status = doc.createElement("span");
  status.className = "map-utility-reorder-status";
  status.setAttribute("role", "status");
  actions.append(status);
  buttons.forEach((button) => {
    const describedBy = button.getAttribute("aria-describedby");
    button.setAttribute("aria-describedby", [describedBy, hint.id].filter(Boolean).join(" "));
  });

  const order = () => [...actions.querySelectorAll("button[id]")].map((button) => button.id);
  const apply = (ids) => normalizeTabOrder(ids, buttons).forEach((id) => actions.insertBefore(byId.get(id), hint));
  try {
    apply(JSON.parse(view.localStorage.getItem(UTILITY_ORDER_STORAGE_KEY) ?? "null"));
  } catch {
    // A malformed preference or blocked storage must not disable the menu.
    apply([]);
  }

  let gesture = null;
  let timer = 0;
  let frame = 0;
  let suppressClick = false;
  const visibleButtons = () => (gesture?.active ? gesture.previewOrder.map((id) => byId.get(id))
    : [...actions.querySelectorAll("button[id]")])
    .filter((button) => !button.disabled && button.getClientRects().length);
  const actionAt = (target) => {
    const button = target?.closest?.("button[id]");
    return button && byId.get(button.id) === button && !button.disabled ? button : null;
  };
  const inside = (x, y) => {
    const rect = actions.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };
  const announceSaved = () => {
    try {
      view.localStorage.setItem(UTILITY_ORDER_STORAGE_KEY, JSON.stringify(order()));
      status.textContent = "並び順を保存しました。";
    } catch {
      status.textContent = "並び順を変更しました。この端末では保存できません。";
    }
  };

  const moveToPointer = () => {
    if (!gesture?.active) return;
    const { x, y, button, preview, offsetX, offsetY } = gesture;
    preview.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0)`;
    if (!inside(x, y)) return;
    const current = visibleButtons();
    let closest = null;
    let distance = Infinity;
    for (const candidate of current) {
      const rect = candidate.getBoundingClientRect();
      const nextDistance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (nextDistance < distance) {
        closest = candidate;
        distance = nextDistance;
      }
    }
    if (!closest || closest === button) return;
    const movingForward = current.indexOf(button) < current.indexOf(closest);
    const nextOrder = gesture.previewOrder.filter((id) => id !== button.id);
    nextOrder.splice(nextOrder.indexOf(closest.id) + Number(movingForward), 0, button.id);
    gesture.previewOrder = nextOrder;
    // Moving a pressed element in the DOM can release pointer capture or cancel
    // an iOS touch. Only its grid order changes until the finger is released.
    nextOrder.forEach((id, index) => { byId.get(id).style.order = String(index); });
  };

  const autoScroll = () => {
    if (!gesture?.active) return;
    const rect = actions.getBoundingClientRect();
    if (inside(gesture.x, gesture.y)) {
      const edge = Math.min(44, rect.height / 4);
      const delta = gesture.y < rect.top + edge
        ? -Math.ceil((rect.top + edge - gesture.y) / 5)
        : gesture.y > rect.bottom - edge ? Math.ceil((gesture.y - rect.bottom + edge) / 5) : 0;
      if (delta) {
        actions.scrollTop += delta;
        moveToPointer();
      }
    }
    frame = view.requestAnimationFrame(autoScroll);
  };

  const finish = (commit = false) => {
    view.clearTimeout(timer);
    view.cancelAnimationFrame(frame);
    const previous = gesture;
    gesture = null;
    if (!previous?.active) return;
    previous.preview.remove();
    buttons.forEach((button) => { button.style.order = ""; });
    hint.style.order = "";
    previous.button.classList.remove("is-drag-source");
    actions.classList.remove("is-reordering");
    if (previous.kind === "pointer" && previous.button.hasPointerCapture?.(previous.id)) {
      previous.button.releasePointerCapture(previous.id);
    }
    if (!commit) {
      apply(previous.initialOrder);
      status.textContent = "並べ替えを取り消しました。";
    } else if (previous.previewOrder.join() !== previous.initialOrder.join()) {
      apply(previous.previewOrder);
      announceSaved();
    } else {
      status.textContent = "";
    }
  };

  const activate = () => {
    if (!gesture || gesture.active || actions.hidden || actions.inert) return;
    view.clearTimeout(timer);
    const { button } = gesture;
    const rect = button.getBoundingClientRect();
    const preview = doc.createElement("div");
    preview.className = "map-utility-drag-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.inert = true;
    // Clone the artwork, never the button IDs or its activation handlers.
    for (const child of button.children) preview.append(child.cloneNode(true));
    preview.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    preview.style.width = `${rect.width}px`;
    preview.style.height = `${rect.height}px`;
    doc.body.append(preview);
    Object.assign(gesture, { active: true, preview, previewOrder: [...gesture.initialOrder],
      offsetX: gesture.startX - rect.left, offsetY: gesture.startY - rect.top });
    hint.style.order = String(buttons.length);
    suppressClick = true;
    button.classList.add("is-drag-source");
    actions.classList.add("is-reordering");
    status.textContent = "並べ替え中。移動先で指を離してください。";
    if (gesture.kind === "pointer") button.setPointerCapture?.(gesture.id);
    moveToPointer();
    frame = view.requestAnimationFrame(autoScroll);
  };

  const start = (target, x, y, kind, id) => {
    finish();
    suppressClick = false;
    const button = actionAt(target);
    if (!button || actions.hidden || actions.inert) return;
    gesture = { button, x, y, startX: x, startY: y, kind, id, initialOrder: order(), active: false };
    status.textContent = "";
    timer = view.setTimeout(activate, 450);
  };
  const move = (x, y, event) => {
    if (!gesture) return;
    gesture.x = x;
    gesture.y = y;
    if (gesture.active) {
      if (event.cancelable) event.preventDefault();
      moveToPointer();
    } else if (Math.hypot(x - gesture.startX, y - gesture.startY) > 10) {
      // Mouse users can also drag directly; touch keeps native scrolling until
      // the hold completes.
      if (gesture.kind === "pointer") activate();
      else finish();
    }
  };

  actions.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    if (event.isPrimary === false) { finish(); return; }
    start(event.target, event.clientX, event.clientY, "pointer", event.pointerId);
  });
  doc.addEventListener("pointermove", (event) => {
    if (gesture?.kind === "pointer" && gesture.id === event.pointerId) move(event.clientX, event.clientY, event);
  });
  doc.addEventListener("pointerup", (event) => {
    if (gesture?.kind !== "pointer" || gesture.id !== event.pointerId) return;
    finish(inside(event.clientX, event.clientY));
  });
  doc.addEventListener("pointercancel", (event) => {
    if (gesture?.kind === "pointer" && gesture.id === event.pointerId) finish();
  });
  actions.addEventListener("lostpointercapture", (event) => {
    if (gesture?.kind === "pointer" && gesture.id === event.pointerId) finish();
  });

  // Install the non-passive listener before the gesture starts. Unlike switching
  // touch-action after a hold, this also supports a vertical drag on iOS Safari.
  actions.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) { finish(); return; }
    const touch = event.touches[0];
    start(event.target, touch.clientX, touch.clientY, "touch", touch.identifier);
  }, { passive: true });
  doc.addEventListener("touchstart", (event) => { if (event.touches.length > 1) finish(); }, { passive: true });
  doc.addEventListener("touchmove", (event) => {
    if (gesture?.kind !== "touch") return;
    if (event.touches.length !== 1) { finish(); return; }
    const touch = [...event.touches].find((item) => item.identifier === gesture.id);
    if (touch) move(touch.clientX, touch.clientY, event);
  }, { passive: false });
  doc.addEventListener("touchend", (event) => {
    if (gesture?.kind !== "touch") return;
    const touch = [...event.changedTouches].find((item) => item.identifier === gesture.id);
    if (!touch) return;
    if (gesture.active && event.cancelable) event.preventDefault();
    finish(inside(touch.clientX, touch.clientY));
  }, { passive: false });
  doc.addEventListener("touchcancel", () => { if (gesture?.kind === "touch") finish(); });

  actions.addEventListener("click", (event) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  actions.addEventListener("contextmenu", (event) => { if (actionAt(event.target)) event.preventDefault(); });
  actions.addEventListener("dragstart", (event) => event.preventDefault());
  actions.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && gesture) {
      finish();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Keyboard activation must never inherit a cancelled pointer click.
    if (event.key === "Enter" || event.key === " ") suppressClick = false;
    const button = actionAt(event.target);
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
    if (!button || !event.altKey || !offsets[event.key]) return;
    event.preventDefault();
    finish();
    const current = visibleButtons();
    const index = current.indexOf(button);
    const target = current[index + offsets[event.key]];
    if (!target) return;
    actions.insertBefore(button, offsets[event.key] > 0 ? target.nextSibling : target);
    button.focus({ preventScroll: true });
    announceSaved();
  });
  view.addEventListener("blur", () => finish());
  view.addEventListener("pagehide", () => finish());
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) finish(); });

  return { cancel: () => finish() };
}
