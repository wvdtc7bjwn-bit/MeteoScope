// Keep the original select as the value/event bridge so every feature retains
// its existing validation, persistence and availability rules.
export function settingsSelectOptions(select) {
  return [...select.options].filter(option => !option.hidden).map(option => ({
    value: option.value, label: option.label || option.textContent,
    disabled: select.disabled || option.disabled || option.closest("optgroup")?.disabled === true,
    selected: option.value === select.value
  }));
}

export function chooseSettingsOption(select, value) {
  if (!settingsSelectOptions(select).some(option => option.value === value && !option.disabled)) return false;
  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

export function setupSettingsChoiceLists(modal) {
  const records = new Map(), lists = new Map();
  const document = modal.ownerDocument;
  function render() {
    for (const select of modal.querySelectorAll("select:not([multiple])")) {
      let record = records.get(select);
      if (!record) {
        const label = select.closest("label") ?? select.labels?.[0];
        const host = label?.contains(select) ? label : select;
        const field = document.createElement("div");
        field.className = "settings-choice-field";
        host.before(field);
        field.append(host);
        const list = document.createElement("div");
        list.className = "settings-theme-options settings-choice-list";
        list.setAttribute("role", "radiogroup");
        const labelCopy = label?.cloneNode(true);
        labelCopy?.querySelectorAll("select, output").forEach(element => element.remove());
        list.setAttribute("aria-label", select.getAttribute("aria-label") || labelCopy?.textContent.trim() || "設定の選択");
        if (select.getAttribute("aria-describedby")) list.setAttribute("aria-describedby", select.getAttribute("aria-describedby"));
        field.append(list);
        select.dataset.settingsChoiceNative = "true";
        select.setAttribute("aria-hidden", "true");
        select.tabIndex = -1;
        record = { select, host, field, list, signature: "" };
        records.set(select, record); lists.set(list, record);
      }
      const options = settingsSelectOptions(select);
      const signature = JSON.stringify(options.map(({ value, label, disabled }) => ({ value, label, disabled })));
      if (signature !== record.signature) {
        record.signature = signature;
        record.list.replaceChildren(...options.map(option => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("role", "radio");
          button.dataset.settingsChoiceValue = option.value;
          button.textContent = option.label;
          button.disabled = option.disabled;
          return button;
        }));
      }
      const focusValue = options.find(option => option.selected && !option.disabled)?.value
        ?? options.find(option => !option.disabled)?.value;
      for (const button of record.list.children) {
        button.setAttribute("aria-checked", String(button.dataset.settingsChoiceValue === select.value));
        button.tabIndex = button.dataset.settingsChoiceValue === focusValue ? 0 : -1;
      }
      record.field.hidden = select.hidden || record.host.hidden;
      record.list.setAttribute("aria-disabled", String(select.disabled));
    }
  }
  modal.addEventListener("click", event => {
    const button = event.target.closest("[data-settings-choice-value]");
    if (!button) return;
    const record = lists.get(button.closest(".settings-choice-list"));
    if (record && chooseSettingsOption(record.select, button.dataset.settingsChoiceValue)) render();
  });
  modal.addEventListener("keydown", event => {
    const button = event.target.closest("[data-settings-choice-value]");
    if (!button || !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...button.parentElement.children].filter(item => !item.disabled);
    const index = buttons.indexOf(button);
    const next = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1)
      : buttons[(index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length];
    next?.focus(); next?.click();
  });
  // Run after existing handlers: resets and dependent choices may update selects.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  };
  modal.addEventListener("click", schedule);
  modal.addEventListener("change", schedule);
  render();
  const observer = new MutationObserver(changes => {
    if (changes.some(change => change.target.matches?.("select, option, optgroup, label"))) schedule();
  });
  observer.observe(modal, { subtree: true, childList: true, attributes: true, characterData: true,
    attributeFilter: ["hidden", "disabled", "selected", "label", "value"] });
  return { render };
}
