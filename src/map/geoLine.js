export function splitLineAtAntimeridian(coordinates = []) {
  if (coordinates.length < 2) return [];
  const segments = [[coordinates[0]]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const longitudeDelta = current[0] - previous[0];
    if (Math.abs(longitudeDelta) <= 180) {
      segments.at(-1).push(current);
      continue;
    }
    const unwrappedLongitude = current[0] + (longitudeDelta < -180 ? 360 : -360);
    const boundary = longitudeDelta < -180 ? 180 : -180;
    const ratio = (boundary - previous[0]) / (unwrappedLongitude - previous[0]);
    const latitude = previous[1] + (current[1] - previous[1]) * ratio;
    segments.at(-1).push([boundary, latitude]);
    segments.push([[-boundary, latitude], current]);
  }
  return segments.filter((segment) => segment.length >= 2);
}
