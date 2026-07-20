import { PLATE_DEPTH_3D_VERTICAL_EXAGGERATION } from "./plateDepth3DGeometry.js";
import { normalizePlateDepthSurfaceTriangles } from "./plateDepthSurfaceGeometry.js";
import {
  DEPTH_3D_VERTEX_STRIDE,
  bindDepth3DVertexBuffer,
  createDepth3DProgram,
  getDepth3DZoomScale,
  getDepth3DProgramBindings
} from "./depth3DRenderer.js";

export const PLATE_DEPTH_SURFACE_3D_LAYER_ID = "meteoscope-usgs-slab2-surface-3d";
export const PLATE_DEPTH_SURFACE_ALPHA = 0.22;

export function createPlateDepthSurface3DLayer(maplibregl, colorForDepth) {
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
    id: PLATE_DEPTH_SURFACE_3D_LAYER_ID,
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
      gl.uniform1f(state.bindings.depthScaleUniform, getDepth3DZoomScale(state.map?.getZoom()));
      gl.uniform1f(state.bindings.pointModeUniform, 0);
      bindDepth3DVertexBuffer(gl, state.buffer, state.bindings.attributes);
      gl.drawArrays(gl.TRIANGLES, 0, state.vertices.length / DEPTH_3D_VERTEX_STRIDE);
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
      for (const triangle of normalizePlateDepthSurfaceTriangles(collection, colorForDepth)) {
        for (const vertex of triangle) {
          const projected = maplibregl.MercatorCoordinate.fromLngLat(
            vertex.coordinate,
            -vertex.depthKm * 1000 * PLATE_DEPTH_3D_VERTICAL_EXAGGERATION
          );
          const [red, green, blue] = vertex.colorComponents;
          vertices.push(projected.x, projected.y, projected.z, red, green, blue, PLATE_DEPTH_SURFACE_ALPHA, 1);
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
}

function uploadBuffer(state) {
  if (!state.gl || !state.buffer) return;
  state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.buffer);
  state.gl.bufferData(state.gl.ARRAY_BUFFER, state.vertices, state.gl.STATIC_DRAW);
}
