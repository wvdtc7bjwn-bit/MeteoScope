const CLOCK_SEGMENTS = [
  "2,1 5,0 18,0 20,2 17,4 4,4",
  "19,3 21,5 21,16 19,18 17,16 17,5",
  "19,20 21,22 21,33 19,35 17,33 17,22",
  "4,34 17,34 20,36 18,38 5,38 2,36",
  "1,20 3,22 3,33 1,35 0,33 0,22",
  "1,3 3,5 3,16 1,18 0,16 0,5",
  "4,17 17,17 19,19 17,21 4,21 2,19"
];
const CLOCK_DIGITS = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgecd", "abc", "abcdefg", "abfgcd"];

export function renderSevenSegmentClock(value) {
  const text = String(value);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(text)) return "";
  let offset = 0;
  const shapes = [...text].map((character) => {
    if (character === ":") {
      const colon = `<g transform="translate(${offset} 0)"><rect x="1" y="11" width="4" height="4"/><rect x="1" y="25" width="4" height="4"/></g>`;
      offset += 10;
      return colon;
    }
    const active = CLOCK_DIGITS[Number(character)];
    const segments = CLOCK_SEGMENTS.map((points, index) => active.includes("abcdefg"[index])
      ? `<polygon points="${points}"/>`
      : "").join("");
    const digit = `<g transform="translate(${offset} 0)">${segments}</g>`;
    offset += 26;
    return digit;
  }).join("");
  return `<svg class="clock-seven-segment" viewBox="-1 0 ${offset + 2} 38" aria-hidden="true" focusable="false"><g transform="translate(6 0) skewX(-8)" fill="currentColor">${shapes}</g></svg><span class="clock-readable-time">${text}</span>`;
}

export function startClock(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const face = element.querySelector(".clock-face") ?? element;

  let timerId = null;
  const update = () => {
    const now = new Date();
    const value = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(now);
    face.innerHTML = renderSevenSegmentClock(value) || value;
    const displayTime = document.getElementById("clock-display-time");
    if (displayTime) displayTime.innerHTML = renderSevenSegmentClock(value) || value;
    const delay = Math.max(20, 1000 - (Date.now() % 1000) + 8);
    timerId = window.setTimeout(update, delay);
  };

  update();
  return () => {
    if (timerId !== null) window.clearTimeout(timerId);
  };
}
