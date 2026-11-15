import { getDistanceKm } from "../location/distance.js";
import { unwrapLineAtAntimeridian } from "../map/geoLine.js";

// Keep only exposed arcs of overlapping finite-source circles. This preserves
// their physical radii without drawing every internal circle across the map.
export function exposedWavefrontArcs(input) {
  const circles = input.filter((circle, index) => !input.slice(0, index).some(other => Math.abs(circle.radius - other.radius) < .01 && getDistanceKm(circle.center, other.center) < .01));
  const arcs = [];
  circles.forEach((circle, index) => {
    const neighbors = circles.filter((other, j) => j !== index && getDistanceKm(circle.center, other.center) < circle.radius + other.radius);
    if (neighbors.some(other => getDistanceKm(circle.center, other.center) + circle.radius < other.radius - .01)) return;
    const ring = unwrapLineAtAntimeridian(circle.ring);
    const visible = ring.slice(1).map((end, i) => {
      const midpoint = [(ring[i][0] + end[0]) / 2, (ring[i][1] + end[1]) / 2];
      return !neighbors.some(other => getDistanceKm(midpoint, other.center) < other.radius - .01);
    });
    const groups = [];
    let current = null;
    visible.forEach((outside, i) => {
      if (!outside) { current = null; return; }
      if (!current) { current = [ring[i]]; groups.push(current); }
      current.push(ring[i + 1]);
    });
    if (groups.length > 1 && visible[0] && visible.at(-1)) groups[0] = [...groups.pop(), ...groups[0].slice(1)];
    arcs.push(...groups.filter(group => group.length >= 2));
  });
  return arcs;
}
