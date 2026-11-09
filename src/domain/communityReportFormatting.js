export function formatCommunityReportTemperature(value) {
  if (value == null || value === "") return "";
  const temperature = Number(value);
  return Number.isFinite(temperature) ? `${temperature.toFixed(1)}℃` : "";
}
