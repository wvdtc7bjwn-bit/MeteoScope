import { parseJstDateTime } from "../utils/jstDateTime.js";

export function temperatureObservationTime(value) {
  const text = String(value ?? "");
  return parseJstDateTime(/^\d{14}$/.test(text)
    ? `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}T${text.slice(8,10)}:${text.slice(10,12)}:${text.slice(12,14)}+09:00` : value);
}
