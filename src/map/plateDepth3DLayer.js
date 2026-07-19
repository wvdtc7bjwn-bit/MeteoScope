import {
  PLATE_DEPTH_3D_VERTICAL_EXAGGERATION,
  normalizePlateDepthContours
} from "./plateDepth3DGeometry.js";
import {
  DEPTH_3D_VERTEX_STRIDE,
  bindDepth3DVertexBuffer,
  createDepth3DProgram,
  getDepth3DProgramBindings
} from "./depth3DRenderer.js";

export const PLATE_DEPTH_3D_LAYER_ID = "meteoscope-usgs-slab2-depth-3d";

export function createPlateDepth3DLayer(maplibregl, colorForDepth) {
  const state = {
    map: null,
    gl: null,
    program: null,
    buffer: null,
    bindings: null,
    vertices: new Float32Array(),
    enabled: false
  };

  const layer = {
    id: PLATE_DEPTH_3D_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      state.map = map;
      state.gl = gl;
      state.program = createDepth3DProgram(gl);
      state.bindings = getDepth3DProgramBindings(gl, state.program);
      state.buffer = gl.createBuffer();
      uploadBuffer(state);
    },

    render(gl, renderArgs) {
      if (!state.enabled || state.vertices.length === 0 || !state.program || !state.bindings) return;
      const matrix = renderArgs?.defaultProjectionData?.mainMatrix ?? renderArgs;
      if (!matrix) return;

      const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
      const blendWasEnabled = gl.isEnabled(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(state.program);
      gl.uniformMatrix4fv(state.bindings.matrixUniform, false, matrix);
      gl.uniform1f(state.bindings.pointModeUniform, 0);
      bindDepth3DVertexBuffer(gl, state.buffer, state.bindings.attributes);
      gl.drawArrays(gl.LINES, 0, state.vertices.length / DEPTH_3D_VERTEX_STRIDE);

      if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
      if (blendWasEnabled) gl.enable(gl.BLEND);
      else gl.disable(gl.BLEND);
    },

    onRemove(_map, gl) {
      if (state.buffer) gl.deleteBuffer(state.buffer);
      if (state.program) gl.deleteProgram(state.program);
      state.map = null;
      state.gl = null;
      state.program = null;
      state.bindings = null;
    }
  };

  return {
    layer,
    setData(collection) {
      const vertices = [];
      for (const contour of normalizePlateDepthContours(collection, colorForDepth)) {
        const [red, green, blue] = contour.colorComponents;
        for (const line of contour.lines) {
          let previous = depthCoordinate(line[0], contour.depthKm);
          for (let index = 1; index < line.length; index += 1) {
            const current = depthCoordinate(line[index], contour.depthKm);
            vertices.push(
              previous.x, previous.y, previous.z, red, green, blue, 0.78, 1,
              current.x, current.y, current.z, red, green, blue, 0.78, 1
            );
            previous = current;
          }
        }
      }
      state.vertices = new Float32Array(vertices);
      uploadBuffer(state);
      state.map?.triggerRepaint();
    },
    setEnabled(enabled) {
      state.enabled = Boolean(enabled);
      state.map?.triggerRepaint();
    }
  };

  function depthCoordinate(coordinate, depthKm) {
    return maplibregl.MercatorCoordinate.fromLngLat(
      coordinate,
      -depthKm * 1000 * PLATE_DEPTH_3D_VERTICAL_EXAGGERATION
    );
  }
}

function uploadBuffer(state) {
  if (!state.gl || !state.buffer) return;
  state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.buffer);
  state.gl.bufferData(state.gl.ARRAY_BUFFER, state.vertices, state.gl.STATIC_DRAW);
}
