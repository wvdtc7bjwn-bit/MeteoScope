export function destinationPoint([longitude, latitude], distanceKm, bearingDegrees) {
  const earthRadiusKm = 6371.0088;
  const angularDistance = Number(distanceKm) / earthRadiusKm;
  const bearing = Number(bearingDegrees) * Math.PI / 180;
  const latitudeRadians = Number(latitude) * Math.PI / 180;
  const longitudeRadians = Number(longitude) * Math.PI / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance)
    + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude)
  );

  return [
    ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
    destinationLatitude * 180 / Math.PI
  ];
}

export function buildStormWarningAreaLineSegments(stormWarningArea) {
  const segments = [];

  (stormWarningArea?.arc ?? []).forEach((arc) => {
    const segment = makeStormWarningArcSegment(arc);
    if (segment.length >= 2) segments.push(segment);
  });

  (stormWarningArea?.line ?? []).forEach((line) => {
    const segment = (line ?? []).filter(isCoordinate);
    if (segment.length >= 2) segments.push(segment);
  });

  return segments;
}

// Published tangent endpoints are rounded independently from the arc
// definitions and can differ by about 23 km in current JMA bulletins.
export function buildStormWarningAreaClosedPaths(stormWarningArea, maxEndpointDistanceKm = 30) {
  const segments = buildStormWarningAreaLineSegments(stormWarningArea)
    .filter((segment) => segment.length >= 2)
    .map((segment) => segment.slice());
  const closedPaths = [];
  const nodes = [];
  const edges = [];

  segments.forEach((segment) => {
    if (coordinateDistanceKm(segment[0], segment.at(-1)) <= maxEndpointDistanceKm) {
      closedPaths.push(closeCoordinateLine(segment));
      return;
    }

    const startNode = findOrCreateEndpointNode(nodes, segment[0], maxEndpointDistanceKm);
    const endNode = findOrCreateEndpointNode(nodes, segment.at(-1), maxEndpointDistanceKm);
    const edgeIndex = edges.length;
    edges.push({ startNode, endNode, coordinates: segment });
    nodes[startNode].edges.push(edgeIndex);
    nodes[endNode].edges.push(edgeIndex);
  });

  if (edges.length === 0) return closedPaths;
  if (nodes.some((node) => node.edges.length !== 2)) return [];

  const usedEdges = new Set();
  edges.forEach((edge, edgeIndex) => {
    if (usedEdges.has(edgeIndex)) return;

    const startNode = edge.startNode;
    let currentNode = edge.endNode;
    const path = orientStormWarningSegment(edge, startNode, nodes).coordinates.slice();
    usedEdges.add(edgeIndex);

    while (currentNode !== startNode) {
      const nextEdges = nodes[currentNode].edges.filter((candidate) => !usedEdges.has(candidate));
      if (nextEdges.length !== 1) return;
      const nextEdgeIndex = nextEdges[0];
      const next = orientStormWarningSegment(edges[nextEdgeIndex], currentNode, nodes);
      path.push(...next.coordinates.slice(1));
      usedEdges.add(nextEdgeIndex);
      currentNode = next.endNode;
    }

    closedPaths.push(closeCoordinateLine(path));
  });

  return usedEdges.size === edges.length ? closedPaths : [];
}

function findOrCreateEndpointNode(nodes, point, maxDistanceKm) {
  let nearestIndex = -1;
  let nearestDistance = Infinity;
  nodes.forEach((node, index) => {
    const distance = coordinateDistanceKm(node.point, point);
    if (distance <= maxDistanceKm && distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });
  if (nearestIndex >= 0) return nearestIndex;
  nodes.push({ point, edges: [] });
  return nodes.length - 1;
}

function orientStormWarningSegment(edge, startNode, nodes) {
  const coordinates = edge.startNode === startNode
    ? edge.coordinates.slice()
    : edge.coordinates.slice().reverse();
  const endNode = edge.startNode === startNode ? edge.endNode : edge.startNode;
  coordinates[0] = nodes[startNode].point;
  coordinates[coordinates.length - 1] = nodes[endNode].point;
  return { coordinates, endNode };
}

function coordinateDistanceKm(a, b) {
  if (!isCoordinate(a) || !isCoordinate(b)) return Infinity;
  const earthRadiusKm = 6371.0088;
  const latitudeA = Number(a[1]) * Math.PI / 180;
  const latitudeB = Number(b[1]) * Math.PI / 180;
  const latitudeDelta = latitudeB - latitudeA;
  const longitudeDelta = ((Number(b[0]) - Number(a[0]) + 540) % 360 - 180) * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function closeCoordinateLine(points) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points.at(-1);
  if (coordinateDistanceKm(first, last) < 0.001) {
    const closed = points.slice();
    closed[closed.length - 1] = first;
    return closed;
  }
  return [...points, first];
}

function makeStormWarningArcSegment(arc) {
  const center = arc?.center;
  const radius = Number(arc?.radius);
  if (!isCoordinate(center) || !Number.isFinite(radius) || radius <= 0) return [];
  let start = Number(arc?.start);
  let end = Number(arc?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  if (end < start) end += 360;

  const span = Math.max(1, end - start);
  const steps = Math.max(8, Math.ceil(span / 5));
  return Array.from({ length: steps + 1 }, (_, index) => (
    destinationPoint(center, radius, start + span * index / steps)
  ));
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}
