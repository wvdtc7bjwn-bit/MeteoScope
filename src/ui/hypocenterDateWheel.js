const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const WHEEL_ITEM_HEIGHT = 44;

export function normalizeHypocenterDates(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? ""))
    .filter((value) => DATE_PATTERN.test(value)))]
    .sort((a, b) => b.localeCompare(a));
}

export function findHypocenterDateOffset(values, selectedDate) {
  const dates = normalizeHypocenterDates(values);
  const exactOffset = dates.indexOf(String(selectedDate ?? ""));
  if (exactOffset >= 0) return exactOffset;
  if (!dates.length) return 0;
  const target = String(selectedDate ?? "");
  const nextOlder = dates.findIndex((date) => date <= target);
  return nextOlder >= 0 ? nextOlder : dates.length - 1;
}

export function createHypocenterDateWheel({ onSelect } = {}) {
  let trigger = null;
  let dates = [];
  let selectedDate = "";
  let scrollTimer = 0;

  const root = document.createElement("div");
  root.className = "hypocenter-date-wheel";
  root.hidden = true;
  root.innerHTML = `
    <button type="button" class="hypocenter-date-wheel-backdrop" data-date-wheel-cancel aria-label="日付選択を閉じる"></button>
    <section class="hypocenter-date-wheel-sheet" role="dialog" aria-modal="true" aria-labelledby="hypocenter-date-wheel-title">
      <header class="hypocenter-date-wheel-header">
        <button type="button" data-date-wheel-cancel>キャンセル</button>
        <strong id="hypocenter-date-wheel-title">表示する日付</strong>
        <button type="button" data-date-wheel-confirm>完了</button>
      </header>
      <div class="hypocenter-date-wheel-columns" aria-label="年月日を選択">
        ${buildColumn("year", "年")}
        ${buildColumn("month", "月")}
        ${buildColumn("day", "日")}
        <div class="hypocenter-date-wheel-highlight" aria-hidden="true"></div>
      </div>
    </section>`;
  document.body.append(root);

  const columns = Object.fromEntries(
    ["year", "month", "day"].map((part) => [part, root.querySelector(`[data-date-wheel-part="${part}"]`)])
  );

  function open({ availableDates, currentDate, source } = {}) {
    dates = normalizeHypocenterDates(availableDates);
    if (!dates.length) return;
    selectedDate = dates.includes(currentDate) ? currentDate : dates[0];
    trigger = source instanceof HTMLElement ? source : null;
    renderAll();
    root.hidden = false;
    document.documentElement.classList.add("hypocenter-date-wheel-open");
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      columns.year?.focus({ preventScroll: true });
    });
  }

  function close() {
    if (root.hidden) return;
    root.classList.remove("is-open");
    document.documentElement.classList.remove("hypocenter-date-wheel-open");
    window.setTimeout(() => {
      root.hidden = true;
      trigger?.focus({ preventScroll: true });
      trigger = null;
    }, 180);
  }

  function confirm() {
    const offset = findHypocenterDateOffset(dates, selectedDate);
    onSelect?.({ date: dates[offset], dayOffset: offset });
    close();
  }

  function renderAll(preferred = parseDate(selectedDate)) {
    const years = uniquePart(dates, 0);
    const year = closestValue(years, preferred.year);
    const months = uniquePart(dates.filter((date) => date.startsWith(`${year}-`)), 1);
    const month = closestValue(months, preferred.month);
    const days = uniquePart(dates.filter((date) => date.startsWith(`${year}-${pad(month)}-`)), 2);
    const day = closestValue(days, preferred.day);
    selectedDate = `${year}-${pad(month)}-${pad(day)}`;
    renderColumn(columns.year, years, year, "年");
    renderColumn(columns.month, months, month, "月");
    renderColumn(columns.day, days, day, "日");
  }

  function selectPart(part, value) {
    const parsed = parseDate(selectedDate);
    parsed[part] = Number(value);
    renderAll(parsed);
  }

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-date-wheel-cancel]")) {
      close();
      return;
    }
    if (event.target.closest("[data-date-wheel-confirm]")) {
      confirm();
      return;
    }
    const option = event.target.closest("[data-date-wheel-value]");
    const column = option?.closest("[data-date-wheel-part]");
    if (!option || !column) return;
    selectPart(column.dataset.dateWheelPart, option.dataset.dateWheelValue);
  });

  Object.values(columns).forEach((column) => {
    column?.addEventListener("scroll", () => {
      if (column.dataset.dateWheelRendering === "true") return;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const index = Math.round(column.scrollTop / WHEEL_ITEM_HEIGHT);
        const option = column.querySelectorAll("[data-date-wheel-value]")[index];
        if (option) selectPart(column.dataset.dateWheelPart, option.dataset.dateWheelValue);
      }, 90);
    }, { passive: true });
  });

  document.addEventListener("keydown", (event) => {
    if (!root.hidden && event.key === "Escape") close();
  });

  return { open, close };
}

function buildColumn(part, unit) {
  return `<div class="hypocenter-date-wheel-column" data-date-wheel-part="${part}" role="listbox" aria-label="${unit}"></div>`;
}

function renderColumn(column, values, selected, unit) {
  if (!column) return;
  column.dataset.dateWheelRendering = "true";
  column.innerHTML = values.map((value) => `
    <button type="button" role="option" aria-selected="${value === selected}" class="${value === selected ? "is-selected" : ""}" data-date-wheel-value="${value}">
      ${value}<span>${unit}</span>
    </button>`).join("");
  requestAnimationFrame(() => {
    const index = Math.max(0, values.indexOf(selected));
    column.scrollTo({ top: index * WHEEL_ITEM_HEIGHT, behavior: "auto" });
    window.setTimeout(() => {
      column.dataset.dateWheelRendering = "false";
    }, 60);
  });
}

function uniquePart(dates, index) {
  return [...new Set(dates.map((date) => Number(date.split("-")[index])))]
    .filter(Number.isFinite)
    .sort((a, b) => index === 0 ? b - a : a - b);
}

function closestValue(values, preferred) {
  if (!values.length) return 0;
  const numeric = Number(preferred);
  return values.reduce((best, value) => (
    Math.abs(value - numeric) < Math.abs(best - numeric) ? value : best
  ), values[0]);
}

function parseDate(value) {
  const match = String(value ?? "").match(DATE_PATTERN);
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : { year: 0, month: 0, day: 0 };
}

function pad(value) {
  return String(value).padStart(2, "0");
}
