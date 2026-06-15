import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

export async function fetchTyphoonList() {
  const typhoons = await fetchJson(JMA_ENDPOINTS.typhoon);
  const count = Array.isArray(typhoons) ? typhoons.length : Object.keys(typhoons ?? {}).length;

  return {
    raw: typhoons,
    summary: count > 0 ? `台風データ ${count} 件` : "現在表示できる台風データはありません",
    updatedAt: "取得済み"
  };
}
