export function getDistanceKm(from, to) {
  const toRadians = (value) => value * Math.PI / 180;
  const [fromLongitude, fromLatitude] = from;
  const [toLongitude, toLatitude] = to;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const latitudeA = toRadians(fromLatitude);
  const latitudeB = toRadians(toLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
