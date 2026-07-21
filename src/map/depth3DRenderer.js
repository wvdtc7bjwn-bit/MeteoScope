export const DEPTH_3D_VERTEX_STRIDE = 8;
export const DEPTH_3D_REFERENCE_ZOOM = 5;
export const DEPTH_3D_ZOOM_FALLOFF = 0.65;
export const DEPTH_3D_MIN_ZOOM_SCALE = 1 / 16;

export function getDepth3DZoomScale(zoom) {
  const numericZoom = Number(zoom);
  if (!Number.isFinite(numericZoom)) return 1;
  return Math.max(
    DEPTH_3D_MIN_ZOOM_SCALE,
    Math.min(
      1,
      2 ** ((DEPTH_3D_REFERENCE_ZOOM - numericZoom) * DEPTH_3D_ZOOM_FALLOFF)
    )
  );
}

export function createDepth3DProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
    precision highp float;
    uniform mat4 u_matrix;
    uniform float u_depth_scale;
    in vec3 a_position;
    in vec4 a_color;
    in float a_size;
    out vec4 v_color;
    void main() {
      vec3 scaledPosition = vec3(a_position.xy, a_position.z * u_depth_scale);
      gl_Position = u_matrix * vec4(scaledPosition, 1.0);
      gl_PointSize = a_size;
      v_color = a_color;
    }
  `);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    uniform float u_point_mode;
    in vec4 v_color;
    out vec4 fragColor;
    void main() {
      if (u_point_mode > 0.5) {
        vec2 centered = gl_PointCoord - vec2(0.5);
        if (length(centered) > 0.5) discard;
      }
      fragColor = v_color;
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "3D layer program link failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export function getDepth3DProgramBindings(gl, program) {
  return {
    attributes: {
      position: gl.getAttribLocation(program, "a_position"),
      color: gl.getAttribLocation(program, "a_color"),
      size: gl.getAttribLocation(program, "a_size")
    },
    matrixUniform: gl.getUniformLocation(program, "u_matrix"),
    depthScaleUniform: gl.getUniformLocation(program, "u_depth_scale"),
    pointModeUniform: gl.getUniformLocation(program, "u_point_mode")
  };
}

export function bindDepth3DVertexBuffer(gl, buffer, attributes) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = DEPTH_3D_VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(attributes.position);
  gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(attributes.color);
  gl.vertexAttribPointer(attributes.color, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(attributes.size);
  gl.vertexAttribPointer(attributes.size, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "3D layer shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}
