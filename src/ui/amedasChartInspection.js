import { AMEDAS_CHART_LAYOUT, findNearestAmedasObservation } from "../amedasChart.js";

const models = new WeakMap();
const attached = new WeakSet();

// Delegated listeners survive chart re-renders; only the current observations
// are retained. Inspection never requests data or changes the map selection.
export function bindAmedasChartInspection(root, model) {
  if (!model) {
    clearObservation(root);
    models.delete(root);
    return;
  }
  const points = model.points.filter(point => Number.isFinite(point.minute) && Number.isFinite(point.value))
    .sort((a, b) => a.minute - b.minute);
  models.set(root, { ...model, points, selected: null });
  if (attached.has(root)) return;
  attached.add(root);

  const plotFor = event => event.target instanceof Element
    ? event.target.closest(".amedas-temperature-chart-plot") : null;
  const inspectPointer = event => {
    const plot = plotFor(event);
    const current = models.get(root);
    if (!plot || !current) return;
    const rect = plot.getBoundingClientRect();
    if (!rect.width) return;
    const { width, inset } = current.layout ?? AMEDAS_CHART_LAYOUT;
    const x = (event.clientX - rect.left) / rect.width * width;
    const rangeMinutes = current.rangeMinutes ?? 1440;
    const minute = Math.max(0, Math.min(rangeMinutes, (x - inset.left) / (width - inset.left - inset.right) * rangeMinutes));
    showObservation(root, current, findNearestAmedasObservation(current.points, minute));
  };
  root.addEventListener("pointerdown", event => {
    const plot = plotFor(event);
    if (!plot || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    plot.setPointerCapture?.(event.pointerId);
    inspectPointer(event);
  });
  root.addEventListener("pointermove", inspectPointer, { passive: true });
  root.addEventListener("pointerout", event => {
    const plot = plotFor(event);
    if (event.pointerType !== "mouse" || !plot || plot.contains(event.relatedTarget)) return;
    clearObservation(root);
  });
  root.addEventListener("pointercancel", () => clearObservation(root));
  root.addEventListener("keydown", event => {
    const current = models.get(root);
    if (!plotFor(event) || !current?.points.length) return;
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") return clearObservation(root);
    const last = current.points.length - 1;
    let index = current.selected ? current.points.indexOf(current.selected) : last;
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = last;
    else index = Math.max(0, Math.min(last, index + (event.key === "ArrowLeft" ? -1 : 1)));
    showObservation(root, current, current.points[index]);
  });
}

function showObservation(root, model, point) {
  if (!point) return;
  const plot = root.querySelector(".amedas-temperature-chart-plot");
  const guide = plot?.querySelector(".amedas-chart-inspection-guide");
  if (!guide) return;
  const min = Number(plot.dataset.axisMin), max = Number(plot.dataset.axisMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
  model.selected = point;
  root.classList.add("is-inspecting");
  const { width, height, inset } = model.layout ?? AMEDAS_CHART_LAYOUT;
  const x = inset.left + point.minute / (model.rangeMinutes ?? 1440) * (width - inset.left - inset.right);
  const y = inset.top + (max - point.value) / (max - min) * (height - inset.top - inset.bottom);
  const line = guide.querySelector("line"), dot = guide.querySelector("circle");
  line.setAttribute("x1", x); line.setAttribute("x2", x);
  dot.setAttribute("cx", x); dot.setAttribute("cy", y);
  guide.style.display = "";
  const reading = root.querySelector(".amedas-chart-inspection-reading");
  reading.hidden = false;
  reading.querySelector("time").textContent = point.label || `${String(Math.floor(point.minute / 60)).padStart(2, "0")}:${String(point.minute % 60).padStart(2, "0")}`;
  reading.querySelector("strong").textContent = model.formatValue(point.value);
  reading.querySelector("small").textContent = model.windLabel && Number.isFinite(point.gust)
    ? `${model.windLabel} ${model.formatValue(point.gust)}` : "";
  root.querySelector(".amedas-chart-inspection-hint").hidden = true;
}

function clearObservation(root) {
  root.classList.remove("is-inspecting");
  const guide = root.querySelector(".amedas-chart-inspection-guide");
  if (guide) guide.style.display = "none";
  const reading = root.querySelector(".amedas-chart-inspection-reading");
  if (reading) reading.hidden = true;
  const hint = root.querySelector(".amedas-chart-inspection-hint");
  if (hint) hint.hidden = false;
  const model = models.get(root);
  if (model) model.selected = null;
}
