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
  return buildStormWarningAreaSegments(stormWarningArea)
    .map(({ coordinates }) => coordinates);
}

// Published tangent endpoints are rounded independently from the arc
// definitions and can differ by about 23 km in current JMA bulletins.
export function buildStormWarningAreaClosedPaths(stormWarningArea, maxEndpointDistanceKm = 30) {
  const segments = buildStormWarningAreaSegments(stormWarningArea)
    .map((segment) => ({ ...segment, coordinates: segment.coordinates.slice() }));
  const closedPaths = [];
  const openSegments = segments.filter((segment) => {
    if (segment.isClosedArc) {
      closedPaths.push(closeCoordinateLine(segment.coordinates));
      return false;
    }
    return true;
  });

  if (openSegments.length === 0) return closedPaths;

  const endpointPairs = pairStormWarningEndpoints(openSegments, maxEndpointDistanceKm);
  if (!endpointPairs) return [];
  const nodes = endpointPairs.map(([first, second]) => ({
    point: averageCoordinates(first.point, second.point),
    edges: []
  }));
  const endpointNodes = new Map();
  endpointPairs.forEach(([first, second], nodeIndex) => {
    endpointNodes.set(first.id, nodeIndex);
    endpointNodes.set(second.id, nodeIndex);
  });
  const edges = openSegments.map((segment, index) => {
    const startNode = endpointNodes.get(`${index}:start`);
    const endNode = endpointNodes.get(`${index}:end`);
    if (startNode === undefined || endNode === undefined) return null;
    nodes[startNode].edges.push(index);
    nodes[endNode].edges.push(index);
    return { startNode, endNode, coordinates: segment.coordinates };
  });
  if (edges.some((edge) => !edge) || nodes.some((node) => node.edges.length !== 2)) return [];

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

function buildStormWarningAreaSegments(stormWarningArea) {
  const segments = [];

  (stormWarningArea?.arc ?? []).forEach((arc) => {
    const coordinates = makeStormWarningArcSegment(arc);
    if (coordinates.length < 2) return;
    segments.push({
      coordinates,
      // Only a 360-degree arc is a complete shape by itself. Tangent lines
      // and short arcs can have endpoints within the rounding tolerance, but
      // must stay connected to the rest of the published perimeter.
      isClosedArc: isFullStormWarningArc(arc)
    });
  });

  (stormWarningArea?.line ?? []).forEach((line) => {
    const coordinates = (line ?? []).filter(isCoordinate);
    if (coordinates.length >= 2) segments.push({ coordinates, isClosedArc: false });
  });

  return segments;
}

function isFullStormWarningArc(arc) {
  const start = Number(arc?.start);
  const end = Number(arc?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return Math.abs(end - start) >= 359.5;
}

function pairStormWarningEndpoints(segments, maxEndpointDistanceKm) {
  const endpoints = segments.flatMap((segment, index) => [
    { id: `${index}:start`, segmentIndex: index, point: segment.coordinates[0] },
    { id: `${index}:end`, segmentIndex: index, point: segment.coordinates.at(-1) }
  ]);
  const candidates = endpoints.map((endpoint, index) => (
    endpoints
      .map((candidate, candidateIndex) => ({
        candidateIndex,
        distance: coordinateDistanceKm(endpoint.point, candidate.point)
      }))
      .filter(({ candidateIndex, distance }) => (
        candidateIndex !== index
        && endpoints[candidateIndex].segmentIndex !== endpoint.segmentIndex
        && distance <= maxEndpointDistanceKm
      ))
      .sort((first, second) => first.distance - second.distance)
      .map(({ candidateIndex }) => candidateIndex)
  ));
  const remaining = new Set(endpoints.map((_, index) => index));
  const pairs = [];
  const maxAttempts = 20000;
  let attempts = 0;

  function connect() {
    if (remaining.size === 0) return pairs.slice();
    if (attempts >= maxAttempts) return null;
    attempts += 1;

    let endpointIndex = -1;
    let available = null;
    remaining.forEach((candidateIndex) => {
      const matching = candidates[candidateIndex]
        .filter((neighborIndex) => remaining.has(neighborIndex));
      if (!matching.length) {
        endpointIndex = candidateIndex;
        available = [];
        return;
      }
      if (!available || matching.length < available.length) {
        endpointIndex = candidateIndex;
        available = matching;
      }
    });
    if (!available?.length) return null;

    remaining.delete(endpointIndex);
    for (const neighborIndex of available) {
      if (!remaining.has(neighborIndex)) continue;
      remaining.delete(neighborIndex);
      pairs.push([endpoints[endpointIndex], endpoints[neighborIndex]]);
      const result = connect();
      if (result) return result;
      pairs.pop();
      remaining.add(neighborIndex);
    }
    remaining.add(endpointIndex);
    return null;
  }

  return connect();
}

function averageCoordinates(first, second) {
  const longitudeDelta = ((Number(second[0]) - Number(first[0]) + 540) % 360) - 180;
  return [
    ((Number(first[0]) + longitudeDelta / 2 + 540) % 360) - 180,
    (Number(first[1]) + Number(second[1])) / 2
  ];
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
