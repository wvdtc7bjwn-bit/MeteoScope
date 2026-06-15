export function applyEqStylePatch() {
  addEqStyleSheet();
  renamePanels();
}

function addEqStyleSheet() {
  if (document.querySelector('link[href="/src/style.eqapp.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/src/style.eqapp.css";
  document.head.appendChild(link);
}

function renamePanels() {
  const appTitle = document.querySelector(".app-title");
  if (appTitle) appTitle.remove();

  const detailPanel = document.querySelector(".points-panel");
  if (detailPanel) detailPanel.classList.add("sub-panel");

  const legendPanel = document.querySelector(".legend-panel");
  if (legendPanel) legendPanel.classList.add("sub-panel");
}
