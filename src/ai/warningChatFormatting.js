// Preserve qualitative JMA height strings; only bare numeric heights need a unit.
export function formatWarningChatHeight(value) {
  return /^[<>]?\d+(?:\.\d+)?$/u.test(value) ? `${value}m` : value;
}
