import {
  HYPOCENTER_3D_VERTICAL_EXAGGERATION,
  normalizeHypocenter3DItems,
  parseHexColor,
  projectMercatorPoint
} from "./hypocenter3DGeometry.js";
import {
  bindDepth3DVertexBuffer,
  createDepth3DProgram,
  getDepth3DProgramBindings
} from "./depth3DRenderer.js";

export const HYPOCENTER_3D_LAYER_ID = "meteoscope-hypocenter-depth-3d";

export function createHypocenter3DLayer(maplibregl, colorForDepth) {
  const state = {
    map: null,
    gl: null,
    program: null,
    lineBuffer: null,
    pointBuffer: null,
    attributes: null,
    matrixUniform: null,
    pointModeUniform: null,
    lineVertices: new Float32Array(),
    pointVertices: new Float32Array(),
    points: [],
    projectedPoints: [],
    enabled: false
  };

  const layer = {
    id: HYPOCENTER_3D_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      state.map = map;
      state.gl = gl;
      state.program = createDepth3DProgram(gl);
      state.lineBuffer = gl.createBuffer();
      state.pointBuffer = gl.createBuffer();
      const bindings = getDepth3DProgramBindings(gl, state.program);
      state.attributes = bindings.attributes;
      state.matrixUniform = bindings.matrixUniform;
      state.pointModeUniform = bindings.pointModeUniform;
      uploadBuffers(state);
    },

    render(gl, renderArgs) {
      if (!state.enabled || state.points.length === 0 || !state.program) return;
      const matrix = renderArgs?.defaultProjectionData?.mainMatrix ?? renderArgs;
      if (!matrix) return;

      const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
      const blendWasEnabled = gl.isEnabled(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(state.program);
      gl.uniformMatrix4fv(state.matrixUniform, false, matrix);

      bindDepth3DVertexBuffer(gl, state.lineBuffer, state.attributes);
      gl.uniform1f(state.pointModeUniform, 0);
      gl.drawArrays(gl.LINES, 0, state.lineVertices.length / 8);
      bindDepth3DVertexBuffer(gl, state.pointBuffer, state.attributes);
      gl.uniform1f(state.pointModeUniform, 1);
      gl.drawArrays(gl.POINTS, 0, state.pointVertices.length / 8);

      if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
      if (blendWasEnabled) gl.enable(gl.BLEND);
      else gl.disable(gl.BLEND);

      const canvas = state.map?.getCanvas();
      const width = canvas?.clientWidth ?? 0;
      const height = canvas?.clientHeight ?? 0;
      state.projectedPoints = state.points.flatMap((point) => {
        const projected = projectMercatorPoint(matrix, point.depthCoordinate, width, height);
        return projected ? [{ ...projected, point }] : [];
      });
    },

    onRemove(_map, gl) {
      if (state.lineBuffer) gl.deleteBuffer(state.lineBuffer);
      if (state.pointBuffer) gl.deleteBuffer(state.pointBuffer);
      if (state.program) gl.deleteProgram(state.program);
      state.map = null;
      state.gl = null;
      state.program = null;
      state.projectedPoints = [];
    }
  };

  return {
    layer,
    setData(items = [], popupForItem = null) {
      state.points = normalizeHypocenter3DItems(items, colorForDepth).map((item) => {
        const surfaceCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
          [item.longitude, item.latitude],
          0
        );
        const depthCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
          [item.longitude, item.latitude],
          -item.depthKm * 1000 * HYPOCENTER_3D_VERTICAL_EXAGGERATION
        );
        return {
          ...item,
          surfaceCoordinate,
          depthCoordinate,
          popup: popupForItem?.(item.source) ?? ""
        };
      });
      rebuildVertices(state);
      uploadBuffers(state);
      state.map?.triggerRepaint();
    },
    setEnabled(enabled) {
      state.enabled = Boolean(enabled);
      state.projectedPoints = [];
      state.map?.triggerRepaint();
    },
    pick(point, maximumDistance = 18) {
      if (!state.enabled || !point) return null;
      let closest = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const projected of state.projectedPoints) {
        const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
        const hitDistance = Math.max(maximumDistance, projected.point.pointSize / 2 + 6);
        if (distance > hitDistance || distance >= closestDistance) continue;
        closest = projected.point;
        closestDistance = distance;
      }
      return closest;
    }
  };
}

function rebuildVertices(state) {
  const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
  const lines = [];
  const points = [];
  for (const point of state.points) {
    const [red, green, blue] = parseHexColor(point.color);
    lines.push(
      point.surfaceCoordinate.x, point.surfaceCoordinate.y, point.surfaceCoordinate.z, red, green, blue, 0.18, 1,
      point.depthCoordinate.x, point.depthCoordinate.y, point.depthCoordinate.z, red, green, blue, 0.52, 1
    );
    points.push(
      point.depthCoordinate.x,
      point.depthCoordinate.y,
      point.depthCoordinate.z,
      red,
      green,
      blue,
      0.84,
      point.pointSize * pixelRatio
    );
  }
  state.lineVertices = new Float32Array(lines);
  state.pointVertices = new Float32Array(points);
}

function uploadBuffers(state) {
  const gl = state.gl;
  if (!gl || !state.lineBuffer || !state.pointBuffer) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, state.lineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, state.lineVertices, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.pointBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, state.pointVertices, gl.DYNAMIC_DRAW);
}
