// The enclosing symbol swatch supplies the same yellow as the map points.
export function renderLightningLegendSymbol(kind) {
  if (kind === "ground") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18" fill="none" stroke="#303030" stroke-width="5"/><path d="M12 3v18M3 12h18" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
  if (kind === "cloud") return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor" stroke="#303030" stroke-width="1.5"/></svg>';
  return "";
}
