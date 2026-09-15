/*
 * DESCENT — a scroll-driven gradient-descent journey across a loss landscape.
 *
 * Self-mounting ES module. Exports nothing.
 *
 * Contract with index.html:
 *   - mounts a <canvas> inside #scene
 *   - sets document.documentElement.dataset.scene = "on" | "off"
 *   - declines (and never downloads three.js) on no-WebGL2 / reduced-motion /
 *     low device memory / Save-Data
 *   - exposes window.__descent = { get progress(), paused }
 *
 * The visual idea: the page is an optimizer walking downhill. You start high and
 * far with the whole loss surface in view, weave between ridges as you scroll,
 * and end sitting inside the broad global basin with the minimum glowing in
 * front of you. Nothing here is decorative for its own sake — the terrain is the
 * objective, the camera is the parameter vector, the glow is the answer.
 */

/* ------------------------------------------------------------------ *
 * Palette — kept byte-identical to the custom properties on :root
 * ------------------------------------------------------------------ */
const INK = 0x0a0b0f;
const EMBER = 0xff8c42;
const EMBER_HI = 0xffc46b;
const EMBER_DEEP = 0x8a2a1c;
const ACCENT = 0x7dd3fc;

/* ------------------------------------------------------------------ *
 * World constants
 * ------------------------------------------------------------------ */
const TERRAIN_W = 560; // x extent
const TERRAIN_D = 760; // z extent
const SEGMENTS = 168; // <= 200 per contract (169 x 169 vertices)
const EMBER_COUNT = 880; // <= 900 per contract
const FOG_DENSITY = 0.003;

/** The global minimum: one broad, unmistakable basin at the far end. */
const BASIN = { x: 0, z: -230, r: 88, depth: 34 };

/** Deliberate hills, pulled into the corridor so the camera path threads them. */
const RIDGES = [
  { x: -74, z: 196, r: 62, h: 44 },
  { x: 86, z: 78, r: 70, h: 50 },
  { x: -66, z: -30, r: 58, h: 38 },
  { x: 52, z: -132, r: 52, h: 26 },
  { x: 175, z: -250, r: 90, h: 30 },
  { x: -185, z: 265, r: 95, h: 26 },
];

/**
 * Camera checkpoints: 7, one per section anchor. x alternates hard across the
 * corridor so the path actually swings past the ridges rather than flying down
 * an empty lane. The last one stays on the rim of the basin and looks *into*
 * it — sitting inside the minimum turns the glow into a full-frame white-out.
 */
const CHECKPOINTS = [
  { x: 10, z: 330 }, // #hero       — overview, high and far
  { x: -46, z: 244 }, // #work
  { x: 48, z: 152 }, // #experience
  { x: -40, z: 56 }, // #papers
  { x: 58, z: -44 }, // #skills
  { x: -30, z: -136 }, // #writing
  { x: 2, z: -150 }, // #contact    — on the rim, the minimum ahead
];

/**
 * Absolute altitude at each checkpoint. Deriving the camera from a target
 * altitude (rather than a hand-tuned clearance over noise) makes the descent
 * even by construction and self-correcting if the terrain constants move.
 */
const ALTITUDES = [128, 107, 86, 65, 44, 23, 2];

const SECTION_IDS = ['hero', 'work', 'experience', 'papers', 'skills', 'writing', 'contact'];

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';

/* ------------------------------------------------------------------ *
 * Small math helpers
 * ------------------------------------------------------------------ */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic 32-bit integer hash -> [0,1). No trig, no precision drift. */
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Classic value noise with a smoothstep interpolant. Returns [0,1]. */
function valueNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uz;
}

const ROT_C = Math.cos(0.7);
const ROT_S = Math.sin(0.7);

/** Fractal Brownian motion. Each octave rotates the domain to hide the grid. */
function fbm(x, z, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let px = x;
  let pz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise(px * freq, pz * freq) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
    const nx = px * ROT_C - pz * ROT_S;
    pz = px * ROT_S + pz * ROT_C;
    px = nx;
  }
  return sum / norm; // [-1, 1]
}

/**
 * The loss surface itself. Several hills, one broad basin at the far end,
 * edges damped so the sheet settles into fog instead of ending in a hard line.
 */
function terrainHeight(x, z) {
  let h = fbm(x * 0.0062, z * 0.0062, 4) * 42;
  h += fbm(x * 0.0195 + 11.3, z * 0.0195 - 7.1, 3) * 9;

  for (let i = 0; i < RIDGES.length; i++) {
    const r = RIDGES[i];
    const dx = x - r.x;
    const dz = z - r.z;
    h += r.h * Math.exp(-(dx * dx + dz * dz) / (2 * r.r * r.r));
  }

  // Basin: flatten the noise and sink the surface toward the global minimum.
  const bx = x - BASIN.x;
  const bz = z - BASIN.z;
  const g = Math.exp(-(bx * bx + bz * bz) / (2 * BASIN.r * BASIN.r));
  h = h * (1 - 0.93 * g) - BASIN.depth * g;

  // Rim damp.
  const e = Math.max(Math.abs(x) / (TERRAIN_W * 0.5), Math.abs(z) / (TERRAIN_D * 0.5));
  h *= 1 - smoothstep(0.72, 1, e) * 0.75;

  return h;
}

/* ------------------------------------------------------------------ *
 * Feature checks — all synchronous, all BEFORE the dynamic import so
 * three.js is never fetched when we decline.
 * ------------------------------------------------------------------ */
function hasWebGL2() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (err) {
    return false;
  }
}

function shouldDecline() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  if (!document.getElementById('scene')) return true;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return true;
  if (navigator.connection && navigator.connection.saveData) return true;
  if (!hasWebGL2()) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Shared GLSL — the terrain wireframe and the terrain point layer read
 * the same heightfield, the same pointer ripple and the same fog.
 * ------------------------------------------------------------------ */
const TERRAIN_HEAD = /* glsl */ `
  uniform float uTime;
  uniform vec2  uRipple;      // pointer position projected onto the ground plane
  uniform float uRippleAmp;
  uniform vec3  uDeep;
  uniform vec3  uEmber;
  uniform vec3  uHigh;
  uniform float uHMin;
  uniform float uHMax;
  uniform float uProgress;
  uniform vec2  uBasin;
  uniform float uBasinR;
  uniform float uFogDensity;

  attribute float aHeight;

  varying vec3  vColor;
  varying float vFog;

  // Displaces by the pointer ripple and resolves the height -> ember ramp.
  vec3 shapeVertex(vec3 p) {
    float d = distance(p.xz, uRipple);
    p.y += sin(d * 0.28 - uTime * 1.7) * exp(-d * 0.035) * uRippleAmp;

    float t = clamp((aHeight - uHMin) / max(uHMax - uHMin, 0.001), 0.0, 1.0);
    vec3 c = mix(uDeep, uEmber, smoothstep(0.0, 0.58, t));
    c = mix(c, uHigh, smoothstep(0.56, 1.0, t));

    // The landscape learns where the minimum is: the basin lifts as you arrive.
    float near = 1.0 - smoothstep(0.0, uBasinR * 2.2, distance(p.xz, uBasin));
    float intensity = 0.34 + 0.66 * t + near * uProgress * 0.55;

    vColor = c * intensity;
    return p;
  }

  // Additive layers fade to nothing, which over an ink page reads as fog to ink.
  float fogAt(float viewDepth) {
    float f = uFogDensity * max(viewDepth, 0.0);
    return exp(-f * f);
  }
`;

const LINE_VERT = /* glsl */ `
  ${TERRAIN_HEAD}
  void main() {
    vec3 p = shapeVertex(position);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFog = fogAt(-mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3  vColor;
  varying float vFog;
  void main() {
    gl_FragColor = vec4(vColor * vFog * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

const TERRAIN_POINT_VERT = /* glsl */ `
  ${TERRAIN_HEAD}
  uniform float uSize;
  uniform float uPixelRatio;
  void main() {
    vec3 p = shapeVertex(position);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFog = fogAt(-mv.z);
    gl_PointSize = clamp(uSize * uPixelRatio * (200.0 / max(-mv.z, 1.0)), 0.6, 6.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SOFT_POINT_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3  vColor;
  varying float vFog;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d2 = dot(uv, uv);
    if (d2 > 0.25) discard;
    float a = smoothstep(0.25, 0.0, d2);
    gl_FragColor = vec4(vColor * vFog * uOpacity * a, 1.0);
    #include <colorspace_fragment>
  }
`;

const EMBER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpan;
  uniform float uPixelRatio;
  uniform float uFogDensity;

  attribute float aBase;   // surface height under this ember
  attribute float aSeed;
  attribute float aSize;
  attribute vec3  aColor;

  varying vec3  vColor;
  varying float vFog;

  void main() {
    vec3 p = position;

    // Slow upward drift, wrapped in place — no CPU work per frame.
    float speed = 1.1 + aSeed * 2.4;
    float rise = mod((p.y - aBase) + uTime * speed, uSpan);
    p.y = aBase + rise;
    p.x += sin(uTime * 0.24 + aSeed * 33.0) * 3.6;
    p.z += cos(uTime * 0.19 + aSeed * 17.0) * 3.6;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float f = uFogDensity * max(-mv.z, 0.0);
    float lifecycle = rise / uSpan;
    vFog = exp(-f * f) * smoothstep(0.0, 0.14, lifecycle) * (1.0 - smoothstep(0.62, 1.0, lifecycle));

    vColor = aColor;
    gl_PointSize = clamp(aSize * uPixelRatio * (150.0 / max(-mv.z, 1.0)), 0.7, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`;

/* ------------------------------------------------------------------ *
 * Init
 * ------------------------------------------------------------------ */
const root = document.documentElement;

/** Hand the main thread back between slices of a long build. */
const yieldToBrowser =
  typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function'
    ? () => scheduler.yield()
    : () => new Promise((resolve) => setTimeout(resolve, 0));

if (shouldDecline()) {
  root.dataset.scene = 'off';
  // Keep the debug handle shaped the same in both states.
  window.__descent = { get progress() { return 0; }, paused: true };
} else {
  root.dataset.scene = 'off'; // stays "off" until the first frame actually lands
  init().catch(() => {
    root.dataset.scene = 'off';
  });
}

async function init() {
  const THREE = await import(/* @vite-ignore */ THREE_URL);

  const mount = document.getElementById('scene');
  if (!mount) {
    root.dataset.scene = 'off';
    return;
  }

  /* ---------------- renderer ---------------- */
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(INK, FOG_DENSITY);

  const camera = new THREE.PerspectiveCamera(54, 1, 0.5, 1100);

  /* ---------------- terrain geometry ---------------- */
  // Scale the scene to the device rather than running one fixed budget: small
  // or high-DPR screens get a coarser grid and no point layer at all, which is
  // where most of the blended fill cost lives.
  const small =
    Math.min(window.innerWidth, window.innerHeight) < 720 || (window.devicePixelRatio || 1) > 2;
  const segments = small ? 96 : SEGMENTS;

  let alive = true;

  // PlaneGeometry baked flat so position.y is the height and no object rotation
  // is needed — the vertex shader can then displace straight along y.
  const plane = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_D, segments, segments);
  plane.rotateX(-Math.PI / 2);

  const basePositions = plane.attributes.position.array;
  const vertexCount = plane.attributes.position.count;
  const heights = new Float32Array(vertexCount);

  let hMin = Infinity;
  let hMax = -Infinity;

  // Baking tens of thousands of heights is a long task if done in one go, and
  // it lands exactly when the visitor is most likely to tap or scroll. Slice it
  // and yield, checking for teardown between slices.
  // Multiple of 3 so the decimated point pass below keeps its stride across slices.
  const BAKE_CHUNK = 4002;
  for (let start = 0; start < vertexCount; start += BAKE_CHUNK) {
    const end = Math.min(start + BAKE_CHUNK, vertexCount);
    for (let i = start; i < end; i++) {
      const x = basePositions[i * 3];
      const z = basePositions[i * 3 + 2];
      const y = terrainHeight(x, z);
      basePositions[i * 3 + 1] = y;
      heights[i] = y;
      if (y < hMin) hMin = y;
      if (y > hMax) hMax = y;
    }
    if (end < vertexCount) {
      await yieldToBrowser();
      if (!alive) {
        plane.dispose();
        root.dataset.scene = 'off';
        return;
      }
    }
  }

  // The plane's own array becomes the attribute array — no duplicate copy left
  // pinned in the closure for the life of the page.
  const positionAttr = new THREE.Float32BufferAttribute(basePositions, 3);
  const heightAttr = new THREE.Float32BufferAttribute(heights, 1);
  plane.dispose(); // we only needed it to lay out the grid

  // A quad grid rather than WireframeGeometry: half the segments, and no
  // triangulation diagonals, so the surface reads as contour lines instead of
  // a mesh of triangles.
  const cols = segments + 1;
  const edgeCount = 2 * segments * cols;
  const indices = new Uint16Array(edgeCount * 2);
  let w = 0;
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (col < segments) {
        indices[w++] = i;
        indices[w++] = i + 1;
      }
      if (row < segments) {
        indices[w++] = i;
        indices[w++] = i + cols;
      }
    }
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', positionAttr);
  lineGeo.setAttribute('aHeight', heightAttr);
  lineGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  // The point layer gets its own decimated, half-cell-offset buffer. Sharing
  // the line buffer put a bright dot on every grid crossing, which reads as a
  // lattice; offset into the cells it reads as haze floating over the surface.
  let pointGeo = null;
  if (!small) {
    const cellW = TERRAIN_W / segments;
    const cellD = TERRAIN_D / segments;
    const pointCount = Math.ceil(vertexCount / 3);
    const offPos = new Float32Array(pointCount * 3);
    const offHeight = new Float32Array(pointCount);
    let p = 0;
    for (let start = 0; start < vertexCount; start += BAKE_CHUNK) {
      const end = Math.min(start + BAKE_CHUNK, vertexCount);
      for (let i = start; i < end; i += 3) {
        const x = basePositions[i * 3] + cellW * 0.5;
        const z = basePositions[i * 3 + 2] + cellD * 0.5;
        const y = terrainHeight(x, z);
        offPos[p * 3] = x;
        offPos[p * 3 + 1] = y;
        offPos[p * 3 + 2] = z;
        offHeight[p] = y;
        p++;
      }
      if (end < vertexCount) {
        await yieldToBrowser();
        if (!alive) {
          lineGeo.dispose();
          root.dataset.scene = 'off';
          return;
        }
      }
    }
    pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(offPos, 3));
    pointGeo.setAttribute('aHeight', new THREE.Float32BufferAttribute(offHeight, 1));
  }

  /* ---------------- terrain uniforms (shared object) ---------------- */
  const terrainUniforms = {
    uTime: { value: 0 },
    uRipple: { value: new THREE.Vector2(0, 0) },
    uRippleAmp: { value: 1.4 },
    uDeep: { value: new THREE.Color(EMBER_DEEP) },
    uEmber: { value: new THREE.Color(EMBER) },
    uHigh: { value: new THREE.Color(EMBER_HI) },
    uHMin: { value: hMin },
    uHMax: { value: hMax },
    uProgress: { value: 0 },
    uBasin: { value: new THREE.Vector2(BASIN.x, BASIN.z) },
    uBasinR: { value: BASIN.r },
    uFogDensity: { value: scene.fog.density },
  };

  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uOpacity: { value: 0.52 } }, terrainUniforms),
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const terrainPointMaterial = pointGeo
    ? new THREE.ShaderMaterial({
        uniforms: Object.assign(
          { uOpacity: { value: 0.22 }, uSize: { value: 1.6 }, uPixelRatio: { value: pixelRatio } },
          terrainUniforms
        ),
        vertexShader: TERRAIN_POINT_VERT,
        fragmentShader: SOFT_POINT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    : null;

  const terrainLines = new THREE.LineSegments(lineGeo, lineMaterial);
  terrainLines.frustumCulled = false;
  scene.add(terrainLines);

  if (pointGeo && terrainPointMaterial) {
    const terrainPoints = new THREE.Points(pointGeo, terrainPointMaterial);
    terrainPoints.frustumCulled = false;
    scene.add(terrainPoints);
  }

  /* ---------------- camera + look curves ---------------- */
  // Derived from the altitude ladder, with a hard 8-unit floor over the actual
  // surface so the path can never ride up over a hill.
  const camPoints = CHECKPOINTS.map(
    (cp, i) =>
      new THREE.Vector3(cp.x, Math.max(ALTITUDES[i], terrainHeight(cp.x, cp.z) + 8), cp.z)
  );
  const camCurve = new THREE.CatmullRomCurve3(camPoints, false, 'centripetal', 0.5);

  const basinFloor = terrainHeight(BASIN.x, BASIN.z);
  const glowPos = new THREE.Vector3(BASIN.x, basinFloor + 3.2, BASIN.z);

  // An explicit pitch ladder rather than a derived drop: start shallow so the
  // hero frame actually contains a horizon and the far ridgeline recedes into
  // fog, then steepen as the descent converges on the basin.
  const PITCH_DEG = [11, 14, 17, 19, 22, 26, 24];
  const lookPoints = camPoints.map((p, i) => {
    const j = Math.min(i + 2, camPoints.length - 1);
    const dx = camPoints[j].x - p.x;
    const dz = camPoints[j].z - p.z;
    const horiz = Math.max(Math.hypot(dx, dz), 120);
    const drop = horiz * Math.tan((PITCH_DEG[i] * Math.PI) / 180);
    return new THREE.Vector3(p.x + dx, p.y - drop, p.z + dz);
  });
  lookPoints[lookPoints.length - 1] = glowPos.clone();
  lookPoints[lookPoints.length - 2].lerp(glowPos, 0.55);
  const lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal', 0.5);

  /* ---------------- the minimum ---------------- */
  const glowTexture = makeGlowTexture(THREE);

  const glowCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(EMBER_HI),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.2,
    })
  );
  glowCore.position.copy(glowPos);
  scene.add(glowCore);

  const glowHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(EMBER),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.1,
    })
  );
  glowHalo.position.copy(glowPos);
  scene.add(glowHalo);

  /* ---------------- embers ---------------- */
  const emberSpan = 76;
  const emberPos = new Float32Array(EMBER_COUNT * 3);
  const emberBase = new Float32Array(EMBER_COUNT);
  const emberSeed = new Float32Array(EMBER_COUNT);
  const emberSize = new Float32Array(EMBER_COUNT);
  const emberColor = new Float32Array(EMBER_COUNT * 3);

  const warm = new THREE.Color(EMBER);
  const warmHi = new THREE.Color(EMBER_HI);
  const cool = new THREE.Color(ACCENT).multiplyScalar(0.55);
  const scratch = new THREE.Vector3();

  for (let i = 0; i < EMBER_COUNT; i++) {
    // Seed along the camera corridor so embers are wherever the journey goes.
    camCurve.getPoint(Math.random(), scratch);
    const x = clamp(scratch.x + (Math.random() - 0.5) * 190, -TERRAIN_W / 2, TERRAIN_W / 2);
    const z = clamp(scratch.z + (Math.random() - 0.5) * 190, -TERRAIN_D / 2, TERRAIN_D / 2);
    const base = terrainHeight(x, z) + 1.5;

    emberPos[i * 3] = x;
    emberPos[i * 3 + 1] = base + Math.random() * emberSpan;
    emberPos[i * 3 + 2] = z;
    emberBase[i] = base;
    emberSeed[i] = Math.random();
    emberSize[i] = 1.4 + Math.random() * 2.4;

    // A few cool sparks among the warm ones give the swarm depth.
    const c = i % 12 === 0 ? cool : Math.random() < 0.35 ? warmHi : warm;
    emberColor[i * 3] = c.r;
    emberColor[i * 3 + 1] = c.g;
    emberColor[i * 3 + 2] = c.b;
  }

  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.Float32BufferAttribute(emberPos, 3));
  emberGeo.setAttribute('aBase', new THREE.Float32BufferAttribute(emberBase, 1));
  emberGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(emberSeed, 1));
  emberGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(emberSize, 1));
  emberGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(emberColor, 3));

  const emberMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpan: { value: emberSpan },
      uPixelRatio: { value: pixelRatio },
      uFogDensity: { value: scene.fog.density },
      uOpacity: { value: 0.75 },
    },
    vertexShader: EMBER_VERT,
    fragmentShader: SOFT_POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const embers = new THREE.Points(emberGeo, emberMaterial);
  embers.frustumCulled = false;
  scene.add(embers);

  /* ---------------- scroll model ---------------- */
  let scrollMax = 1;
  let sectionStops = null;
  let scrollDirty = true;
  let targetProgress = 0;
  let progress = 0;

  function measure() {
    // Where the camera is right now, in curve space, under the OLD mapping.
    const tBefore = sectionStops ? progressToT(progress) : null;

    scrollMax = Math.max(root.scrollHeight - window.innerHeight, 1);

    const stops = [];
    for (let i = 0; i < SECTION_IDS.length; i++) {
      const el = document.getElementById(SECTION_IDS[i]);
      if (!el) {
        sectionStops = null;
        scrollDirty = true;
        return;
      }
      stops.push(clamp((el.getBoundingClientRect().top + window.scrollY) / scrollMax, 0, 1));
    }
    // Force a strictly increasing ramp so the mapping can never invert.
    // The last stop is left where #contact actually sits: arriving at the
    // contact section is arriving at the minimum, not scrolling past it.
    stops[0] = 0;
    for (let i = 1; i < stops.length; i++) {
      stops[i] = Math.max(stops[i], stops[i - 1] + 1e-4);
    }
    // The fix-up above can push the tail past 1 on very tall viewports, which
    // would strand the camera a checkpoint short of the basin. Re-normalise:
    // strictly increasing is preserved, and the final stop lands exactly on 1.
    const last = stops[stops.length - 1];
    if (last > 1) {
      for (let i = 1; i < stops.length; i++) stops[i] /= last;
    }
    sectionStops = stops;

    // A re-measure should move the mapping, not the camera: solve for the
    // progress that reproduces the pre-measure curve position.
    if (tBefore !== null) {
      const back = tToProgress(tBefore);
      progress = back;
      targetProgress = back;
    }
    scrollDirty = true;
  }

  /** Map page progress to curve t so each section lands on its checkpoint. */
  function progressToT(p) {
    if (!sectionStops) return p;
    const segments = sectionStops.length - 1;
    for (let i = 0; i < segments; i++) {
      if (p <= sectionStops[i + 1]) {
        const span = sectionStops[i + 1] - sectionStops[i];
        const local = span > 0 ? (p - sectionStops[i]) / span : 0;
        return (i + clamp(local, 0, 1)) / segments;
      }
    }
    return 1;
  }

  /** The inverse of progressToT — used to keep the camera still on re-measure. */
  function tToProgress(t) {
    if (!sectionStops) return t;
    const segments = sectionStops.length - 1;
    const scaled = clamp(t, 0, 1) * segments;
    const i = Math.min(Math.floor(scaled), segments - 1);
    const local = scaled - i;
    return sectionStops[i] + (sectionStops[i + 1] - sectionStops[i]) * local;
  }

  /* ---------------- pointer ---------------- */
  const pointer = new THREE.Vector2(0, 0);
  const pointerTarget = new THREE.Vector2(0, 0);
  const rippleTarget = new THREE.Vector2(BASIN.x, BASIN.z);
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();

  function onPointerMove(e) {
    pointerTarget.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1)
    );
  }
  function onPointerOut() {
    pointerTarget.set(0, 0);
  }

  /** Where the pointer lands on the ground plane — drives the ripple centre. */
  function updateRippleTarget() {
    camera.updateMatrixWorld();
    rayOrigin.set(pointer.x, pointer.y, 0.5).unproject(camera);
    rayDir.copy(rayOrigin).sub(camera.position).normalize();
    // Intersect the surface under the camera, not the y = 0 plane — inside the
    // basin the camera drops below 0 and the ripple would collapse onto itself.
    const planeY = terrainHeight(camera.position.x, camera.position.z);
    if (rayDir.y < -1e-4 && camera.position.y > planeY) {
      const t = clamp((planeY - camera.position.y) / rayDir.y, 0, 600);
      rippleTarget.set(camera.position.x + rayDir.x * t, camera.position.z + rayDir.z * t);
    }
  }

  /* ---------------- listeners ---------------- */
  let resizeTimer = 0;
  function resize() {
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    const aspect = w / Math.max(h, 1);
    camera.aspect = aspect;
    // Widen the lens on tall/narrow viewports so the landscape still reads.
    camera.fov = clamp(54 / Math.min(Math.max(aspect, 0.4), 1), 54, 76);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    measure();
  }
  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 160);
  }

  function onScroll() {
    scrollDirty = true;
  }

  let paused = false;
  function onVisibility() {
    if (document.hidden) {
      paused = true;
    } else if (!manualPause) {
      paused = false;
      clock.getDelta(); // swallow the gap so nothing jumps on resume
    }
  }

  let manualPause = false;
  const motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  function onMotionPreference(e) {
    if (e.matches) destroy();
  }

  function onContextLost(e) {
    e.preventDefault();
    destroy();
  }

  // pagehide also fires on the way into the bfcache. Tearing the scene down
  // there leaves a permanently dead page behind the Back button.
  function onPageHide(e) {
    if (e.persisted) {
      paused = true;
      return;
    }
    destroy();
  }
  function onPageShow(e) {
    if (e.persisted && alive) {
      paused = manualPause || document.hidden;
      clock.getDelta(); // swallow the restore gap
      measure();
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerOut, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  if (motionQuery && motionQuery.addEventListener) {
    motionQuery.addEventListener('change', onMotionPreference);
  }

  // The chatbot and late-loading content can change page height under us.
  let heightObserver = null;
  let measureTimer = 0;
  if (typeof ResizeObserver !== 'undefined') {
    heightObserver = new ResizeObserver(() => {
      window.clearTimeout(measureTimer);
      measureTimer = window.setTimeout(measure, 200);
    });
    heightObserver.observe(document.body);
  }

  /* ---------------- loop ---------------- */
  const clock = new THREE.Clock();
  const camPoint = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  let frame = 0;
  let mounted = false;
  let sceneTime = 0;

  mount.appendChild(canvas);
  resize();

  function render() {
    // Own clock: THREE.Clock.elapsedTime absorbs the whole hidden-tab gap, which
    // teleports every time-driven animation on resume and eventually pushes
    // float32 past the animation step. dt is already clamped, so accumulate it.
    const dt = Math.min(clock.getDelta(), 0.05);
    sceneTime += dt;
    if (sceneTime > 3600) sceneTime -= 3600;
    const time = sceneTime;

    if (scrollDirty) {
      scrollDirty = false;
      targetProgress = clamp(window.scrollY / scrollMax, 0, 1);
    }

    // Frame-rate independent exponential easing (~0.06 per frame at 60fps).
    const k = 1 - Math.pow(0.94, dt * 60);
    progress += (targetProgress - progress) * k;
    pointer.x += (pointerTarget.x - pointer.x) * k;
    pointer.y += (pointerTarget.y - pointer.y) * k;

    const t = progressToT(progress);

    camCurve.getPoint(t, camPoint);
    lookCurve.getPoint(Math.min(t + 0.02, 1), lookPoint);

    // Idle drift, damped as you settle into the basin.
    const calm = 1 - 0.65 * t;
    camPoint.x += Math.sin(time * 0.31) * 0.9 * calm + pointer.x * 2.6;
    camPoint.y += Math.sin(time * 0.23 + 1.3) * 0.55 * calm;
    camPoint.z += Math.cos(time * 0.19) * 0.7 * calm;

    // Never let the spline clip through a ridge.
    const floor = terrainHeight(camPoint.x, camPoint.z) + 5;
    if (camPoint.y < floor) camPoint.y = floor;

    camera.position.copy(camPoint);
    lookPoint.x += pointer.x * 5.5;
    lookPoint.y += pointer.y * 3.2;
    camera.lookAt(lookPoint);
    // Breathing roll only. A progress-linked term leaves the horizon canted a
    // permanent ~3° under dead-level type, which reads as a rendering fault.
    camera.rotateZ(Math.sin(time * 0.17) * 0.01 + pointer.x * 0.015);

    updateRippleTarget();
    const ripple = terrainUniforms.uRipple.value;
    ripple.x += (rippleTarget.x - ripple.x) * Math.min(k * 1.6, 1);
    ripple.y += (rippleTarget.y - ripple.y) * Math.min(k * 1.6, 1);

    terrainUniforms.uTime.value = time;
    terrainUniforms.uProgress.value = t;
    emberMaterial.uniforms.uTime.value = time;

    // The minimum brightens as the descent converges.
    const arrival = smoothstep(0.4, 1, t);
    const pulse = 1 + Math.sin(time * 1.1) * 0.04;
    // Clamp the sprites by actual distance so the halo can never exceed the
    // frame, and cap brightness — the beat is a glow, not a blown exposure.
    const fit = Math.min(1, camera.position.distanceTo(glowPos) / 95);
    glowCore.material.opacity = 0.14 + arrival * 0.42;
    glowHalo.material.opacity = 0.05 + arrival * 0.22;
    const coreScale = (8 + arrival * 19) * pulse * fit;
    glowCore.scale.set(coreScale, coreScale, 1);
    const haloScale = (34 + arrival * 92) * pulse * fit;
    glowHalo.scale.set(haloScale, haloScale, 1);

    renderer.render(scene, camera);

    if (!mounted) {
      mounted = true;
      root.dataset.scene = 'on';
    }
  }

  function tick() {
    if (!alive) return;
    frame = window.requestAnimationFrame(tick);
    if (paused) return;
    render();
  }

  // Draw one frame before flipping the flag so the fallback never flashes.
  render();
  frame = window.requestAnimationFrame(tick);

  /* ---------------- debug handle ---------------- */
  window.__descent = {
    get progress() {
      return progress;
    },
    get paused() {
      return manualPause || paused;
    },
    set paused(v) {
      manualPause = !!v;
      paused = manualPause || document.hidden;
      if (!paused) clock.getDelta();
    },
    destroy,
  };

  // Keep the render loop off while the tab is already backgrounded at mount.
  if (document.hidden) paused = true;

  /* ---------------- teardown ---------------- */
  function destroy() {
    if (!alive) return;
    alive = false;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(resizeTimer);
    window.clearTimeout(measureTimer);

    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    if (motionQuery && motionQuery.removeEventListener) {
      motionQuery.removeEventListener('change', onMotionPreference);
    }
    if (heightObserver) heightObserver.disconnect();

    lineGeo.dispose();
    if (pointGeo) pointGeo.dispose();
    emberGeo.dispose();
    lineMaterial.dispose();
    if (terrainPointMaterial) terrainPointMaterial.dispose();
    emberMaterial.dispose();
    glowCore.material.dispose();
    glowHalo.material.dispose();
    glowTexture.dispose();
    scene.clear();

    renderer.dispose();
    // dispose() releases three's GPU objects but not the context itself, and
    // browsers cap concurrent contexts.
    if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    // Match the declined shape exactly, so a debugging consumer can tell.
    window.__descent = {
      get progress() {
        return 0;
      },
      paused: true,
    };
    root.dataset.scene = 'off';
  }
}

/* ------------------------------------------------------------------ *
 * A soft radial falloff, drawn once into a small canvas.
 * ------------------------------------------------------------------ */
function makeGlowTexture(THREE) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,224,180,0.95)');
  g.addColorStop(0.18, 'rgba(255,196,107,0.85)');
  g.addColorStop(0.45, 'rgba(255,140,66,0.32)');
  g.addColorStop(0.75, 'rgba(138,42,28,0.08)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
