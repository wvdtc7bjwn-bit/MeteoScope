let legendToggleInitialized = false;

export function setupLegendToggle() {
  if (legendToggleInitialized) return;
  legendToggleInitialized = true;

  const legend = document.getElementById("map-legend");
  const toggle = document.getElementById("legend-toggle");
  const list = document.getElementById("legend-list");
  if (!legend || !toggle || !list) return;

  function setCollapsed(isCollapsed) {
    legend.classList.toggle("collapsed", isCollapsed);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    list.hidden = isCollapsed;
  }

  toggle.addEventListener("click", () => {
    setCollapsed(!legend.classList.contains("collapsed"));
  });

  setCollapsed(true);
}
