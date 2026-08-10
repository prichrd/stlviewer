/*
 * STLViewer - tiny embeddable STL viewer.
 * Usage: new STLViewer(container, { url: 'model.stl' })
 */

class STLViewer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new Error('STLViewer container not found');

    this.options = {
      url: null,
      theme: 'light',
      background: '#ffffff',
      color: [0.8, 0.82, 0.86],
      grid: true,
      gridColor: [0.84, 0.87, 0.92, 0.7],
      autoResize: true,
      ...options,
    };

    if (options.theme) {
      this.setTheme(options.theme);
      if (options.background) this.options.background = options.background;
      if (options.color) this.options.color = options.color;
      if (options.gridColor) this.options.gridColor = options.gridColor;
    }

    this.rotationX = -0.45;
    this.rotationY = 0.65;
    this.zoom = 1;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.mesh = null;
    this.animationFrame = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);

    this.gl = this.canvas.getContext('webgl', { antialias: true }) || this.canvas.getContext('experimental-webgl');
    if (!this.gl) throw new Error('WebGL not supported');

    this.initGL();
    this.bindEvents();
    this.resize();

    if (this.options.autoResize && 'ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.resize);
    }

    if (this.options.url) this.load(this.options.url);
    this.render();
  }

  async load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load STL: ${response.status} ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    this.setMesh(parseSTL(buffer));
    return this;
  }

  setMesh(mesh) {
    const gl = this.gl;
    this.mesh = normalizeMesh(mesh);

    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.normalBuffer) gl.deleteBuffer(this.normalBuffer);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.vertices, gl.STATIC_DRAW);

    this.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.normals, gl.STATIC_DRAW);
  }

  setTheme(theme) {
    const next = getThemeOptions(theme);
    this.options.theme = next.name;
    this.options.background = next.background;
    this.options.color = next.color;
    this.options.gridColor = next.gridColor;
    return this;
  }

  resize = () => {
    const width = this.container.clientWidth || 640;
    const height = this.container.clientHeight || 480;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(width * ratio));
    this.canvas.height = Math.max(1, Math.floor(height * ratio));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.rotationY += dx * 0.01;
      this.rotationX += dy * 0.01;
    });

    this.canvas.addEventListener('pointerup', (event) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoom = clamp(this.zoom * (event.deltaY > 0 ? 1.1 : 0.9), 0.25, 5);
    }, { passive: false });
  }

  initGL() {
    const gl = this.gl;
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uMatrix;
      uniform mat3 uNormalMatrix;
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(uNormalMatrix * aNormal);
        gl_Position = uMatrix * vec4(aPosition, 1.0);
      }
    `);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vNormal;
      uniform vec3 uColor;
      void main() {
        vec3 light = normalize(vec3(0.4, 0.7, 1.0));
        float diffuse = max(dot(normalize(vNormal), light), 0.0);
        float shade = 0.28 + diffuse * 0.72;
        gl_FragColor = vec4(uColor * shade, 1.0);
      }
    `);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program) || 'WebGL program link failed');
    }

    const gridVertexShader = compileShader(gl, gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      uniform mat4 uMatrix;
      void main() {
        gl_Position = uMatrix * vec4(aPosition, 1.0);
      }
    `);
    const gridFragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec4 uColor;
      void main() {
        gl_FragColor = uColor;
      }
    `);

    this.gridProgram = gl.createProgram();
    gl.attachShader(this.gridProgram, gridVertexShader);
    gl.attachShader(this.gridProgram, gridFragmentShader);
    gl.linkProgram(this.gridProgram);
    if (!gl.getProgramParameter(this.gridProgram, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.gridProgram) || 'WebGL grid program link failed');
    }

    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      matrix: gl.getUniformLocation(this.program, 'uMatrix'),
      normalMatrix: gl.getUniformLocation(this.program, 'uNormalMatrix'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      gridPosition: gl.getAttribLocation(this.gridProgram, 'aPosition'),
      gridMatrix: gl.getUniformLocation(this.gridProgram, 'uMatrix'),
      gridColor: gl.getUniformLocation(this.gridProgram, 'uColor'),
    };

    this.gridBuffer = gl.createBuffer();
    this.gridVertexCount = makeGrid(gl, this.gridBuffer);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  render = () => {
    const gl = this.gl;
    const bg = hexToRgb(this.options.background);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / this.canvas.height;
    const projection = mat4Perspective(Math.PI / 4, aspect, 0.01, 100);
    const view = mat4Translate(0, 0, -3 * this.zoom);
    const gridMatrix = mat4Multiply(projection, view);

    if (this.options.grid) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.gridProgram);
      gl.uniformMatrix4fv(this.locations.gridMatrix, false, gridMatrix);
      gl.uniform4fv(this.locations.gridColor, colorToRgba(this.options.gridColor));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer);
      gl.enableVertexAttribArray(this.locations.gridPosition);
      gl.vertexAttribPointer(this.locations.gridPosition, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, this.gridVertexCount);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }

    if (this.mesh) {
      const model = mat4Multiply(
        view,
        mat4Multiply(mat4RotateX(this.rotationX), mat4RotateY(this.rotationY))
      );
      const matrix = mat4Multiply(projection, model);
      const normalMatrix = mat3FromMat4(model);

      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.locations.matrix, false, matrix);
      gl.uniformMatrix3fv(this.locations.normalMatrix, false, normalMatrix);
      gl.uniform3fv(this.locations.color, colorToRgb(this.options.color));

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.locations.position);
      gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.enableVertexAttribArray(this.locations.normal);
      gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, this.mesh.vertices.length / 3);
    }

    this.animationFrame = requestAnimationFrame(this.render);
  };

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    else window.removeEventListener('resize', this.resize);
    if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
    if (this.normalBuffer) this.gl.deleteBuffer(this.normalBuffer);
    if (this.gridBuffer) this.gl.deleteBuffer(this.gridBuffer);
    this.canvas.remove();
  }
}

function parseSTL(buffer) {
  return isBinarySTL(buffer) ? parseBinarySTL(buffer) : parseAsciiSTL(new TextDecoder().decode(buffer));
}

function isBinarySTL(buffer) {
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const faces = view.getUint32(80, true);
  return 84 + faces * 50 === buffer.byteLength;
}

function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  const faces = view.getUint32(80, true);
  const vertices = new Float32Array(faces * 9);
  const normals = new Float32Array(faces * 9);
  let offset = 84;
  let vi = 0;

  for (let i = 0; i < faces; i++) {
    const normal = [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)];
    offset += 12;
    for (let j = 0; j < 3; j++) {
      vertices[vi] = view.getFloat32(offset, true);
      vertices[vi + 1] = view.getFloat32(offset + 4, true);
      vertices[vi + 2] = view.getFloat32(offset + 8, true);
      normals[vi] = normal[0];
      normals[vi + 1] = normal[1];
      normals[vi + 2] = normal[2];
      vi += 3;
      offset += 12;
    }
    offset += 2;
  }

  return { vertices, normals };
}

function parseAsciiSTL(text) {
  const vertexMatches = [...text.matchAll(/vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g)];
  const normalMatches = [...text.matchAll(/facet\s+normal\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g)];
  const vertices = new Float32Array(vertexMatches.length * 3);
  const normals = new Float32Array(vertexMatches.length * 3);

  vertexMatches.forEach((match, index) => {
    vertices[index * 3] = Number(match[1]);
    vertices[index * 3 + 1] = Number(match[2]);
    vertices[index * 3 + 2] = Number(match[3]);
    const normal = normalMatches[Math.floor(index / 3)] || [0, 0, 0, 1];
    normals[index * 3] = Number(normal[1]);
    normals[index * 3 + 1] = Number(normal[2]);
    normals[index * 3 + 2] = Number(normal[3]);
  });

  return { vertices, normals };
}

function normalizeMesh(mesh) {
  const vertices = mesh.vertices;
  const normals = mesh.normals;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < vertices.length; i += 3) {
    min[0] = Math.min(min[0], vertices[i]);
    min[1] = Math.min(min[1], vertices[i + 1]);
    min[2] = Math.min(min[2], vertices[i + 2]);
    max[0] = Math.max(max[0], vertices[i]);
    max[1] = Math.max(max[1], vertices[i + 1]);
    max[2] = Math.max(max[2], vertices[i + 2]);
  }

  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const outVertices = new Float32Array(vertices.length);
  const outNormals = new Float32Array(normals.length);

  for (let i = 0; i < vertices.length; i += 9) {
    for (let j = 0; j < 9; j += 3) {
      outVertices[i + j] = (vertices[i + j] - center[0]) / size * 2;
      outVertices[i + j + 1] = (vertices[i + j + 1] - center[1]) / size * 2;
      outVertices[i + j + 2] = (vertices[i + j + 2] - center[2]) / size * 2;
    }

    let nx = normals[i];
    let ny = normals[i + 1];
    let nz = normals[i + 2];
    const length = Math.hypot(nx, ny, nz);
    if (!length) {
      const a = [vertices[i], vertices[i + 1], vertices[i + 2]];
      const b = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
      const c = [vertices[i + 6], vertices[i + 7], vertices[i + 8]];
      [nx, ny, nz] = faceNormal(a, b, c);
    } else {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    outNormals[i] = outNormals[i + 3] = outNormals[i + 6] = nx;
    outNormals[i + 1] = outNormals[i + 4] = outNormals[i + 7] = ny;
    outNormals[i + 2] = outNormals[i + 5] = outNormals[i + 8] = nz;
  }

  return { vertices: outVertices, normals: outNormals };
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function makeGrid(gl, buffer) {
  const size = 8;
  const step = 0.5;
  const y = -1.05;
  const vertices = [];

  for (let value = -size; value <= size + 0.0001; value += step) {
    vertices.push(-size, y, value, size, y, value);
    vertices.push(value, y, -size, value, y, size);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return vertices.length / 3;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'WebGL shader compile failed');
  }
  return shader;
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0,
  ]);
}

function mat4Translate(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

function mat4RotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function mat4RotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat3FromMat4(m) {
  return new Float32Array([
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10],
  ]);
}

function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((x) => x + x).join('') : value;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function colorToRgb(color) {
  const rgb = hexToRgb(color);
  return [rgb[0], rgb[1], rgb[2]];
}

function colorToRgba(color) {
  const rgb = hexToRgb(color);
  return [rgb[0], rgb[1], rgb[2], rgb.length > 3 ? rgb[3] : 1];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class STLViewerElement extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'theme', 'background', 'color', 'grid', 'grid-color'];
  }

  connectedCallback() {
    if (!this.style.display) this.style.display = 'block';
    if (!this.style.width) this.style.width = '100%';
    if (!this.style.height) this.style.height = '480px';
    this.viewer = new STLViewer(this, this.optionsFromAttributes());
  }

  disconnectedCallback() {
    if (this.viewer) this.viewer.dispose();
    this.viewer = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.viewer || oldValue === newValue) return;
    if (name === 'src' && newValue) this.viewer.load(newValue);
    if (name === 'theme') {
      this.viewer.setTheme(newValue || 'light');
      if (this.hasAttribute('background')) this.viewer.options.background = this.getAttribute('background');
      if (this.hasAttribute('color')) this.viewer.options.color = parseColorAttribute(this.getAttribute('color'));
      if (this.hasAttribute('grid-color')) this.viewer.options.gridColor = parseColorAttribute(this.getAttribute('grid-color'));
    }
    if (name === 'background') this.viewer.options.background = newValue || getThemeOptions(this.getAttribute('theme') || 'light').background;
    if (name === 'color') this.viewer.options.color = parseColorAttribute(newValue) || getThemeOptions(this.getAttribute('theme') || 'light').color;
    if (name === 'grid') this.viewer.options.grid = newValue !== 'false';
    if (name === 'grid-color') this.viewer.options.gridColor = parseColorAttribute(newValue) || getThemeOptions(this.getAttribute('theme') || 'light').gridColor;
  }

  optionsFromAttributes() {
    const theme = this.getAttribute('theme') || 'light';
    const themeOptions = getThemeOptions(theme);
    return {
      url: this.getAttribute('src'),
      theme,
      background: this.getAttribute('background') || themeOptions.background,
      color: parseColorAttribute(this.getAttribute('color')) || themeOptions.color,
      grid: this.getAttribute('grid') !== 'false',
      gridColor: parseColorAttribute(this.getAttribute('grid-color')) || themeOptions.gridColor,
    };
  }
}

const THEMES = {
  light: { name: 'light', background: '#ffffff', color: [0.8, 0.82, 0.86], gridColor: [0.84, 0.87, 0.92, 0.7] },
  dark: { name: 'dark', background: '#111827', color: [0.7, 0.75, 0.85], gridColor: [0.2, 0.27, 0.38, 0.7] },
};

function getThemeOptions(theme) {
  if (typeof theme === 'string') {
    const next = THEMES[theme.toLowerCase()];
    if (!next) throw new Error(`Unknown theme: ${theme}`);
    return next;
  }

  if (!theme || typeof theme !== 'object') throw new Error('Theme must be "light", "dark", or an object');
  return {
    name: theme.name || 'custom',
    background: theme.background || '#ffffff',
    color: theme.color || [0.8, 0.82, 0.86],
    gridColor: theme.gridColor || [0.84, 0.87, 0.92, 0.7],
  };
}

function parseColorAttribute(value) {
  if (!value) return null;
  if (value.trim().startsWith('#')) return value.trim();
  return value.split(',').map(Number).slice(0, 4);
}

if (typeof window !== 'undefined') {
  window.STLViewer = STLViewer;
  window.STLViewerElement = STLViewerElement;
  if ('customElements' in window && !customElements.get('stl-viewer')) {
    customElements.define('stl-viewer', STLViewerElement);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { STLViewer, STLViewerElement, parseSTL };
}
