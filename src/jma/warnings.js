import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

export async function fetchWarningMap() {
  const warningMap = await fetchJson(JMA_ENDPOINTS.warnings);
  const count = Array.isArray(warningMap) ? warningMap.length : Object.keys(warningMap ?? {}).length;

  return {
    raw: warningMap,
    summary: `警報・注意報データ ${count} 件`,
    updatedAt: "取得済み"
  };
}
