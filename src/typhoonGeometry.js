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

const MAX_JMA_STORM_WARNING_ENDPOINT_GAP_KM = 100;
const MAX_ROUNDED_TANGENT_JOIN_GAP_KM = 50;
const MAX_ROUNDED_TANGENT_JOIN_ANGLE_DEGREES = 35;

export function buildStormWarningAreaLineSegments(stormWarningArea) {
  return buildStormWarningAreaSegments(stormWarningArea)
    .map(({ coordinates }) => coordinates);
}

export function buildStormWarningAreaFeatures(stormWarningArea, properties = {}) {
  const segments = buildStormWarningAreaSegments(stormWarningArea);
  const closedGroups = buildStormWarningAreaClosedPathGroups(segments, MAX_JMA_STORM_WARNING_ENDPOINT_GAP_KM);
  const closedSegmentIndexes = new Set(closedGroups.flatMap((group) => group.segmentIndexes));
  const linePaths = [
    ...closedGroups.map((group) => group.coordinates),
    ...segments.filter((_, index) => !closedSegmentIndexes.has(index)).map((segment) => segment.coordinates)
  ];
  return [
    ...linePaths
      .filter((coordinates) => coordinates.length >= 2)
      .map((coordinates) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { ...properties, typhoonShape: "warningArea" }
      })),
    ...closedGroups
      .map((group) => group.coordinates)
      .filter((coordinates) => coordinates.length >= 4)
      .map((coordinates) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coordinates] },
        properties: { ...properties, typhoonShape: "warningAreaFill" }
      }))
  ];
}

// JMA rounds arc and tangent endpoints independently. Gaps through 50 km keep
// the existing matching behavior. A wider allowance is only for an unambiguous
// arc-to-line pair whose outward directions meet smoothly; line-line and
// misaligned pairs are never connected by the larger allowance.
export function buildStormWarningAreaClosedPaths(
  stormWarningArea,
  maxEndpointDistanceKm = MAX_JMA_STORM_WARNING_ENDPOINT_GAP_KM
) {
  return buildStormWarningAreaClosedPathGroups(
    buildStormWarningAreaSegments(stormWarningArea),
    maxEndpointDistanceKm
  ).map((group) => group.coordinates);
}

function buildStormWarningAreaClosedPathGroups(segments, maxEndpointDistanceKm) {
  const closedGroups = segments.flatMap((segment, segmentIndex) => (
    segment.isClosedArc
      ? [{ coordinates: closeCoordinateLine(segment.coordinates.slice()), segmentIndexes: [segmentIndex] }]
      : []
  ));
  const openSegments = segments
    .map((segment, segmentIndex) => ({ ...segment, sourceIndex: segmentIndex }))
    .filter((segment) => !segment.isClosedArc);

  if (openSegments.length === 0) return closedGroups;

  const endpointPairs = pairStormWarningEndpoints(openSegments, maxEndpointDistanceKm);
  if (!endpointPairs) return closedGroups;
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
    return { startNode, endNode, coordinates: segment.coordinates, sourceIndex: segment.sourceIndex };
  });
  if (edges.some((edge) => !edge) || nodes.some((node) => node.edges.length !== 2)) return closedGroups;

  const usedEdges = new Set();
  const joinedGroups = [];
  let invalidCycle = false;
  edges.forEach((edge, edgeIndex) => {
    if (usedEdges.has(edgeIndex) || invalidCycle) return;

    const startNode = edge.startNode;
    let currentNode = edge.endNode;
    const path = orientStormWarningSegment(edge, startNode, nodes).coordinates.slice();
    const segmentIndexes = [edge.sourceIndex];
    usedEdges.add(edgeIndex);

    while (currentNode !== startNode) {
      const nextEdges = nodes[currentNode].edges.filter((candidate) => !usedEdges.has(candidate));
      if (nextEdges.length !== 1) {
        invalidCycle = true;
        return;
      }
      const nextEdgeIndex = nextEdges[0];
      const next = orientStormWarningSegment(edges[nextEdgeIndex], currentNode, nodes);
      path.push(...next.coordinates.slice(1));
      segmentIndexes.push(edges[nextEdgeIndex].sourceIndex);
      usedEdges.add(nextEdgeIndex);
      currentNode = next.endNode;
    }

    joinedGroups.push({ coordinates: closeCoordinateLine(path), segmentIndexes });
  });

  return !invalidCycle && usedEdges.size === edges.length
    ? [...closedGroups, ...joinedGroups]
    : closedGroups;
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
      isClosedArc: isFullStormWarningArc(arc),
      kind: "arc"
    });
  });

  (stormWarningArea?.line ?? []).forEach((line) => {
    const coordinates = (line ?? []).filter(isCoordinate);
    if (coordinates.length >= 2) segments.push({ coordinates, isClosedArc: false, kind: "line" });
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
  const candidateDetails = endpoints.map((endpoint, index) => (
    endpoints
      .map((candidate, candidateIndex) => ({
        candidateIndex,
        distance: coordinateDistanceKm(endpoint.point, candidate.point)
      }))
      .filter(({ candidateIndex, distance }) => (
        candidateIndex !== index
        && endpoints[candidateIndex].segmentIndex !== endpoint.segmentIndex
        && distance <= maxEndpointDistanceKm
        && (distance <= MAX_ROUNDED_TANGENT_JOIN_GAP_KM
          || isRoundedArcLineTangentJoin(
            endpoint,
            endpoints[candidateIndex],
            segments,
            distance
          ))
      ))
      .sort((first, second) => first.distance - second.distance)
  ));
  const candidates = candidateDetails.map((details, endpointIndex) => details
    .filter(({ candidateIndex, distance }) => (
      distance <= MAX_ROUNDED_TANGENT_JOIN_GAP_KM
      || isMutualUniqueNearestCandidate(endpointIndex, candidateIndex, distance, candidateDetails)
    ))
    .map(({ candidateIndex }) => candidateIndex));
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

function isRoundedArcLineTangentJoin(first, second, segments, distance) {
  if (distance > MAX_JMA_STORM_WARNING_ENDPOINT_GAP_KM) return false;
  const firstSegment = segments[first.segmentIndex];
  const secondSegment = segments[second.segmentIndex];
  if (firstSegment.kind === secondSegment.kind) return false;

  const firstTangent = outwardEndpointTangent(firstSegment.coordinates, first.id.endsWith(":start"));
  const secondTangent = outwardEndpointTangent(secondSegment.coordinates, second.id.endsWith(":start"));
  if (!firstTangent || !secondTangent) return false;

  const alignment = firstTangent[0] * secondTangent[0] + firstTangent[1] * secondTangent[1];
  return alignment <= -Math.cos(MAX_ROUNDED_TANGENT_JOIN_ANGLE_DEGREES * Math.PI / 180);
}

function isMutualUniqueNearestCandidate(firstIndex, secondIndex, distance, candidateDetails) {
  const firstNearest = candidateDetails[firstIndex].filter((candidate) => candidate.distance <= distance + 0.001);
  const secondNearest = candidateDetails[secondIndex].filter((candidate) => candidate.distance <= distance + 0.001);
  return firstNearest.length === 1
    && secondNearest.length === 1
    && firstNearest[0].candidateIndex === secondIndex
    && secondNearest[0].candidateIndex === firstIndex;
}

function outwardEndpointTangent(coordinates, isStart) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const endpoint = isStart ? coordinates[0] : coordinates.at(-1);
  const neighbor = isStart ? coordinates[1] : coordinates.at(-2);
  if (!isCoordinate(endpoint) || !isCoordinate(neighbor)) return null;

  const latitude = (Number(endpoint[1]) + Number(neighbor[1])) * Math.PI / 360;
  const east = (((Number(neighbor[0]) - Number(endpoint[0]) + 540) % 360) - 180)
    * Math.PI / 180 * Math.cos(latitude);
  const north = (Number(neighbor[1]) - Number(endpoint[1])) * Math.PI / 180;
  const magnitude = Math.hypot(east, north);
  return magnitude > 0 ? [east / magnitude, north / magnitude] : null;
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
