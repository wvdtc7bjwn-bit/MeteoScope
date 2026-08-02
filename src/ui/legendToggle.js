let legendToggleInitialized = false;

export function setupLegendToggle() {
  if (legendToggleInitialized) return;
  legendToggleInitialized = true;

  const legend = document.getElementById("map-legend");
  const toggle = document.getElementById("legend-toggle");
  const list = document.getElementById("legend-list");
  if (!legend || !toggle || !list) return;

  const collapseDurationMs = 220;
  let collapseTimer = 0;
  let isCollapsed = true;

  const finishCollapse = () => {
    if (!isCollapsed) return;
    list.hidden = true;
    legend.classList.remove("is-collapsing");
  };

  function setCollapsed(collapsed) {
    window.clearTimeout(collapseTimer);
    isCollapsed = Boolean(collapsed);
    legend.classList.toggle("collapsed", isCollapsed);
    legend.classList.toggle("is-open", !isCollapsed);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.setAttribute("aria-label", isCollapsed ? "凡例を開く" : "凡例を閉じる");
    toggle.title = isCollapsed ? "凡例を開く" : "凡例を閉じる";
    list.setAttribute("aria-hidden", String(isCollapsed));
    list.inert = isCollapsed;

    if (isCollapsed) {
      legend.classList.add("is-collapsing");
      collapseTimer = window.setTimeout(finishCollapse, collapseDurationMs);
    } else {
      list.hidden = false;
      legend.classList.remove("is-collapsing");
      void legend.offsetWidth;
    }
  }

  toggle.addEventListener("click", () => {
    setCollapsed(!isCollapsed);
  });

  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "凡例を開く");
  toggle.title = "凡例を開く";
  list.setAttribute("aria-hidden", "true");
  list.inert = true;
  list.hidden = true;
}
