import { detectLanguage, normalizeLanguage, translateText } from "./i18n.js";

const query = new URLSearchParams(window.location.search);
const language = normalizeLanguage(query.get("lang")) ?? detectLanguage({
  languages: navigator.languages ?? [],
  language: navigator.language,
});

function t(key, variables) {
  return translateText(language, key, variables);
}

const PUBLIC_GAME_URL = "https://plan9.kr/goosl/";
const DISCORD_URL = "https://discord.gg/MA6xyVAkt";

const canvas = document.querySelector("#marble-canvas");
const stage = document.querySelector(".stage");
const errorBox = document.querySelector("#webgl-error");
const countSlider = document.querySelector("#marble-count");
const countOutput = document.querySelector("#count-output");
const drawCount = document.querySelector("#draw-count");
const fpsLabel = document.querySelector("#fps");
const performancePanel = document.querySelector(".performance");
const motionButton = document.querySelector("#motion-toggle");
const tiltButton = document.querySelector("#tilt-toggle");
const soundButton = document.querySelector("#sound-toggle");
const menuButton = document.querySelector("#menu-toggle");
const helpButton = document.querySelector("#help-button");
const helpBackdrop = document.querySelector("#help-backdrop");
const helpDialog = document.querySelector("#help-dialog");
const helpCloseButton = document.querySelector("#help-close");
const helpConfirmButton = document.querySelector("#help-confirm");
const scatterButton = document.querySelector("#scatter");
const backgroundButtons = [...document.querySelectorAll("[data-background]")];
const modeButtons = [...document.querySelectorAll("[data-mode-button]")];
const freeControls = document.querySelector("#free-controls");
const gameHud = document.querySelector("#game-hud");
const targetScore = document.querySelector("#target-score");
const shotsLeft = document.querySelector("#shots-left");
const restartGameButton = document.querySelector("#restart-game");
const shareResultButton = document.querySelector("#share-result");
const resultPanel = document.querySelector("#result-panel");
const resultStars = document.querySelector("#result-stars");
const resultScore = document.querySelector("#result-score");
const resultContinueButton = document.querySelector("#result-continue");
const resultRestartButton = document.querySelector("#result-restart");
const resultShareButton = document.querySelector("#result-share");
const toast = document.querySelector("#toast");
const aimLayer = document.querySelector("#aim-layer");
const aimLine = document.querySelector("#aim-line");
const aimDot = document.querySelector("#aim-dot");
const powerMeter = document.querySelector("#power-meter");
const powerFill = document.querySelector("#power-fill");
const powerOutput = document.querySelector("#power-output");
const motionState = document.querySelector("#motion-state");
const discordLink = document.querySelector(".discord-link");
const resultTitle = document.querySelector("#result-title");
const HELP_SEEN_STORAGE_KEY = "goosl-help-seen-v1";
let helpReturnFocus = helpButton;

function applyDocumentLanguage() {
  document.documentElement.lang = language;
  document.title = t("document.title");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-content]").forEach((element) => {
    element.setAttribute("content", t(element.dataset.i18nContent));
  });
  const thumbnailUrl = new URL(t("document.thumbnail"), PUBLIC_GAME_URL).href;
  document.querySelector('meta[property="og:image"]')?.setAttribute("content", thumbnailUrl);
  document.querySelector('meta[property="og:image:secure_url"]')?.setAttribute("content", thumbnailUrl);
  document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", thumbnailUrl);
  document.querySelector('link[rel="image_src"]')?.setAttribute("href", thumbnailUrl);
  resultStars.setAttribute("aria-label", t("result.stars", { count: 0 }));
}

applyDocumentLanguage();

function openHelpDialog(returnFocus = document.activeElement) {
  helpReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : helpButton;
  helpBackdrop.hidden = false;
  helpButton.setAttribute("aria-expanded", "true");
  helpDialog.focus();
}

function openFirstVisitHelp() {
  try {
    if (window.localStorage.getItem(HELP_SEEN_STORAGE_KEY) === "1") return;
    window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, "1");
    openHelpDialog(helpButton);
  } catch {
    // 저장소가 차단된 환경에서는 반복 노출을 피하기 위해 자동으로 열지 않는다.
  }
}

function closeHelpDialog() {
  if (helpBackdrop.hidden) return;
  helpBackdrop.hidden = true;
  helpButton.setAttribute("aria-expanded", "false");
  helpReturnFocus?.focus();
}

function handleHelpKeydown(event) {
  if (helpBackdrop.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeHelpDialog();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = [...helpDialog.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.hidden && !element.hasAttribute("disabled"));
  if (focusable.length === 0) {
    event.preventDefault();
    helpDialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: true,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  powerPreference: "high-performance",
});

if (!gl) {
  errorBox.hidden = false;
  throw new Error("WebGL 2 is not supported in this browser.");
}

const TAU = Math.PI * 2;
const INSTANCE_FLOATS = 31;
const MAX_MARBLES = 72;
const BASE_WORLD_HEIGHT = 18;
const MAX_DPR = 2;
const FIXED_STEP = 1 / 120;
const MAX_PHYSICS_STEPS = 8;
const FAST_ROLLING_DRAG = 0.38;
const MEDIUM_ROLLING_DRAG = 0.88;
const SLOW_ROLLING_DRAG = 2.2;
const WALL_RESTITUTION = 0.90;
const COLLISION_RESTITUTION = 0.95;
const SLEEP_SPEED = 0.028;
const SLEEP_DELAY = 0.18;
const FREE_TILT_ACCELERATION = 7.2;
const FREE_TILT_MAX_SPEED = 7.5;
const FREE_TILT_RANGE = 24;
const FREE_TILT_DEAD_ZONE = 1.4;
const GAME_TARGET_COUNT = 7;
const GAME_SHOT_COUNT = 6;
const GAME_RING_CENTER = [0, 1.0];
const GAME_RING_RADIUS = 3.0;
const GAME_SHOOTER_ORIGIN = [0, -5.0];
const GAME_MAX_PULL = 2.35;
const GAME_MIN_PULL = 0.24;
const GAME_SHOT_POWER = 4.55;
const GAME_MAX_SHOT_TIME = 9;
const GAME_SETTLE_TIME = 0.45;
const SPAWN_STAGGER = 0.095;
const SPAWN_DURATION = 0.62;

const palettes = [
  [[0.90, 0.22, 0.055], [1.00, 0.60, 0.12]],
  [[0.035, 0.34, 0.76], [0.07, 0.72, 0.78]],
  [[0.78, 0.18, 0.06], [0.06, 0.56, 0.25]],
  [[0.40, 0.12, 0.035], [0.94, 0.47, 0.08]],
  [[0.04, 0.50, 0.19], [0.70, 0.80, 0.07]],
  [[0.055, 0.20, 0.59], [0.02, 0.59, 0.72]],
  [[0.92, 0.36, 0.07], [0.68, 0.065, 0.045]],
];
const referenceClusterLayout = [
  [0.10, 2.35], [1.45, 1.85], [-1.05, 1.55],
  [0.25, 1.05], [1.65, 0.65], [-1.95, 0.55],
  [-0.70, 0.25], [0.75, -0.05], [2.10, -0.55],
  [-2.55, -0.55], [-1.35, -1.05], [0.05, -1.35],
];

const state = {
  marbles: [],
  view: { width: BASE_WORLD_HEIGHT, height: BASE_WORLD_HEIGHT },
  mode: "game",
  running: true,
  lastTime: performance.now(),
  accumulator: 0,
  fpsTime: performance.now(),
  fpsFrames: 0,
  dragged: null,
  pointer: { x: 0, y: 0, lastX: 0, lastY: 0, time: 0 },
  hovered: null,
  visualVersion: 1,
  backgroundMode: 0,
  freeBackgroundMode: 0,
  toastTimer: 0,
  motionLabel: t("motion.stopped"),
  game: {
    phase: "spawning",
    round: 1,
    targetsScored: 0,
    shotsRemaining: GAME_SHOT_COUNT,
    shotElapsed: 0,
    settleElapsed: 0,
    spawnElapsed: 0,
    aimX: 0,
    aimY: 0,
    outcome: "playing",
    canContinue: false,
  },
  instanceData: new Float32Array(MAX_MARBLES * INSTANCE_FLOATS),
};

if (query.get("view") === "mobile") document.documentElement.dataset.view = "mobile";
if (query.get("debug") === "1") performancePanel.hidden = false;
const tiltControl = {
  available: "DeviceOrientationEvent" in window && (
    query.get("view") === "mobile"
    || navigator.maxTouchPoints > 0
    || window.matchMedia("(pointer: coarse)").matches
  ),
  enabled: false,
  hasReading: false,
  baselineBeta: null,
  baselineGamma: null,
  x: 0,
  y: 0,
};


const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
const audio = {
  context: null,
  masterGain: null,
  rollSource: null,
  rollFilter: null,
  rollGain: null,
  collisionBuffer: null,
  enabled: false,
  lastCollisionTime: -1,
};

function createNoiseBuffer(context, duration, decay = 0) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.72 + white * 0.28;
    const envelope = decay > 0 ? Math.exp(-(index / frameCount) * decay) : 1;
    channel[index] = previous * envelope;
  }
  return buffer;
}

function updateSoundButton() {
  const label = t(audio.enabled ? "sound.disable" : "sound.enable");
  soundButton.setAttribute("aria-pressed", String(audio.enabled));
  soundButton.setAttribute("aria-label", label);
  soundButton.querySelector(".button-label").textContent = t(
    audio.enabled ? "sound.disableShort" : "sound.enableShort",
  );
  soundButton.title = label;
}

function setMenuHidden(hidden) {
  stage.classList.toggle("is-ui-hidden", hidden);
  menuButton.setAttribute("aria-pressed", String(hidden));
  const label = t(hidden ? "menu.show" : "menu.hide");
  menuButton.setAttribute("aria-label", label);
  menuButton.title = label;
  menuButton.querySelector(".button-label").textContent = label;
}

function updateTiltButton() {
  tiltButton.hidden = !tiltControl.available;
  if (!tiltControl.available) return;
  const label = t(tiltControl.enabled ? "tilt.disable" : "tilt.enable");
  tiltButton.setAttribute("aria-pressed", String(tiltControl.enabled));
  tiltButton.setAttribute("aria-label", label);
  tiltButton.title = label;
  tiltButton.querySelector(".button-label").textContent = label;
}

function resetTiltCalibration() {
  tiltControl.hasReading = false;
  tiltControl.baselineBeta = null;
  tiltControl.baselineGamma = null;
  tiltControl.x = 0;
  tiltControl.y = 0;
}

function normalizeAngleDelta(angle, baseline) {
  return ((angle - baseline + 540) % 360) - 180;
}

function normalizeTilt(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= FREE_TILT_DEAD_ZONE) return 0;
  const normalized = Math.min(
    1,
    (magnitude - FREE_TILT_DEAD_ZONE) / (FREE_TILT_RANGE - FREE_TILT_DEAD_ZONE),
  );
  return Math.sign(value) * normalized;
}

function handleDeviceOrientation(event) {
  if (!tiltControl.enabled || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  if (tiltControl.baselineBeta === null || tiltControl.baselineGamma === null) {
    tiltControl.baselineBeta = event.beta;
    tiltControl.baselineGamma = event.gamma;
    tiltControl.hasReading = true;
    return;
  }

  const deviceX = normalizeAngleDelta(event.gamma, tiltControl.baselineGamma);
  const deviceY = normalizeAngleDelta(event.beta, tiltControl.baselineBeta);
  const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
  const radians = screenAngle * Math.PI / 180;
  const screenX = deviceX * Math.cos(radians) + deviceY * Math.sin(radians);
  const screenY = -deviceX * Math.sin(radians) + deviceY * Math.cos(radians);
  const targetX = normalizeTilt(screenX);
  const targetY = -normalizeTilt(screenY);
  tiltControl.x += (targetX - tiltControl.x) * 0.18;
  tiltControl.y += (targetY - tiltControl.y) * 0.18;
  tiltControl.hasReading = true;
}

function disableTiltControl() {
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  tiltControl.enabled = false;
  resetTiltCalibration();
  updateTiltButton();
}

async function enableTiltControl() {
  if (!tiltControl.available) {
    showToast(t("tilt.unavailable"));
    return;
  }
  if (!window.isSecureContext) {
    showToast(t("tilt.secureContext"));
    return;
  }

  try {
    const OrientationEvent = window.DeviceOrientationEvent;
    if (typeof OrientationEvent.requestPermission === "function") {
      const permission = await OrientationEvent.requestPermission();
      if (permission !== "granted") {
        showToast(t("tilt.permission"));
        return;
      }
    }
    resetTiltCalibration();
    window.addEventListener("deviceorientation", handleDeviceOrientation);
    tiltControl.enabled = true;
    updateTiltButton();
    showToast(t("tilt.enabled"));
  } catch {
    disableTiltControl();
    showToast(t("tilt.failed"));
  }
}

function setupAudio() {
  if (!AudioContextConstructor || audio.context) return;
  if ("audioSession" in navigator) {
    try {
      navigator.audioSession.type = "playback";
    } catch {
      // Keep the default audio session on browsers that expose a read-only API.
    }
  }
  const context = new AudioContextConstructor({ latencyHint: "interactive" });
  const masterGain = context.createGain();
  masterGain.gain.value = 0.72;
  masterGain.connect(context.destination);

  const rollSource = context.createBufferSource();
  rollSource.buffer = createNoiseBuffer(context, 0.82);
  rollSource.loop = true;
  const rollFilter = context.createBiquadFilter();
  rollFilter.type = "bandpass";
  rollFilter.frequency.value = 360;
  rollFilter.Q.value = 0.62;
  const rollLowPass = context.createBiquadFilter();
  rollLowPass.type = "lowpass";
  rollLowPass.frequency.value = 1450;
  rollLowPass.Q.value = 0.45;
  const rollGain = context.createGain();
  rollGain.gain.value = 0;
  rollSource.connect(rollFilter).connect(rollLowPass).connect(rollGain).connect(masterGain);
  rollSource.start();

  audio.context = context;
  audio.masterGain = masterGain;
  audio.rollSource = rollSource;
  audio.rollFilter = rollFilter;
  audio.rollGain = rollGain;
  audio.collisionBuffer = createNoiseBuffer(context, 0.11, 7.5);
}

async function setSoundEnabled(nextEnabled) {
  if (!AudioContextConstructor) return;
  setupAudio();
  audio.enabled = nextEnabled;
  updateSoundButton();
  if (audio.enabled) {
    try {
      await audio.context.resume();
    } catch {
      audio.enabled = false;
      updateSoundButton();
    }
    return;
  }
  const now = audio.context.currentTime;
  audio.rollGain.gain.setTargetAtTime(0, now, 0.035);
}

function playCollisionSound(impact, radius = 0.65, worldX = 0) {
  const context = audio.context;
  if (!audio.enabled || !context || context.state !== "running" || impact < 0.24) return;
  const now = context.currentTime;
  if (now - audio.lastCollisionTime < 0.034) return;
  audio.lastCollisionTime = now;

  const output = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
  if (output.pan) {
    const halfWidth = Math.max(state.view.width * 0.5, 1);
    output.pan.value = Math.max(-0.78, Math.min(0.78, worldX / halfWidth));
  }
  output.connect(audio.masterGain);

  const envelope = context.createGain();
  const peak = Math.min(0.105, 0.020 + impact * 0.023);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(peak, now + 0.0025);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.082);
  envelope.connect(output);

  const baseFrequency = 1620 + (0.72 - radius) * 900 + Math.min(impact, 3.5) * 160;
  const tone = context.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(baseFrequency + Math.random() * 130, now);
  tone.frequency.exponentialRampToValueAtTime(baseFrequency * 0.72, now + 0.072);
  tone.connect(envelope);
  tone.start(now);
  tone.stop(now + 0.085);

  const noise = context.createBufferSource();
  noise.buffer = audio.collisionBuffer;
  noise.playbackRate.value = 1.04 + Math.min(impact, 4) * 0.085 + Math.random() * 0.10;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 3350 + Math.random() * 1200;
  noiseFilter.Q.value = 0.85;
  noise.connect(noiseFilter).connect(envelope);
  noise.start(now);
  noise.stop(now + 0.075);
}

function playScoreSound(order = 0) {
  const context = audio.context;
  if (!audio.enabled || !context || context.state !== "running") return;
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  gain.connect(audio.masterGain);

  const tone = context.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(2150 + Math.min(order, 4) * 180, now);
  tone.frequency.exponentialRampToValueAtTime(1740 + Math.min(order, 4) * 130, now + 0.16);
  tone.connect(gain);
  tone.start(now);
  tone.stop(now + 0.19);
}

function updateRollingSound() {
  const context = audio.context;
  if (!context || !audio.rollGain) return;
  const now = context.currentTime;
  if (!audio.enabled || !state.running || document.hidden) {
    audio.rollGain.gain.setTargetAtTime(0, now, 0.05);
    return;
  }
  let activity = 0;
  let speedTotal = 0;
  for (const marble of state.marbles) {
    const speed = Math.hypot(marble.vx, marble.vy);
    speedTotal += speed;
    activity += Math.max(0, Math.min(1, (speed - 0.035) / 2.35));
  }
  const count = Math.max(state.marbles.length, 1);
  const averageActivity = activity / count;
  const averageSpeed = speedTotal / count;
  const targetGain = Math.pow(averageActivity, 0.72) * 0.042;
  audio.rollGain.gain.setTargetAtTime(targetGain, now, 0.075);
  audio.rollFilter.frequency.setTargetAtTime(
    300 + Math.min(760, averageSpeed * 190),
    now,
    0.10,
  );
}

if (!AudioContextConstructor) {
  soundButton.disabled = true;
  soundButton.title = t("sound.unsupported");
}

const backgroundVertex = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  vec2 p = positions[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const backgroundFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uResolution;
uniform vec2 uView;
uniform int uBackgroundMode;
uniform int uShowRing;
uniform float uVisualVersion;
out vec4 outColor;

void main() {
  vec3 paper = vec3(0.985);
  if (uBackgroundMode == 1) {
    float cellSize = max(28.0, uResolution.y / 31.0);
    float lineWidth = max(0.58, uResolution.y / 1800.0);
    vec2 minorModulo = mod(gl_FragCoord.xy, cellSize);
    vec2 minorDistance = min(minorModulo, cellSize - minorModulo);
    float minorLine = 1.0 - smoothstep(lineWidth, lineWidth + 0.90, min(minorDistance.x, minorDistance.y));
    float majorSize = cellSize * 5.0;
    vec2 majorModulo = mod(gl_FragCoord.xy, majorSize);
    vec2 majorDistance = min(majorModulo, majorSize - majorModulo);
    float majorLine = 1.0 - smoothstep(lineWidth * 1.16, lineWidth * 1.16 + 1.00, min(majorDistance.x, majorDistance.y));
    paper = vec3(0.982, 0.986, 0.978);
    paper = mix(paper, vec3(0.625, 0.775, 0.790), minorLine * 0.17);
    paper = mix(paper, vec3(0.460, 0.670, 0.690), majorLine * 0.19);
  }

  if (uShowRing == 1) {
    vec2 world = (gl_FragCoord.xy / uResolution - 0.5) * uView;
    float worldPixel = uView.y / max(uResolution.y, 1.0);
    vec2 ringVector = world - vec2(0.0, 1.0);
    float ringAngle = atan(ringVector.y, ringVector.x);
    float ringWobble = (
      sin(ringAngle * 13.0 + 0.7) +
      sin(ringAngle * 29.0 - 1.3) * 0.55
    ) * worldPixel * 0.32 * uVisualVersion;
    float ringDistance = abs(length(ringVector) - 3.0 - ringWobble);
    float ringLine = 1.0 - smoothstep(worldPixel * 0.75, worldPixel * 2.15, ringDistance);
    float ringTexture = mix(1.0, 0.84 + sin(ringAngle * 47.0 + 0.4) * 0.16, uVisualVersion);
    float launchMark = 1.0 - smoothstep(0.075, 0.135, length(world - vec2(0.0, -5.0)));
    vec3 ringColor = mix(vec3(0.12, 0.31, 0.30), vec3(0.12, 0.28, 0.28), uVisualVersion);
    float ringStrength = mix(0.48, 0.54, uVisualVersion);
    paper = mix(paper, ringColor, ringLine * ringTexture * ringStrength);
    paper = mix(paper, vec3(0.18, 0.42, 0.40), launchMark * 0.24);
  }

  outColor = vec4(paper, 1.0);
}`;

const copyFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 outColor;
void main() {
  outColor = texture(uScene, vUv);
}`;

const instanceVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aLocal;
layout(location = 1) in vec2 aCenter;
layout(location = 2) in float aRadius;
layout(location = 3) in vec4 aRotation;
layout(location = 4) in vec3 aColorA;
layout(location = 5) in vec3 aColorB;
layout(location = 6) in float aSeed;
layout(location = 7) in vec4 aStyle;
layout(location = 8) in vec4 aDetail;
layout(location = 9) in vec4 aInclusionA;
layout(location = 10) in vec4 aInclusionB;
layout(location = 11) in float aState;
uniform vec2 uView;
out vec2 vLocal;
out float vRadius;
flat out vec4 vRotation;
out vec3 vColorA;
out vec3 vColorB;
out float vSeed;
flat out vec4 vStyle;
flat out vec4 vDetail;
flat out vec4 vInclusionA;
flat out vec4 vInclusionB;
out float vState;

void main() {
  vec2 world = aCenter + aLocal * aRadius;
  gl_Position = vec4(world / (uView * 0.5), 0.0, 1.0);
  vLocal = aLocal;
  vRadius = aRadius;
  vRotation = aRotation;
  vColorA = aColorA;
  vColorB = aColorB;
  vSeed = aSeed;
  vStyle = aStyle;
  vDetail = aDetail;
  vInclusionA = aInclusionA;
  vInclusionB = aInclusionB;
  vState = aState;
}`;

const marbleFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vRadius;
flat in vec4 vRotation;
in vec3 vColorA;
in vec3 vColorB;
in float vSeed;
flat in vec4 vStyle;
flat in vec4 vDetail;
flat in vec4 vInclusionA;
flat in vec4 vInclusionB;
in float vState;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uVisualVersion;
out vec4 outColor;

float softCircle(vec2 p, vec2 center, float radius, float softness) {
  return 1.0 - smoothstep(radius - softness, radius + softness, length(p - center));
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float projection = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * projection);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

mat3 quaternionToMatrix(vec4 q) {
  q = normalize(q);
  float x2 = q.x + q.x;
  float y2 = q.y + q.y;
  float z2 = q.z + q.z;
  float xx = q.x * x2;
  float xy = q.x * y2;
  float xz = q.x * z2;
  float yy = q.y * y2;
  float yz = q.y * z2;
  float zz = q.z * z2;
  float wx = q.w * x2;
  float wy = q.w * y2;
  float wz = q.w * z2;
  return mat3(
    1.0 - (yy + zz), xy + wz, xz - wy,
    xy - wz, 1.0 - (xx + zz), yz + wx,
    xz + wy, yz - wx, 1.0 - (xx + yy)
  );
}

void main() {
  float r2 = dot(vLocal, vLocal);
  float edgeWidth = max(fwidth(r2) * 1.4, 0.002);
  float coverage = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, r2);
  if (coverage <= 0.0) discard;

  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 normal = normalize(vec3(vLocal, z));
  vec2 screenUv = gl_FragCoord.xy / uResolution;

  mat3 objectToWorld = quaternionToMatrix(vRotation);
  mat3 worldToObject = transpose(objectToWorld);
  vec3 surfacePoint = worldToObject * vec3(vLocal, z);
  float surfaceRoughness = mix(
    mix(0.22, 0.48, vDetail.w),
    mix(0.04, 0.14, vDetail.w),
    uVisualVersion
  );
  float microWaveA = sin(surfacePoint.x * 31.0 + vSeed * 1.7) *
    sin(surfacePoint.y * 37.0 - surfacePoint.z * 19.0);
  float microWaveB = sin(surfacePoint.y * 47.0 + vSeed * 0.9) *
    sin(surfacePoint.z * 29.0 + surfacePoint.x * 17.0);
  float roughGrain = clamp(0.50 + microWaveA * 0.27 + microWaveB * 0.23, 0.0, 1.0);
  float microNormalStrength = mix(
    mix(0.018, 0.052, mix(0.22, 0.48, vDetail.w)),
    mix(0.004, 0.012, mix(0.04, 0.14, vDetail.w)),
    uVisualVersion
  );
  vec3 microNormalObject = normalize(
    surfacePoint + vec3(microWaveA, microWaveB, -(microWaveA + microWaveB) * 0.45) *
      microNormalStrength
  );
  vec3 shadingNormal = normalize(objectToWorld * microNormalObject);
  float microRefractionStrength = mix(
    mix(0.00035, 0.00115, mix(0.22, 0.48, vDetail.w)),
    mix(0.00050, 0.00130, mix(0.04, 0.14, vDetail.w)),
    uVisualVersion
  );
  vec2 microRefraction = vec2(microWaveA, microWaveB) * microRefractionStrength;

  float bend = mix(
    (1.0 - z) * 0.033 + 0.0045,
    (1.0 - z) * 0.062 + 0.0070,
    uVisualVersion
  );
  vec2 refractOffset = normal.xy * bend * (0.72 + vRadius * 0.16);
  vec3 refracted;
  float redDispersion = mix(1.09, 1.17, uVisualVersion);
  float blueDispersion = mix(0.90, 0.82, uVisualVersion);
  refracted.r = texture(
    uScene,
    screenUv - refractOffset * redDispersion + microRefraction * mix(1.08, 1.16, uVisualVersion)
  ).r;
  refracted.g = texture(uScene, screenUv - refractOffset + microRefraction).g;
  refracted.b = texture(
    uScene,
    screenUv - refractOffset * blueDispersion + microRefraction * mix(0.86, 0.78, uVisualVersion)
  ).b;
  refracted = mix(
    refracted,
    sqrt(max(refracted, vec3(0.0))),
    0.055 * uVisualVersion
  );

  vec3 rayBase = worldToObject * vec3(vLocal, 0.0);
  vec3 rayDirection = worldToObject * vec3(0.0, 0.0, 1.0);
  float safeDirectionX = abs(rayDirection.x) < 0.06
    ? (rayDirection.x < 0.0 ? -0.06 : 0.06)
    : rayDirection.x;
  float hitZ = clamp(-rayBase.x / safeDirectionX, -z, z);
  vec3 ribbonPoint = rayBase + rayDirection * hitZ;
  float sheetDistance = abs(ribbonPoint.x);
  float vaneSoftness = mix(
    mix(0.075, 0.125, vStyle.x),
    mix(0.085, 0.145, vStyle.x),
    uVisualVersion
  );
  float vaneStart = mix(0.020, 0.016, uVisualVersion);
  float vane = 1.0 - smoothstep(vaneStart, vaneSoftness, sheetDistance);
  float shellStart = mix(0.79, 0.84, vStyle.w);
  float glassShell = 1.0 - smoothstep(shellStart, shellStart + 0.10, length(ribbonPoint));
  float ribbonLength = mix(
    mix(0.50, 0.66, vStyle.w),
    mix(0.54, 0.70, vStyle.w),
    uVisualVersion
  );
  float ribbonTailSoftness = mix(0.15, 0.14, uVisualVersion);
  float longitudinal = 1.0 - smoothstep(
    ribbonLength,
    ribbonLength + ribbonTailSoftness,
    abs(ribbonPoint.y)
  );

  float waveAmplitude = mix(
    mix(0.025, 0.215, vStyle.x),
    mix(0.060, 0.220, vStyle.x),
    uVisualVersion
  );
  float waveSeed = fract(vStyle.y * 1.61 + 0.13);
  float waveFrequency = mix(
    mix(1.8, 6.0, waveSeed),
    mix(2.0, 4.8, waveSeed),
    uVisualVersion
  );
  float centerOffset = mix(-0.14, 0.14, fract(vStyle.x * 2.7 + vStyle.w));
  float curveSkew = mix(
    mix(-0.34, 0.34, vStyle.w),
    mix(-0.22, 0.22, vStyle.w),
    uVisualVersion
  );
  float bandCoordinate = ribbonPoint.z + centerOffset +
    waveAmplitude * sin(ribbonPoint.y * waveFrequency + vSeed * 2.1) +
    ribbonPoint.y * ribbonPoint.y * curveSkew +
    ribbonPoint.y * mix(
      mix(-0.16, 0.16, vDetail.x),
      mix(-0.12, 0.12, vDetail.x),
      uVisualVersion
    );

  float halfWidth = mix(
    mix(0.12, 0.26, vStyle.y),
    mix(0.14, 0.26, vStyle.y),
    uVisualVersion
  );
  float taperAmount = mix(
    mix(0.08, 0.46, vDetail.y),
    mix(0.22, 0.50, vDetail.y),
    uVisualVersion
  );
  float taper = 1.0 - taperAmount * smoothstep(
    mix(0.12, 0.13, uVisualVersion),
    ribbonLength,
    abs(ribbonPoint.y)
  );
  float localHalfWidth = halfWidth * taper;
  float mainProfile = 1.0 - smoothstep(
    localHalfWidth,
    localHalfWidth + mix(0.075, 0.065, uVisualVersion),
    abs(bandCoordinate)
  );
  float splitFamily = step(0.34, vStyle.z) * (1.0 - step(0.67, vStyle.z));
  float doubleFamily = step(0.67, vStyle.z);
  float centerGap = 1.0 - smoothstep(0.022, 0.068, abs(bandCoordinate));
  mainProfile *= 1.0 - centerGap * splitFamily * 0.78;
  float notchCenter = mix(-0.42, 0.42, vDetail.z);
  float notch = 1.0 - smoothstep(0.035, 0.12, abs(ribbonPoint.y - notchCenter));
  mainProfile *= 1.0 - notch * step(0.72, vDetail.w) * 0.82;

  float companionDirection = step(0.5, vStyle.w) * 2.0 - 1.0;
  float companionCoordinate = bandCoordinate + companionDirection * mix(0.17, 0.28, vStyle.x);
  float companionProfile = 1.0 - smoothstep(
    localHalfWidth * 0.38,
    localHalfWidth * 0.68,
    abs(companionCoordinate)
  );
  float forkDirection = step(0.5, vDetail.z) * 2.0 - 1.0;
  float forkMask = smoothstep(-0.36, 0.38, ribbonPoint.y * forkDirection);
  companionProfile *= doubleFamily * mix(0.55, 0.88, forkMask);
  float companionWins = step(mainProfile, companionProfile);
  float ribbonWidth = max(mainProfile, companionProfile);
  float colorCoordinate = mix(bandCoordinate, companionCoordinate, companionWins);
  float depthValidity = 1.0 - smoothstep(z - 0.045, z + 0.005, abs(hitZ));
  float edgeOnBoost = 1.0 - smoothstep(0.08, 0.72, abs(rayDirection.x));
  float ribbonAlpha = vane * glassShell * longitudinal * ribbonWidth * depthValidity;
  ribbonAlpha *= mix(
    mix(0.52, 0.72, vDetail.z) + edgeOnBoost * 0.13,
    mix(0.62, 0.82, vDetail.z) + edgeOnBoost * 0.10,
    uVisualVersion
  );

  float ribbonCore = 1.0 - smoothstep(
    mix(0.020, 0.024, uVisualVersion),
    mix(0.070, 0.082, uVisualVersion),
    abs(colorCoordinate)
  );
  float ribbonEdge = 1.0 - smoothstep(
    0.018,
    0.050,
    abs(abs(colorCoordinate) - localHalfWidth * 0.64)
  );
  vec3 firstColor = mix(vColorA, vColorB, step(0.5, vStyle.x));
  vec3 secondColor = mix(vColorB, vColorA, step(0.5, vStyle.x));
  vec3 ribbonColor = mix(
    firstColor,
    secondColor,
    smoothstep(-localHalfWidth * 0.58, localHalfWidth * 0.58, colorCoordinate)
  );
  vec3 vividRibbonColor = pow(max(ribbonColor, vec3(0.0)), vec3(0.82));
  ribbonColor = mix(ribbonColor, vividRibbonColor, uVisualVersion);
  ribbonColor += vec3(1.0, 0.70, 0.26) * ribbonCore * mix(
    mix(0.14, 0.34, vStyle.w),
    mix(0.10, 0.24, vStyle.w),
    uVisualVersion
  );
  ribbonColor += vColorB * ribbonEdge * mix(0.18, 0.26, uVisualVersion);
  float ribbonDepth = clamp((z - hitZ) / max(2.0 * z, 0.001), 0.0, 1.0);
  ribbonColor *= (0.96 - ribbonDepth * 0.24) *
    (0.90 + 0.10 * sin(ribbonPoint.y * 6.0 + vSeed));
  float ribbonLuminance = dot(ribbonColor, vec3(0.299, 0.587, 0.114));
  float ribbonSaturation = mix(0.90, 0.98, uVisualVersion);
  float ribbonGrayLevel = mix(0.64, 0.72, uVisualVersion);
  ribbonColor = mix(vec3(ribbonLuminance * ribbonGrayLevel), ribbonColor, ribbonSaturation);
  ribbonColor *= mix(
    mix(0.86, 1.08, vStyle.z),
    mix(1.00, 1.18, vStyle.z),
    uVisualVersion
  );

  vec2 scratchDirectionA = normalize(vStyle.xy - vec2(0.5) + vec2(0.031, -0.019));
  vec2 scratchDirectionB = normalize(vStyle.zw - vec2(0.5) + vec2(-0.017, 0.027));
  vec2 scratchDirectionC = normalize(vDetail.xz - vec2(0.5) + vec2(0.023, 0.014));
  vec2 scratchCenterA = (vec2(fract(vStyle.z * 2.17), fract(vStyle.w * 2.93)) - 0.5) * 0.72;
  vec2 scratchCenterB = (vec2(fract(vStyle.x * 3.31), fract(vStyle.y * 2.47)) - 0.5) * 0.78;
  vec2 scratchCenterC = (vec2(fract(vDetail.y * 2.61), fract(vDetail.w * 3.17)) - 0.5) * 0.76;
  float scratchLengthA = mix(0.12, 0.34, vStyle.w);
  float scratchLengthB = mix(0.08, 0.24, vStyle.x);
  float scratchLengthC = mix(0.06, 0.21, vDetail.y);
  float scratchDistanceA = segmentDistance(
    surfacePoint.xy,
    scratchCenterA - scratchDirectionA * scratchLengthA * 0.5,
    scratchCenterA + scratchDirectionA * scratchLengthA * 0.5
  );
  float scratchDistanceB = segmentDistance(
    surfacePoint.xy,
    scratchCenterB - scratchDirectionB * scratchLengthB * 0.5,
    scratchCenterB + scratchDirectionB * scratchLengthB * 0.5
  );
  float scratchDistanceC = segmentDistance(
    surfacePoint.xy,
    scratchCenterC - scratchDirectionC * scratchLengthC * 0.5,
    scratchCenterC + scratchDirectionC * scratchLengthC * 0.5
  );
  float scratchWidth = max(fwidth(surfacePoint.x) * 0.75, 0.004);
  float scratchA = 1.0 - smoothstep(scratchWidth, scratchWidth * 2.4, scratchDistanceA);
  float scratchB = 1.0 - smoothstep(scratchWidth, scratchWidth * 2.2, scratchDistanceB);
  float scratchC = 1.0 - smoothstep(scratchWidth, scratchWidth * 2.3, scratchDistanceC);
  scratchA *= step(0.26, fract(vStyle.x + vStyle.z * 1.7));
  scratchB *= step(0.74, vStyle.w);
  scratchC *= step(0.58, vDetail.w);
  float scratches = max(max(scratchA, scratchB), scratchC) * smoothstep(0.12, 0.72, z);
  vec2 wearCoordinate = surfacePoint.xy * 9.0 + vSeed * vec2(0.17, 0.11);
  vec2 wearCell = floor(wearCoordinate);
  vec2 wearUv = fract(wearCoordinate) - 0.5;
  float pitSeed = hash21(wearCell + floor(vSeed));
  float pitDistance = length(wearUv);
  float pit = (1.0 - smoothstep(0.055, 0.135, pitDistance)) *
    step(0.974, pitSeed) * smoothstep(0.08, 0.68, z);
  float pitRing = (1.0 - smoothstep(0.11, 0.19, abs(pitDistance - 0.15))) *
    step(0.974, pitSeed) * smoothstep(0.08, 0.68, z);

  float bubbleRayZ = dot(vInclusionA.xyz - rayBase, rayDirection);
  vec3 bubbleClosestPoint = rayBase + rayDirection * bubbleRayZ;
  float bubbleRadius = max(vInclusionA.w, 0.0001);
  float bubbleDistance = length(bubbleClosestPoint - vInclusionA.xyz) / bubbleRadius;
  float bubbleValid = step(0.001, vInclusionA.w) * step(-z, bubbleRayZ) * step(bubbleRayZ, z);
  float bubbleDisc = (1.0 - smoothstep(0.82, 1.0, bubbleDistance)) * bubbleValid;
  float bubbleRing = smoothstep(0.34, 0.64, bubbleDistance) *
    (1.0 - smoothstep(0.76, 1.0, bubbleDistance)) * bubbleValid;
  float bubbleCore = (1.0 - smoothstep(0.0, 0.48, bubbleDistance)) * bubbleValid;
  float bubbleInFront = mix(0.48, 1.0, step(hitZ, bubbleRayZ));

  float fleckRayZ = dot(vInclusionB.xyz - rayBase, rayDirection);
  vec3 fleckClosestPoint = rayBase + rayDirection * fleckRayZ;
  float fleckRadius = max(vInclusionB.w, 0.0001);
  float fleckDistance = length(fleckClosestPoint - vInclusionB.xyz) / fleckRadius;
  float fleckValid = step(0.001, vInclusionB.w) * step(-z, fleckRayZ) * step(fleckRayZ, z);
  float secondBubbleType = step(0.58, vDetail.w);
  float secondBubbleDisc = (1.0 - smoothstep(0.82, 1.0, fleckDistance)) *
    fleckValid * secondBubbleType;
  float secondBubbleRing = smoothstep(0.34, 0.64, fleckDistance) *
    (1.0 - smoothstep(0.76, 1.0, fleckDistance)) * fleckValid * secondBubbleType;
  float fleck = (1.0 - smoothstep(0.42, 1.0, fleckDistance)) *
    fleckValid * (1.0 - secondBubbleType);
  float fleckInFront = mix(0.40, 1.0, step(hitZ, fleckRayZ));
  float secondBubbleInFront = mix(0.48, 1.0, step(hitZ, fleckRayZ));

  float legacyBlueGlass = smoothstep(0.34, 0.66, vDetail.y);
  float improvedBlueGlass = step(0.333, vDetail.y) * (1.0 - step(0.666, vDetail.y));
  float improvedGreenGlass = step(0.666, vDetail.y);
  float improvedClearGlass = 1.0 - improvedBlueGlass - improvedGreenGlass;
  vec3 legacyGreenGlass = vec3(0.008, 0.23, 0.20);
  vec3 legacyBlueGlassColor = vec3(0.008, 0.23, 0.31);
  vec3 legacyGlassTint = mix(legacyGreenGlass, legacyBlueGlassColor, legacyBlueGlass);
  vec3 improvedGlassTint =
    vec3(0.018, 0.045, 0.046) * improvedClearGlass +
    vec3(0.008, 0.205, 0.315) * improvedBlueGlass +
    vec3(0.010, 0.250, 0.180) * improvedGreenGlass;
  vec3 glassTint = mix(legacyGlassTint, improvedGlassTint, uVisualVersion);
  vec3 legacyAbsorption = mix(
    vec3(0.45, 0.16, 0.25),
    vec3(0.50, 0.23, 0.12),
    legacyBlueGlass
  );
  vec3 improvedAbsorption =
    vec3(0.030, 0.021, 0.019) * improvedClearGlass +
    vec3(0.145, 0.045, 0.020) * improvedBlueGlass +
    vec3(0.125, 0.024, 0.068) * improvedGreenGlass;
  vec3 absorption = mix(legacyAbsorption, improvedAbsorption, uVisualVersion);
  float glassDensity = mix(
    mix(0.58, 1.42, vDetail.x),
    mix(0.55, 0.98, vDetail.x),
    uVisualVersion
  );
  float fresnel = pow(1.0 - z, mix(2.35, 2.10, uVisualVersion));
  float innerShade = smoothstep(0.96, 0.14, r2);
  float opticalPath = z * 2.0;
  vec3 transmittance = exp(-opticalPath * absorption * glassDensity);
  vec3 color = refracted * transmittance + glassTint * (1.0 - transmittance) *
    mix(0.88, 0.78, uVisualVersion);
  color = mix(
    color,
    color * mix(vec3(0.70, 0.91, 0.94), vec3(0.93, 1.02, 1.035), uVisualVersion) +
      glassTint * mix(0.22, 0.08, uVisualVersion),
    mix(0.11, 0.025, uVisualVersion) + fresnel * mix(0.38, 0.20, uVisualVersion)
  );
  float volumeVariation = mix(0.018, 0.060, vDetail.w) *
    (0.35 + 0.65 * abs(surfacePoint.x * surfacePoint.y * 2.2));
  color = mix(color, color * 0.91 + glassTint * 0.12, volumeVariation);
  vec2 opticalExitDirection = normalize(vec2(0.46, -0.62));
  vec2 opticalExitTangent = vec2(-opticalExitDirection.y, opticalExitDirection.x);
  vec2 legacyGlowCenter = vec2(0.31, -0.34) +
    (vDetail.zw - 0.5) * vec2(0.11, 0.09);
  vec2 improvedGlowCenter = opticalExitDirection * 0.60 +
    (vDetail.zw - 0.5) * vec2(0.08, 0.06);
  vec2 glowCenter = mix(legacyGlowCenter, improvedGlowCenter, uVisualVersion);
  float internalGlow = softCircle(vLocal, glowCenter, 0.48, 0.25) * (1.0 - fresnel);
  vec3 legacyTransmittedGlow = mix(
    vec3(0.16, 0.58, 0.45),
    vec3(0.12, 0.48, 0.68),
    legacyBlueGlass
  );
  vec3 improvedTransmittedGlow =
    vec3(0.46, 0.50, 0.50) * improvedClearGlass +
    vec3(0.18, 0.46, 0.66) * improvedBlueGlass +
    vec3(0.18, 0.56, 0.42) * improvedGreenGlass;
  vec3 improvedCausticColor =
    vec3(0.96, 1.02, 1.00) * improvedClearGlass +
    vec3(0.72, 0.96, 1.08) * improvedBlueGlass +
    vec3(0.78, 1.06, 0.90) * improvedGreenGlass;
  vec3 transmittedGlow = mix(
    legacyTransmittedGlow,
    improvedTransmittedGlow,
    uVisualVersion
  );
  color += transmittedGlow * internalGlow * mix(
    mix(0.14, 0.31, vDetail.z),
    mix(0.08, 0.18, vDetail.z),
    uVisualVersion
  );
  float opticalExitProgress = dot(vLocal, opticalExitDirection);
  float internalFocusGate = smoothstep(0.04, 0.44, opticalExitProgress);
  vec2 internalLensDelta = vLocal - glowCenter;
  vec2 internalLensPoint = vec2(
    dot(internalLensDelta, opticalExitDirection) * 1.18,
    dot(internalLensDelta, opticalExitTangent) * 0.84
  );
  float internalLensDistance = length(internalLensPoint);
  float internalBloom = (1.0 - smoothstep(0.20, 0.54, internalLensDistance)) *
    internalFocusGate * (1.0 - fresnel) * z * uVisualVersion;
  float internalFocus = (1.0 - smoothstep(0.035, 0.25, internalLensDistance)) *
    internalFocusGate * (1.0 - fresnel) * z * uVisualVersion;
  float internalHotspot = (1.0 - smoothstep(0.018, 0.12, internalLensDistance)) *
    internalFocusGate * z * uVisualVersion;
  float internalCollector = smoothstep(0.24, 0.36, internalLensDistance) *
    (1.0 - smoothstep(0.40, 0.60, internalLensDistance)) *
    internalFocusGate * z * uVisualVersion;
  color *= 1.0 - internalCollector * mix(0.038, 0.060, vDetail.x);
  color += improvedTransmittedGlow * internalBloom * mix(0.15, 0.22, vDetail.w);
  color += improvedCausticColor * internalFocus * mix(0.34, 0.48, vDetail.z);
  color += vec3(1.0) * internalFocus * internalFocus * 0.075;
  color += improvedCausticColor * internalHotspot * mix(0.14, 0.20, vDetail.z);
  vec2 denseCenter = vec2(-0.24, 0.22) + (vDetail.xy - 0.5) * vec2(0.12, 0.10);
  float denseLobe = softCircle(vLocal, denseCenter, 0.72, 0.38) * (1.0 - fresnel);
  color *= 1.0 - denseLobe * mix(
    mix(0.07, 0.22, vDetail.x),
    mix(0.035, 0.082, vDetail.x),
    uVisualVersion
  );
  color += glassTint * denseLobe * mix(
    mix(0.035, 0.070, vDetail.y),
    mix(0.018, 0.040, vDetail.y),
    uVisualVersion
  );
  float waterClarity = (1.0 - fresnel) * mix(
    mix(0.13, 0.27, 1.0 - vDetail.x),
    mix(0.24, 0.38, 1.0 - vDetail.x),
    uVisualVersion
  );
  vec3 clearTransmission = refracted * mix(
    vec3(0.90, 1.015, 1.035),
    vec3(0.99, 1.02, 1.045),
    uVisualVersion
  ) + glassTint * mix(0.045, 0.018, uVisualVersion);
  color = mix(color, clearTransmission, waterClarity);
  color = mix(
    color,
    color * vec3(0.95, 1.01, 1.025) + glassTint * 0.055,
    (1.0 - fresnel) * 0.045 * uVisualVersion
  );
  color *= 0.94 + innerShade * 0.06;
  float ribbonBacklight = smoothstep(-0.58, 0.52, dot(ribbonPoint, normalize(vec3(0.42, -0.62, 0.66))));
  vec3 litRibbon = ribbonColor * mix(0.78, 1.20, ribbonBacklight);
  color = mix(color, litRibbon, ribbonAlpha * mix(0.84, 0.95, uVisualVersion));
  color += ribbonColor * ribbonCore * ribbonAlpha * ribbonBacklight *
    mix(0.09, 0.16, uVisualVersion);
  color *= 1.0 - bubbleDisc * bubbleInFront * mix(0.035, 0.020, uVisualVersion);
  vec3 bubbleRadial = normalize(bubbleClosestPoint - vInclusionA.xyz + vec3(0.0001));
  float bubbleLightSide = 0.5 + 0.5 * dot(
    bubbleRadial,
    normalize(vec3(-0.46, 0.62, 0.82))
  );
  color = mix(
    color,
    vec3(0.035, 0.22, 0.23),
    bubbleRing * bubbleInFront * (1.0 - bubbleLightSide) * mix(0.15, 0.08, uVisualVersion)
  );
  color += vec3(0.72, 0.97, 0.98) * bubbleRing * bubbleInFront *
    mix(0.18 + bubbleLightSide * 0.15, 0.38 + bubbleLightSide * 0.25, uVisualVersion);
  color += vec3(1.0) * bubbleCore * bubbleInFront * mix(0.055, 0.13, uVisualVersion);
  vec3 secondBubbleRadial = normalize(fleckClosestPoint - vInclusionB.xyz + vec3(0.0001));
  float secondBubbleLightSide = 0.5 + 0.5 * dot(
    secondBubbleRadial,
    normalize(vec3(-0.46, 0.62, 0.82))
  );
  color *= 1.0 - secondBubbleDisc * secondBubbleInFront * mix(0.028, 0.015, uVisualVersion);
  color += vec3(0.72, 0.97, 0.98) * secondBubbleRing * secondBubbleInFront *
    mix(0.15 + secondBubbleLightSide * 0.13, 0.32 + secondBubbleLightSide * 0.22, uVisualVersion);
  color = mix(
    color,
    vec3(0.16, 0.13, 0.095),
    fleck * fleckInFront * mix(0.48, 0.25, uVisualVersion)
  );
  color = mix(color, color * vec3(0.92, 1.02, 1.02) + glassTint * 0.07, 0.02 + fresnel * 0.14);

  vec3 lightDir = normalize(vec3(-0.46, 0.62, 0.82));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float broadPower = mix(
    mix(14.0, 30.0, vDetail.x),
    mix(30.0, 52.0, vDetail.x),
    uVisualVersion
  );
  float sharpPower = mix(
    mix(82.0, 158.0, vDetail.z),
    mix(132.0, 238.0, vDetail.z),
    uVisualVersion
  );
  float broadSpec = pow(max(dot(shadingNormal, halfDir), 0.0), broadPower);
  float sharpSpec = pow(max(dot(shadingNormal, halfDir), 0.0), sharpPower);
  broadSpec *= mix(0.66, 1.20, roughGrain);
  sharpSpec *= mix(0.38, 1.05, roughGrain);
  vec2 glintCenter = vec2(-0.34, 0.39) + (vDetail.xz - 0.5) * vec2(0.11, 0.08);
  float glintRadius = mix(
    mix(0.042, 0.080, vDetail.w),
    mix(0.026, 0.054, vDetail.w),
    uVisualVersion
  );
  float glintSoftness = mix(
    mix(0.016, 0.032, vDetail.y),
    mix(0.008, 0.018, vDetail.y),
    uVisualVersion
  );
  float glint = softCircle(vLocal, glintCenter, glintRadius, glintSoftness);
  glint *= mix(0.58, 1.08, smoothstep(0.18, 0.82, roughGrain));
  vec2 pinCenter = vec2(-0.48, 0.24) + (vDetail.zw - 0.5) * vec2(0.07, 0.06);
  float pinGlint = softCircle(vLocal, pinCenter, mix(0.018, 0.034, vDetail.x), 0.012);
  vec2 reflectionDirection = normalize(vec2(0.84, 0.28) + (vDetail.xy - 0.5) * 0.24);
  float reflectionLength = mix(0.10, 0.25, vDetail.w);
  float reflectionDistance = segmentDistance(
    vLocal,
    glintCenter - reflectionDirection * reflectionLength * 0.5,
    glintCenter + reflectionDirection * reflectionLength * 0.5
  );
  float reflectionStreak = 1.0 - smoothstep(
    mix(0.014, 0.010, uVisualVersion),
    mix(0.038, 0.026, uVisualVersion),
    reflectionDistance
  );
  vec2 windowCenter = vec2(-0.31, 0.34) + (vDetail.zw - 0.5) * vec2(0.09, 0.07);
  vec2 windowPoint = (vLocal - windowCenter) * vec2(0.82, 1.22);
  float windowReflection = 1.0 - smoothstep(0.20, 0.30, length(windowPoint));
  vec2 windowCutPoint = (vLocal - windowCenter - vec2(0.105, -0.085)) * vec2(0.82, 1.22);
  float windowCut = 1.0 - smoothstep(0.16, 0.25, length(windowCutPoint));
  float curvedReflection = max(0.0, windowReflection - windowCut * 0.72) * uVisualVersion;
  float lowerSparkle = softCircle(
    vLocal,
    vec2(0.24, -0.70) + (vDetail.xy - 0.5) * vec2(0.08, 0.06),
    0.036,
    0.016
  );
  color += vec3(0.74, 1.0, 0.98) * broadSpec * mix(
    mix(0.09, 0.18, vDetail.y),
    mix(0.06, 0.12, vDetail.y),
    uVisualVersion
  );
  color = mix(color, vec3(1.0, 1.0, 0.995), curvedReflection * 0.24 * z);
  color += vec3(1.0) * (
    sharpSpec * mix(
      mix(0.48, 0.78, vDetail.z),
      mix(0.80, 1.10, vDetail.z),
      uVisualVersion
    ) +
    glint * mix(
      mix(0.26, 0.48, vDetail.w),
      mix(0.50, 0.78, vDetail.w),
      uVisualVersion
    ) +
    reflectionStreak * mix(
      mix(0.10, 0.24, vDetail.y),
      mix(0.12, 0.22, vDetail.y),
      uVisualVersion
    ) +
    lowerSparkle * 0.64 * uVisualVersion +
    pinGlint * mix(0.62, 0.92, vDetail.x)
  ) * z;
  float scratchLight = scratches * (0.35 + 0.65 * max(dot(shadingNormal, lightDir), 0.0));
  color = mix(
    color,
    color * mix(0.68, 0.80, vDetail.z) + vec3(0.70, 0.95, 0.92) * 0.34,
    scratchLight * mix(0.36, 0.62, surfaceRoughness) * mix(1.0, 0.28, uVisualVersion)
  );
  color *= 1.0 - pit * mix(
    mix(0.08, 0.16, surfaceRoughness),
    mix(0.025, 0.055, vDetail.w),
    uVisualVersion
  );
  color += vec3(0.62, 0.96, 0.94) * pitRing * mix(
    mix(0.05, 0.13, surfaceRoughness),
    mix(0.14, 0.26, vDetail.w),
    uVisualVersion
  );
  float wornSheen = pow(max(dot(shadingNormal, halfDir), 0.0), 7.0) *
    mix(0.45, 1.0, roughGrain) * surfaceRoughness;
  color += vec3(0.24, 0.63, 0.59) * wornSheen * mix(0.055, 0.020, uVisualVersion);

  float lowerBounce = smoothstep(-0.8, -0.15, -vLocal.y) * smoothstep(1.0, 0.3, abs(vLocal.x));
  color += glassTint * lowerBounce * fresnel * mix(0.30, 0.60, uVisualVersion);
  float internalArc = 1.0 - smoothstep(
    0.018,
    0.060,
    abs(length((vLocal - vec2(0.18, -0.20)) * vec2(1.0, 1.15)) - 0.61)
  );
  internalArc *= smoothstep(0.08, 0.55, vLocal.x) *
    smoothstep(0.04, 0.58, -vLocal.y);
  color += glassTint * internalArc * 0.14 * (1.0 - uVisualVersion) *
    mix(0.72, 1.0, z);
  vec3 legacyDenseRim = mix(
    vec3(0.010, 0.115, 0.100),
    vec3(0.008, 0.105, 0.155),
    legacyBlueGlass
  );
  vec3 improvedDenseRim =
    vec3(0.075, 0.082, 0.082) * improvedClearGlass +
    vec3(0.020, 0.095, 0.140) * improvedBlueGlass +
    vec3(0.022, 0.120, 0.090) * improvedGreenGlass;
  vec3 denseRim = mix(legacyDenseRim, improvedDenseRim, uVisualVersion);
  color = mix(color, denseRim + glassTint * 0.22, fresnel * mix(0.43, 0.22, uVisualVersion));
  float brightRim = smoothstep(0.68, 0.98, length(vLocal)) *
    smoothstep(-0.72, 0.74, dot(vLocal, normalize(vec2(0.72, -0.69))));
  vec3 legacyBrightRim = mix(
    vec3(0.12, 0.52, 0.40),
    vec3(0.09, 0.43, 0.62),
    legacyBlueGlass
  );
  vec3 improvedBrightRim =
    vec3(0.46, 0.49, 0.49) * improvedClearGlass +
    vec3(0.15, 0.44, 0.64) * improvedBlueGlass +
    vec3(0.17, 0.53, 0.39) * improvedGreenGlass;
  color += mix(legacyBrightRim, improvedBrightRim, uVisualVersion) *
    brightRim * mix(0.23, 0.19, uVisualVersion);
  color += glassTint * fresnel * mix(0.17, 0.09, uVisualVersion);
  float thinGlassEdge = smoothstep(0.91, 0.995, length(vLocal)) * uVisualVersion;
  float litGlassEdge = smoothstep(-0.48, 0.82, dot(vLocal, normalize(vec2(-0.62, 0.78))));
  vec3 improvedEdgeColor =
    vec3(0.92, 0.98, 0.98) * improvedClearGlass +
    vec3(0.58, 0.88, 1.0) * improvedBlueGlass +
    vec3(0.62, 0.96, 0.82) * improvedGreenGlass;
  color += improvedEdgeColor * thinGlassEdge * (0.055 + litGlassEdge * 0.10);

  if (vState > 0.5) {
    float activeRim = smoothstep(0.72, 1.0, length(vLocal));
    color += vec3(0.35, 0.92, 0.80) * activeRim * mix(0.18, 0.08, uVisualVersion);
  }

  outColor = vec4(color, coverage);
}`;

const shadowVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aLocal;
layout(location = 1) in vec2 aCenter;
layout(location = 2) in float aRadius;
layout(location = 6) in float aSeed;
layout(location = 8) in vec4 aDetail;
uniform vec2 uView;
uniform float uVisualVersion;
out vec2 vLocal;
out vec2 vMarbleLocal;
flat out vec4 vShadowStyle;
void main() {
  float shadowStyleScale = mix(0.94, 1.08, aDetail.y);
  vec2 legacyShadowScale = vec2(2.35, 1.20) * shadowStyleScale;
  vec2 improvedShadowScale = vec2(2.55, 1.05) * shadowStyleScale;
  vec2 shadowDirection = normalize(vec2(0.46, -0.62));
  vec2 shadowTangent = vec2(-shadowDirection.y, shadowDirection.x);
  vec2 legacyShadowDelta = aLocal * legacyShadowScale;
  vec2 improvedShadowDelta =
    shadowDirection * (aLocal.x * improvedShadowScale.x) +
    shadowTangent * (aLocal.y * improvedShadowScale.y);
  vec2 shadowDeltaFactor = mix(
    legacyShadowDelta,
    improvedShadowDelta,
    uVisualVersion
  );
  vec2 shadowOffsetFactor = mix(
    vec2(-0.92, 0.76),
    shadowDirection * 0.78,
    uVisualVersion
  );
  vec2 shadowOffset = shadowOffsetFactor * aRadius;
  vec2 world = aCenter + shadowOffset + shadowDeltaFactor * aRadius;
  gl_Position = vec4(world / (uView * 0.5), 0.0, 1.0);
  vLocal = aLocal;
  vMarbleLocal = shadowOffsetFactor + shadowDeltaFactor;
  vShadowStyle = vec4(fract(aSeed * 0.6180339), aDetail.xyz);
}`;

const shadowFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vMarbleLocal;
flat in vec4 vShadowStyle;
uniform float uVisualVersion;
out vec4 outColor;
void main() {
  float d = dot(vLocal, vLocal);
  if (d > 1.0) discard;
  float softShadow = pow(1.0 - d, mix(1.80, 1.72, uVisualVersion)) *
    mix(0.195, 0.140, uVisualVersion);

  vec2 legacyContactPoint = (vLocal - vec2(0.39, -0.63)) * vec2(3.0, 5.0);
  float legacyContactShadow = exp(-dot(legacyContactPoint, legacyContactPoint) * 1.8) *
    0.36 * (1.0 - uVisualVersion);
  vec2 footprintPoint = (vMarbleLocal - vec2(0.10, -0.20)) * vec2(0.78, 1.15);
  float footprintShadow = exp(-dot(footprintPoint, footprintPoint) * 1.55) *
    0.17 * uVisualVersion;
  vec2 improvedContactPoint = (vMarbleLocal - vec2(0.28, -0.72)) * vec2(1.15, 3.0);
  float improvedContactShadow = exp(-dot(improvedContactPoint, improvedContactPoint) * 1.9) *
    0.21 * uVisualVersion;
  float contactShadow = legacyContactShadow + footprintShadow + improvedContactShadow;

  vec2 legacyFocusCenter = vec2(-0.08, 0.06) +
    (vShadowStyle.yz - 0.5) * vec2(0.20, 0.14);
  vec2 improvedFocusCenter = vec2(0.62, -0.78) +
    (vShadowStyle.yz - 0.5) * vec2(0.10, 0.08);
  vec2 legacyFocusPoint = (vLocal - legacyFocusCenter) * vec2(0.92, 1.48);
  vec2 improvedFocusPoint = (vMarbleLocal - improvedFocusCenter) * vec2(1.45, 1.75);
  vec2 focusPoint = mix(legacyFocusPoint, improvedFocusPoint, uVisualVersion);
  float focusRadius = length(focusPoint);
  float legacyFocusedLight = exp(
    -dot(focusPoint, focusPoint) * mix(5.0, 8.2, vShadowStyle.z)
  ) * mix(0.035, 0.13, vShadowStyle.w) * (1.0 - uVisualVersion);
  float legacyShadowWindow = exp(-dot(focusPoint, focusPoint) * 4.8) *
    mix(0.10, 0.38, vShadowStyle.w) * (1.0 - uVisualVersion);
  float causticIntensity = mix(0.68, 1.0, vShadowStyle.w);
  float causticLobe = exp(-dot(focusPoint, focusPoint) * 5.2);
  float focusCore = pow(causticLobe, 2.6) * causticIntensity * uVisualVersion;
  float collectorBand = causticLobe * (1.0 - causticLobe) * 4.0 *
    causticIntensity * uVisualVersion;
  float prismGate = smoothstep(0.68, 0.86, vShadowStyle.x);
  float prismStrength = mix(1.0, 0.18, uVisualVersion);
  float crescentMask = smoothstep(-0.34, 0.32, focusPoint.x) * prismGate;
  float redArc = (1.0 - smoothstep(0.020, 0.064, abs(focusRadius - 0.31))) *
    crescentMask * 0.090 * prismStrength;
  float greenArc = (1.0 - smoothstep(0.022, 0.068, abs(focusRadius - 0.39))) *
    crescentMask * 0.065 * prismStrength;
  float blueArc = (1.0 - smoothstep(0.024, 0.074, abs(focusRadius - 0.48))) *
    crescentMask * 0.085 * prismStrength;

  float improvedLightCut = (
    causticLobe * 0.075 +
    focusCore * 0.15
  ) * uVisualVersion;
  float shadowAlpha = max(
    0.0,
    softShadow + contactShadow + collectorBand * 0.032 -
      legacyShadowWindow - improvedLightCut
  );
  float neutralFocusGlow = focusCore * 0.10;
  float totalAlpha = clamp(
    shadowAlpha + neutralFocusGlow +
      legacyFocusedLight + redArc + greenArc + blueArc,
    0.0,
    mix(0.50, 0.54, uVisualVersion)
  );
  vec3 shadowColor = mix(vec3(0.085, 0.12, 0.145), vec3(0.090), uVisualVersion);
  vec3 layeredColor = shadowColor * shadowAlpha;
  layeredColor += vec3(1.10) * neutralFocusGlow;
  layeredColor += vec3(1.0, 0.97, 0.72) * legacyFocusedLight;
  layeredColor += vec3(1.0, 0.22, 0.10) * redArc;
  layeredColor += vec3(0.28, 1.0, 0.48) * greenArc;
  layeredColor += vec3(0.12, 0.54, 1.0) * blueArc;
  outColor = vec4(layeredColor / max(totalAlpha, 0.0001), totalAlpha);
}`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

const programs = {
  background: createProgram(backgroundVertex, backgroundFragment),
  copy: createProgram(backgroundVertex, copyFragment),
  shadow: createProgram(shadowVertex, shadowFragment),
  marble: createProgram(instanceVertex, marbleFragment),
};

const uniforms = {
  background: {
    resolution: gl.getUniformLocation(programs.background, "uResolution"),
    view: gl.getUniformLocation(programs.background, "uView"),
    mode: gl.getUniformLocation(programs.background, "uBackgroundMode"),
    showRing: gl.getUniformLocation(programs.background, "uShowRing"),
    visualVersion: gl.getUniformLocation(programs.background, "uVisualVersion"),
  },
  copy: {
    scene: gl.getUniformLocation(programs.copy, "uScene"),
  },
  shadow: {
    view: gl.getUniformLocation(programs.shadow, "uView"),
    visualVersion: gl.getUniformLocation(programs.shadow, "uVisualVersion"),
  },
  marble: {
    view: gl.getUniformLocation(programs.marble, "uView"),
    resolution: gl.getUniformLocation(programs.marble, "uResolution"),
    scene: gl.getUniformLocation(programs.marble, "uScene"),
    visualVersion: gl.getUniformLocation(programs.marble, "uVisualVersion"),
  },
};

const fullscreenVao = gl.createVertexArray();
const quadBuffer = gl.createBuffer();
const instanceBuffer = gl.createBuffer();
const quad = new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1,
]);

gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

function enableAttribute(location, size, stride, offset, divisor = 0) {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  if (divisor) gl.vertexAttribDivisor(location, divisor);
}

function createMarbleVao() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  enableAttribute(0, 2, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  const stride = INSTANCE_FLOATS * 4;
  enableAttribute(1, 2, stride, 0, 1);
  enableAttribute(2, 1, stride, 2 * 4, 1);
  enableAttribute(3, 4, stride, 3 * 4, 1);
  enableAttribute(4, 3, stride, 7 * 4, 1);
  enableAttribute(5, 3, stride, 10 * 4, 1);
  enableAttribute(6, 1, stride, 13 * 4, 1);
  enableAttribute(7, 4, stride, 14 * 4, 1);
  enableAttribute(8, 4, stride, 18 * 4, 1);
  enableAttribute(9, 4, stride, 22 * 4, 1);
  enableAttribute(10, 4, stride, 26 * 4, 1);
  enableAttribute(11, 1, stride, 30 * 4, 1);
  return vao;
}

function createShadowVao() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  enableAttribute(0, 2, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  const stride = INSTANCE_FLOATS * 4;
  enableAttribute(1, 2, stride, 0, 1);
  enableAttribute(2, 1, stride, 2 * 4, 1);
  enableAttribute(6, 1, stride, 13 * 4, 1);
  enableAttribute(8, 4, stride, 18 * 4, 1);
  return vao;
}

const marbleVao = createMarbleVao();
const shadowVao = createShadowVao();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.bufferData(gl.ARRAY_BUFFER, state.instanceData.byteLength, gl.DYNAMIC_DRAW);
gl.bindVertexArray(null);

const scene = {
  framebuffer: gl.createFramebuffer(),
  texture: gl.createTexture(),
  width: 0,
  height: 0,
};

const ground = {
  framebuffer: gl.createFramebuffer(),
  texture: gl.createTexture(),
  width: 0,
  height: 0,
  dirty: true,
};

function resizeRenderTarget(target, width, height) {
  if (target.width === width && target.height === height) return false;
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Could not create a render framebuffer.");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return true;
}

function resizeSceneTextures(width, height) {
  resizeRenderTarget(scene, width, height);
  if (resizeRenderTarget(ground, width, height)) ground.dirty = true;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    resizeSceneTextures(width, height);
  }
  state.view.height = BASE_WORLD_HEIGHT;
  state.view.width = BASE_WORLD_HEIGHT * (rect.width / Math.max(rect.height, 1));
}

function randomBetween(min, max, random = Math.random) {
  return min + random() * (max - min);
}

function randomQuaternion(random = Math.random) {
  const u1 = random();
  const u2 = random();
  const u3 = random();
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [
    a * Math.sin(TAU * u2),
    a * Math.cos(TAU * u2),
    b * Math.sin(TAU * u3),
    b * Math.cos(TAU * u3),
  ];
}

function frontFacingRibbonQuaternion(random = Math.random) {
  const direction = random() > 0.5 ? 1 : -1;
  const yaw = direction * randomBetween(0.90, 1.28, random);
  const roll = randomBetween(-0.86, 0.86, random);
  const sinYaw = Math.sin(yaw * 0.5);
  const cosYaw = Math.cos(yaw * 0.5);
  const sinRoll = Math.sin(roll * 0.5);
  const cosRoll = Math.cos(roll * 0.5);
  return [
    -sinRoll * sinYaw,
    cosRoll * sinYaw,
    sinRoll * cosYaw,
    cosRoll * cosYaw,
  ];
}

function randomInclusion(minRadius, maxRadius, probability, random = Math.random) {
  if (random() > probability) return [0, 0, 0, 0];
  let x;
  let y;
  let z;
  do {
    x = randomBetween(-0.48, 0.48, random);
    y = randomBetween(-0.48, 0.48, random);
    z = randomBetween(-0.48, 0.48, random);
  } while (x * x + y * y + z * z > 0.34);
  return [x, y, z, randomBetween(minRadius, maxRadius, random)];
}

function rollMarble(marble, dx, dy) {
  const distance = Math.hypot(dx, dy);
  if (distance < 0.00001) return;

  const halfAngle = distance / marble.radius * 0.5;
  const sine = Math.sin(halfAngle);
  const deltaX = (-dy / distance) * sine;
  const deltaY = (dx / distance) * sine;
  const deltaW = Math.cos(halfAngle);
  const [x, y, z, w] = marble.rotation;

  const nextX = deltaW * x + deltaX * w + deltaY * z;
  const nextY = deltaW * y - deltaX * z + deltaY * w;
  const nextZ = deltaW * z + deltaX * y - deltaY * x;
  const nextW = deltaW * w - deltaX * x - deltaY * y;
  const inverseLength = 1 / Math.hypot(nextX, nextY, nextZ, nextW);
  marble.rotation[0] = nextX * inverseLength;
  marble.rotation[1] = nextY * inverseLength;
  marble.rotation[2] = nextZ * inverseLength;
  marble.rotation[3] = nextW * inverseLength;
}

function createMarble(index, options = {}) {
  const random = options.random ?? Math.random;
  const paletteIndex = options.paletteIndex ?? Math.floor(random() * palettes.length);
  const palette = palettes[paletteIndex % palettes.length];
  const swapColors = random() > 0.5;
  const radius = options.radius ?? randomBetween(0.56, 0.74, random);
  const speed = options.speed ?? 0;
  const direction = random() * TAU;
  const detail = [random(), random(), random(), random()];
  const inclusionB = detail[3] > 0.58
    ? randomInclusion(0.026, 0.058, 0.76, random)
    : randomInclusion(0.015, 0.030, 0.65, random);
  return {
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    vx: Math.cos(direction) * speed,
    vy: Math.sin(direction) * speed,
    radius,
    rotation: options.frontFacingRibbon
      ? frontFacingRibbonQuaternion(random)
      : randomQuaternion(random),
    drift: random() * TAU,
    colorA: swapColors ? palette[1] : palette[0],
    colorB: swapColors ? palette[0] : palette[1],
    seed: random() * 20,
    style: [random(), random(), random(), random()],
    detail,
    inclusionA: randomInclusion(0.038, 0.080, 0.92, random),
    inclusionB,
    role: options.role ?? "free",
    scored: false,
    sleepTime: 0,
  };
}

function placeMarble(marble, index) {
  const halfW = state.view.width * 0.5;
  const halfH = state.view.height * 0.5;
  const mobile = state.view.width < 12;
  const safeTop = mobile ? halfH - 6.1 : halfH - 1.2;
  const safeLeft = mobile ? -halfW + 1 : -halfW + Math.min(7.6, halfW * 0.48);
  const clusterX = mobile ? 0 : state.view.width * 0.11;
  const clusterY = mobile ? -0.45 : -0.20;

  if (index < referenceClusterLayout.length) {
    const [layoutX, layoutY] = referenceClusterLayout[index];
    const jitterX = Math.sin(marble.seed * 2.17) * 0.07;
    const jitterY = Math.cos(marble.seed * 1.63) * 0.07;
    marble.x = Math.min(
      halfW - marble.radius,
      Math.max(safeLeft + marble.radius, clusterX + layoutX + jitterX),
    );
    marble.y = Math.min(
      safeTop - marble.radius,
      Math.max(-halfH + marble.radius, clusterY + layoutY + jitterY),
    );
    return;
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = index * 2.399 + attempt * 0.71;
    const spread = Math.min(3.25, 0.78 + Math.sqrt(index + 1) * 0.60);
    const candidateX = Math.cos(angle) * spread + clusterX;
    const candidateY = Math.sin(angle) * spread + clusterY;
    marble.x = Math.min(halfW - marble.radius, Math.max(safeLeft + marble.radius, candidateX));
    marble.y = Math.min(safeTop - marble.radius, Math.max(-halfH + marble.radius, candidateY));
    const overlaps = state.marbles.some((other) => {
      const dx = marble.x - other.x;
      const dy = marble.y - other.y;
      const minDistance = (marble.radius + other.radius) * 1.08;
      return dx * dx + dy * dy < minDistance * minDistance;
    });
    if (!overlaps) return;
  }

  marble.x = randomBetween(safeLeft + marble.radius, halfW - marble.radius);
  marble.y = randomBetween(-halfH + marble.radius, safeTop - marble.radius);
}

function setBackgroundMode(mode) {
  state.backgroundMode = mode;
  if (state.mode === "free") state.freeBackgroundMode = mode;
  backgroundButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.background) === mode));
  });
  ground.dirty = true;
}

function updateModeUi() {
  stage.dataset.mode = state.mode;
  freeControls.hidden = state.mode !== "free";
  gameHud.hidden = state.mode !== "game";
  modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.modeButton === state.mode));
  });
  ground.dirty = true;
}

function updateGameHud() {
  targetScore.textContent = `${state.game.targetsScored}/${GAME_TARGET_COUNT}`;
  shotsLeft.textContent = String(state.game.shotsRemaining);
}



function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1800);
}

function saveBestResult() {
  const next = {
    score: state.game.targetsScored,
    roundsCleared: Math.floor(state.game.targetsScored / GAME_TARGET_COUNT),
  };
  const key = "goosl:endless:v1:best";
  try {
    const previous = JSON.parse(localStorage.getItem(key) || "null");
    const isBetter = !previous || next.score > previous.score;
    if (isBetter) localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage is optional; gameplay must continue in restricted browsers.
  }
}

function finishGame(outcome = "exhausted") {
  if (state.game.phase === "result") return;
  state.game.phase = "result";
  state.game.outcome = outcome;
  state.game.canContinue = outcome === "round-clear-safe";
  state.dragged = null;
  aimLayer.classList.remove("is-visible");
  powerMeter.hidden = true;
  for (const marble of state.marbles) {
    marble.vx = 0;
    marble.vy = 0;
    marble.sleepTime = SLEEP_DELAY;
  }
  const isRoundClear = outcome === "round-clear" || outcome === "round-clear-safe";
  const isOut = outcome === "out";
  const stars = isRoundClear ? 3 : 0;
  resultTitle.textContent = t(isRoundClear ? "result.success" : "result.failure");
  resultStars.textContent = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
  resultStars.setAttribute("aria-label", t("result.stars", { count: stars }));
  if (isRoundClear) {
    resultScore.textContent = `${state.game.targetsScored}/${GAME_TARGET_COUNT}`;
  } else {
    const reason = t(isOut ? "result.reasonInside" : "result.reasonShots");
    resultScore.textContent = `${state.game.targetsScored}/${GAME_TARGET_COUNT} · ${reason}`;
  }
  resultContinueButton.hidden = !state.game.canContinue;
  resultPanel.hidden = false;
  if (isOut) {
    if (navigator.vibrate) navigator.vibrate([35, 28, 70]);
  }
  saveBestResult();
}

function createRoundTargets(round) {
  const random = Math.random;
  const improvedVisual = state.visualVersion > 0.5;
  const baseOffsets = improvedVisual
    ? [
      [0, 0],
      [-1.16, 0],
      [1.16, 0],
      [-0.58, 1.02],
      [0.58, 1.02],
      [-0.58, -1.02],
      [0.58, -1.02],
    ]
    : [
      [0, 0],
      [-1.08, 0],
      [1.08, 0],
      [-0.55, 0.95],
      [0.55, 0.95],
      [-0.55, -0.95],
      [0.55, -0.95],
    ];
  const rotation = randomBetween(-0.24, 0.24, random);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return baseOffsets.map(([offsetX, offsetY], index) => {
    const marble = createMarble((round - 1) * GAME_TARGET_COUNT + index, {
      random,
      radius: improvedVisual ? 0.57 : 0.52,
      role: "target",
      frontFacingRibbon: improvedVisual,
      paletteIndex: improvedVisual ? index : undefined,
    });
    const jitterX = randomBetween(-0.055, 0.055, random);
    const jitterY = randomBetween(-0.055, 0.055, random);
    const targetX = GAME_RING_CENTER[0] + offsetX * cosine - offsetY * sine + jitterX;
    const targetY = GAME_RING_CENTER[1] + offsetX * sine + offsetY * cosine + jitterY;
    marble.baseRadius = marble.radius;
    marble.radius = 0.001;
    marble.spawnTargetX = targetX;
    marble.spawnTargetY = targetY;
    marble.spawnStartX = targetX + randomBetween(-0.16, 0.16, random);
    marble.spawnStartY = targetY + randomBetween(2.2, 3.0, random);
    marble.spawnDelay = index * SPAWN_STAGGER + randomBetween(0, 0.025, random);
    marble.spawnDuration = SPAWN_DURATION + randomBetween(-0.04, 0.05, random);
    marble.spawnLanded = false;
    marble.x = marble.spawnStartX;
    marble.y = marble.spawnStartY;
    marble.previousX = marble.x;
    marble.previousY = marble.y;
    return marble;
  });
}

function createGameMarbles() {
  const random = Math.random;
  const improvedVisual = state.visualVersion > 0.5;
  const targets = createRoundTargets(1);
  const shooter = createMarble(GAME_TARGET_COUNT, {
    random,
    radius: improvedVisual ? 0.66 : 0.64,
    role: "shooter",
    frontFacingRibbon: improvedVisual,
    paletteIndex: improvedVisual ? 1 : undefined,
  });
  shooter.x = GAME_SHOOTER_ORIGIN[0];
  shooter.y = GAME_SHOOTER_ORIGIN[1];
  shooter.previousX = shooter.x;
  shooter.previousY = shooter.y;
  return [...targets, shooter];
}

function startGame() {
  state.game.phase = "spawning";
  state.game.round = 1;
  state.game.targetsScored = 0;
  state.game.shotsRemaining = GAME_SHOT_COUNT;
  state.game.shotElapsed = 0;
  state.game.settleElapsed = 0;
  state.game.spawnElapsed = 0;
  state.game.aimX = 0;
  state.game.aimY = 0;
  state.game.outcome = "playing";
  state.game.canContinue = false;
  state.marbles = createGameMarbles();
  state.dragged = null;
  state.hovered = null;
  state.running = true;
  state.accumulator = 0;
  resultPanel.hidden = true;
  resultContinueButton.hidden = true;
  aimLayer.classList.remove("is-visible");
  powerMeter.hidden = true;
  setBackgroundMode(state.visualVersion > 0.5 ? 1 : 0);
  updateGameHud();
  drawCount.textContent = `${state.marbles.length} MARBLES`;
}

function continueGame() {
  if (!state.game.canContinue) return;
  const shooter = getShooter();
  if (!shooter) return;
  shooter.vx = 0;
  shooter.vy = 0;
  shooter.sleepTime = SLEEP_DELAY;
  state.game.round += 1;
  state.game.phase = "spawning";
  state.game.shotsRemaining = GAME_SHOT_COUNT;
  state.game.shotElapsed = 0;
  state.game.settleElapsed = 0;
  state.game.spawnElapsed = 0;
  state.game.aimX = 0;
  state.game.aimY = 0;
  state.game.outcome = "playing";
  state.game.canContinue = false;
  state.marbles = [...createRoundTargets(state.game.round), shooter];
  state.dragged = null;
  state.hovered = null;
  resultPanel.hidden = true;
  resultContinueButton.hidden = true;
  aimLayer.classList.remove("is-visible");
  powerMeter.hidden = true;
  updateGameHud();
  drawCount.textContent = `${state.marbles.length} MARBLES`;
}

function startFreeMode() {
  state.marbles = [];
  state.dragged = null;
  state.hovered = null;
  state.running = true;
  state.accumulator = 0;
  resultPanel.hidden = true;
  aimLayer.classList.remove("is-visible");
  powerMeter.hidden = true;
  motionButton.setAttribute("aria-pressed", "false");
  const motionLabel = t("motion.stop");
  motionButton.setAttribute("aria-label", motionLabel);
  motionButton.title = motionLabel;
  motionButton.querySelector(".button-label").textContent = motionLabel;
  setBackgroundMode(state.freeBackgroundMode);
  setMarbleCount(countSlider.value);
}

function setMode(mode, force = false) {
  if (!force && mode === state.mode) return;
  state.mode = mode === "free" ? "free" : "game";
  if (state.mode === "game" && tiltControl.enabled) disableTiltControl();
  updateModeUi();
  if (state.mode === "game") startGame();
  else startFreeMode();
}

function worldToScreen(x, y) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (x / state.view.width + 0.5) * rect.width,
    y: (0.5 - y / state.view.height) * rect.height,
  };
}

function updateAimGuide() {
  const shooter = getShooter();
  const pull = Math.hypot(state.game.aimX, state.game.aimY);
  if (!shooter || state.game.phase !== "aiming") {
    aimLayer.classList.remove("is-visible");
    powerMeter.hidden = true;
    return;
  }
  const power = Math.min(1, pull / GAME_MAX_PULL);
  const powerPercent = Math.round(power * 100);
  powerMeter.hidden = false;
  powerMeter.setAttribute("aria-valuenow", String(powerPercent));
  powerFill.style.transform = `scaleX(${power.toFixed(3)})`;
  powerOutput.textContent = String(powerPercent);
  if (pull < 0.03) {
    aimLayer.classList.remove("is-visible");
    return;
  }
  const directionX = state.game.aimX / pull;
  const directionY = state.game.aimY / pull;
  const guideLength = 2.1 + pull * 1.15;
  const start = worldToScreen(shooter.x, shooter.y);
  const end = worldToScreen(
    shooter.x + directionX * guideLength,
    shooter.y + directionY * guideLength,
  );
  aimLine.setAttribute("x1", start.x.toFixed(1));
  aimLine.setAttribute("y1", start.y.toFixed(1));
  aimLine.setAttribute("x2", end.x.toFixed(1));
  aimLine.setAttribute("y2", end.y.toFixed(1));
  aimDot.setAttribute("cx", end.x.toFixed(1));
  aimDot.setAttribute("cy", end.y.toFixed(1));
  aimLayer.classList.add("is-visible");
}

function createShareText() {
  const score = state.game.targetsScored;
  const isOut = state.game.outcome === "out";
  const isExhausted = state.game.outcome === "exhausted";
  const isRoundClear = state.game.outcome === "round-clear"
    || state.game.outcome === "round-clear-safe";
  const outcome = isOut
    ? t("share.outcomeInside")
    : isExhausted
      ? t("share.outcomeShots")
      : isRoundClear
        ? t("share.outcomeSuccess")
        : "";
  const outcomeText = outcome ? ` · ${outcome}` : "";
  return t("share.result", {
    score,
    goal: GAME_TARGET_COUNT,
    outcome: outcomeText,
    url: PUBLIC_GAME_URL,
  });
}

async function shareGameResult() {
  const text = createShareText();
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(t("share.copied"));
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
    showToast(t("share.copied"));
  }
}

function setMarbleCount(nextCount) {
  const target = Math.max(6, Math.min(MAX_MARBLES, Number(nextCount)));
  while (state.marbles.length < target) {
    const marble = createMarble(state.marbles.length);
    placeMarble(marble, state.marbles.length);
    state.marbles.push(marble);
  }
  if (state.marbles.length > target) state.marbles.length = target;
  countOutput.value = String(target);
  drawCount.textContent = `${target} MARBLES`;
}

function scatterMarbles() {
  const marbles = state.marbles.splice(0);
  marbles.forEach((marble, index) => {
    const direction = Math.random() * TAU;
    const speed = randomBetween(1.4, 3.1);
    marble.vx = Math.cos(direction) * speed;
    marble.vy = Math.sin(direction) * speed;
    placeMarble(marble, index);
    state.marbles.push(marble);
  });
}

function getShooter() {
  return state.marbles.find((marble) => marble.role === "shooter") ?? null;
}

function easeOutBounce(progress) {
  const bounce = 7.5625;
  const step = 2.75;
  if (progress < 1 / step) return bounce * progress * progress;
  if (progress < 2 / step) {
    const shifted = progress - 1.5 / step;
    return bounce * shifted * shifted + 0.75;
  }
  if (progress < 2.5 / step) {
    const shifted = progress - 2.25 / step;
    return bounce * shifted * shifted + 0.9375;
  }
  const shifted = progress - 2.625 / step;
  return bounce * shifted * shifted + 0.984375;
}

function updateSpawnAnimation(dt) {
  state.game.spawnElapsed += dt;
  let allLanded = true;
  for (const marble of state.marbles) {
    if (marble.role !== "target" || marble.spawnLanded) continue;
    const progress = (state.game.spawnElapsed - marble.spawnDelay) / marble.spawnDuration;
    if (progress <= 0) {
      allLanded = false;
      continue;
    }
    const clamped = Math.min(1, progress);
    const eased = easeOutBounce(clamped);
    marble.previousX = marble.x;
    marble.previousY = marble.y;
    marble.x = marble.spawnStartX + (marble.spawnTargetX - marble.spawnStartX) * clamped;
    marble.y = marble.spawnStartY + (marble.spawnTargetY - marble.spawnStartY) * eased;
    const scaleProgress = Math.min(1, clamped * 3.2);
    marble.radius = marble.baseRadius * (1 - Math.pow(1 - scaleProgress, 3));
    if (clamped < 1) {
      allLanded = false;
      continue;
    }
    marble.x = marble.spawnTargetX;
    marble.y = marble.spawnTargetY;
    marble.previousX = marble.x;
    marble.previousY = marble.y;
    marble.radius = marble.baseRadius;
    marble.spawnLanded = true;
    marble.sleepTime = SLEEP_DELAY;
    playCollisionSound(0.72 + marble.baseRadius * 0.5, marble.baseRadius, marble.x);
  }
  if (allLanded) state.game.phase = "ready";
}

function resolveGameShot() {
  const shooter = getShooter();
  const shooterDx = shooter ? shooter.x - GAME_RING_CENTER[0] : Infinity;
  const shooterDy = shooter ? shooter.y - GAME_RING_CENTER[1] : Infinity;
  const shooterDistance = Math.hypot(shooterDx, shooterDy);
  const shooterIsInside = shooter
    ? shooterDistance + shooter.radius <= GAME_RING_RADIUS
    : false;
  for (const marble of state.marbles) {
    marble.vx = 0;
    marble.vy = 0;
    marble.sleepTime = SLEEP_DELAY;
  }
  state.game.shotElapsed = 0;
  state.game.settleElapsed = 0;
  const roundGoal = state.game.round * GAME_TARGET_COUNT;
  const roundCleared = state.game.targetsScored >= roundGoal;
  if (roundCleared) {
    finishGame(shooterIsInside ? "round-clear" : "round-clear-safe");
    return;
  }
  if (shooterIsInside) {
    finishGame("out");
    return;
  }
  if (state.game.shotsRemaining <= 0) {
    finishGame("exhausted");
    return;
  }
  state.game.phase = "ready";
}

function updatePhysics(dt) {
  if (state.mode === "game" && state.game.phase === "spawning") {
    updateSpawnAnimation(dt);
    return;
  }
  const halfW = state.view.width * 0.5;
  const halfH = state.view.height * 0.5;

  for (const marble of state.marbles) {
    if (marble.scored) continue;
    marble.previousX = marble.x;
    marble.previousY = marble.y;
    if (marble !== state.dragged) {
      if (state.mode === "free" && tiltControl.enabled && tiltControl.hasReading) {
        marble.vx += tiltControl.x * FREE_TILT_ACCELERATION * dt;
        marble.vy += tiltControl.y * FREE_TILT_ACCELERATION * dt;
        const tiltedSpeed = Math.hypot(marble.vx, marble.vy);
        if (tiltedSpeed > FREE_TILT_MAX_SPEED) {
          const scale = FREE_TILT_MAX_SPEED / tiltedSpeed;
          marble.vx *= scale;
          marble.vy *= scale;
        }
        if (Math.abs(tiltControl.x) + Math.abs(tiltControl.y) > 0.01) marble.sleepTime = 0;
      }
      const speed = Math.hypot(marble.vx, marble.vy);
      const rollingDrag = speed > 1.4
        ? FAST_ROLLING_DRAG
        : speed > 0.24
          ? MEDIUM_ROLLING_DRAG
          : SLOW_ROLLING_DRAG;
      const damping = Math.exp(-rollingDrag * dt);
      marble.x += marble.vx * dt;
      marble.y += marble.vy * dt;
      marble.vx *= damping;
      marble.vy *= damping;
    }

    if (marble.x - marble.radius < -halfW) {
      playCollisionSound(Math.abs(marble.vx) * 0.68, marble.radius, marble.x);
      marble.x = -halfW + marble.radius;
      marble.vx = Math.abs(marble.vx) * WALL_RESTITUTION;
    } else if (marble.x + marble.radius > halfW) {
      playCollisionSound(Math.abs(marble.vx) * 0.68, marble.radius, marble.x);
      marble.x = halfW - marble.radius;
      marble.vx = -Math.abs(marble.vx) * WALL_RESTITUTION;
    }
    if (marble.y - marble.radius < -halfH) {
      playCollisionSound(Math.abs(marble.vy) * 0.58, marble.radius, marble.x);
      marble.y = -halfH + marble.radius;
      marble.vy = Math.abs(marble.vy) * WALL_RESTITUTION;
    } else if (marble.y + marble.radius > halfH) {
      playCollisionSound(Math.abs(marble.vy) * 0.58, marble.radius, marble.x);
      marble.y = halfH - marble.radius;
      marble.vy = -Math.abs(marble.vy) * WALL_RESTITUTION;
    }
  }

  for (let i = 0; i < state.marbles.length; i += 1) {
    const a = state.marbles[i];
    if (a.scored) continue;
    for (let j = i + 1; j < state.marbles.length; j += 1) {
      const b = state.marbles[j];
      if (b.scored) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distanceSquared = dx * dx + dy * dy;
      const minDistance = a.radius + b.radius;
      if (distanceSquared >= minDistance * minDistance) continue;

      if (distanceSquared < 0.0001) {
        dx = 0.001;
        dy = 0;
        distanceSquared = dx * dx;
      }
      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minDistance - distance;
      const aLocked = a === state.dragged;
      const bLocked = b === state.dragged;
      const aMove = aLocked ? 0 : bLocked ? 1 : 0.5;
      const bMove = bLocked ? 0 : aLocked ? 1 : 0.5;
      a.x -= nx * overlap * aMove;
      a.y -= ny * overlap * aMove;
      b.x += nx * overlap * bMove;
      b.y += ny * overlap * bMove;

      const relativeVx = b.vx - a.vx;
      const relativeVy = b.vy - a.vy;
      const separatingSpeed = relativeVx * nx + relativeVy * ny;
      if (separatingSpeed < 0) {
        playCollisionSound(
          -separatingSpeed,
          (a.radius + b.radius) * 0.5,
          (a.x + b.x) * 0.5,
        );
        const impulse = -(1.0 + COLLISION_RESTITUTION) * separatingSpeed * 0.5;
        if (!aLocked) {
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          a.sleepTime = 0;
        }
        if (!bLocked) {
          b.vx += impulse * nx;
          b.vy += impulse * ny;
          b.sleepTime = 0;
        }
      }
    }
  }

  for (const marble of state.marbles) {
    if (marble.scored || marble === state.dragged) continue;
    rollMarble(marble, marble.x - marble.previousX, marble.y - marble.previousY);
    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed < SLEEP_SPEED) {
      marble.sleepTime += dt;
      if (marble.sleepTime >= SLEEP_DELAY) {
        marble.vx = 0;
        marble.vy = 0;
      }
    } else {
      marble.sleepTime = 0;
    }
  }

  if (state.mode !== "game" || state.game.phase !== "rolling") return;

  let scoredThisStep = 0;
  for (const marble of state.marbles) {
    if (marble.role !== "target" || marble.scored) continue;
    const dx = marble.x - GAME_RING_CENTER[0];
    const dy = marble.y - GAME_RING_CENTER[1];
    if (dx * dx + dy * dy <= GAME_RING_RADIUS * GAME_RING_RADIUS) continue;
    marble.scored = true;
    state.game.targetsScored += 1;
    scoredThisStep += 1;
    playScoreSound(state.game.targetsScored - 1);
  }

  if (scoredThisStep > 0) {
    state.marbles = state.marbles.filter((marble) => !marble.scored);
    updateGameHud();
    drawCount.textContent = `${state.marbles.length} MARBLES`;
    if (navigator.vibrate) navigator.vibrate(12);
  }

  state.game.shotElapsed += dt;
  const maxSpeed = state.marbles.reduce(
    (maximum, marble) => Math.max(maximum, Math.hypot(marble.vx, marble.vy)),
    0,
  );
  if (maxSpeed < SLEEP_SPEED) state.game.settleElapsed += dt;
  else state.game.settleElapsed = 0;

  if (state.game.shotElapsed >= GAME_MAX_SHOT_TIME) {
    state.game.settleElapsed = GAME_SETTLE_TIME;
  }
  if (state.game.settleElapsed >= GAME_SETTLE_TIME) resolveGameShot();
}

function updateInstanceBuffer() {
  const data = state.instanceData;
  state.marbles.forEach((marble, index) => {
    const offset = index * INSTANCE_FLOATS;
    data[offset] = marble.x;
    data[offset + 1] = marble.y;
    data[offset + 2] = marble.radius;
    data.set(marble.rotation, offset + 3);
    data.set(marble.colorA, offset + 7);
    data.set(marble.colorB, offset + 10);
    data[offset + 13] = marble.seed;
    data.set(marble.style, offset + 14);
    data.set(marble.detail, offset + 18);
    data.set(marble.inclusionA, offset + 22);
    data.set(marble.inclusionB, offset + 26);
    const isReadyShooter = state.mode === "game"
      && marble.role === "shooter"
      && (state.game.phase === "ready" || state.game.phase === "aiming");
    data[offset + 30] = marble === state.dragged || marble === state.hovered || isReadyShooter ? 1 : 0;
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, state.marbles.length * INSTANCE_FLOATS);
}

function render() {
  resizeCanvas();
  updateInstanceBuffer();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  if (ground.dirty) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, ground.framebuffer);
    gl.disable(gl.BLEND);
    gl.useProgram(programs.background);
    gl.uniform2f(uniforms.background.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.background.view, state.view.width, state.view.height);
    gl.uniform1i(uniforms.background.mode, state.backgroundMode);
    gl.uniform1i(uniforms.background.showRing, state.mode === "game" ? 1 : 0);
    gl.uniform1f(uniforms.background.visualVersion, state.visualVersion);
    gl.bindVertexArray(fullscreenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ground.dirty = false;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
  gl.disable(gl.BLEND);
  gl.useProgram(programs.copy);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ground.texture);
  gl.uniform1i(uniforms.copy.scene, 0);
  gl.bindVertexArray(fullscreenVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(programs.shadow);
  gl.uniform2f(uniforms.shadow.view, state.view.width, state.view.height);
  gl.uniform1f(uniforms.shadow.visualVersion, state.visualVersion);
  gl.bindVertexArray(shadowVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, state.marbles.length);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  gl.useProgram(programs.copy);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, scene.texture);
  gl.uniform1i(uniforms.copy.scene, 0);
  gl.bindVertexArray(fullscreenVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(programs.marble);
  gl.uniform2f(uniforms.marble.view, state.view.width, state.view.height);
  gl.uniform2f(uniforms.marble.resolution, canvas.width, canvas.height);
  gl.uniform1i(uniforms.marble.scene, 0);
  gl.uniform1f(uniforms.marble.visualVersion, state.visualVersion);
  gl.bindVertexArray(marbleVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, state.marbles.length);
  gl.bindVertexArray(null);
}

function frame(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;
  if (state.running) {
    state.accumulator = Math.min(
      state.accumulator + dt,
      FIXED_STEP * MAX_PHYSICS_STEPS,
    );
    let steps = 0;
    while (state.accumulator >= FIXED_STEP && steps < MAX_PHYSICS_STEPS) {
      updatePhysics(FIXED_STEP);
      state.accumulator -= FIXED_STEP;
      steps += 1;
    }
  } else {
    state.accumulator = 0;
  }
  updateRollingSound();
  render();

  const moving = (state.mode === "game" && state.game.phase === "spawning")
    || state.dragged !== null || state.marbles.some(
    (marble) => Math.hypot(marble.vx, marble.vy) >= SLEEP_SPEED,
  );
  const nextMotionLabel = t(moving ? "motion.moving" : "motion.stopped");
  if (nextMotionLabel !== state.motionLabel) {
    state.motionLabel = nextMotionLabel;
    motionState.textContent = nextMotionLabel;
  }
  stage.dataset.motion = moving ? "moving" : "stopped";

  state.fpsFrames += 1;
  if (now - state.fpsTime > 500) {
    const fps = Math.round((state.fpsFrames * 1000) / (now - state.fpsTime));
    fpsLabel.textContent = `${Math.min(99, fps)} FPS`;
    state.fpsFrames = 0;
    state.fpsTime = now;
  }
  requestAnimationFrame(frame);
}

function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width - 0.5) * state.view.width,
    y: (0.5 - (event.clientY - rect.top) / rect.height) * state.view.height,
  };
}

function findMarble(point) {
  for (let i = state.marbles.length - 1; i >= 0; i -= 1) {
    const marble = state.marbles[i];
    const dx = point.x - marble.x;
    const dy = point.y - marble.y;
    if (dx * dx + dy * dy <= marble.radius * marble.radius * 1.15) return marble;
  }
  return null;
}

canvas.addEventListener("pointerdown", (event) => {
  if (!audio.enabled) void setSoundEnabled(true);
  const point = pointerToWorld(event);
  const marble = findMarble(point);
  if (!marble) return;
  if (state.mode === "game") {
    if (state.game.phase !== "ready" || marble.role !== "shooter") return;
    state.game.phase = "aiming";
    state.game.aimX = 0;
    state.game.aimY = 0;
    updateAimGuide();
  }
  state.dragged = marble;
  state.pointer = { x: point.x, y: point.y, lastX: point.x, lastY: point.y, time: performance.now() };
  marble.vx = 0;
  marble.vy = 0;
  canvas.classList.add("is-dragging");
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const point = pointerToWorld(event);
  if (!state.dragged) {
    const hovered = findMarble(point);
    state.hovered = state.mode === "free" || hovered?.role === "shooter" ? hovered : null;
    return;
  }
  if (state.mode === "game") {
    let aimX = point.x - state.dragged.x;
    let aimY = point.y - state.dragged.y;
    const pull = Math.hypot(aimX, aimY);
    if (pull > GAME_MAX_PULL) {
      const scale = GAME_MAX_PULL / pull;
      aimX *= scale;
      aimY *= scale;
    }
    state.game.aimX = aimX;
    state.game.aimY = aimY;
    updateAimGuide();
    return;
  }
  const now = performance.now();
  const elapsed = Math.max(8, now - state.pointer.time) / 1000;
  const halfW = state.view.width * 0.5;
  const halfH = state.view.height * 0.5;
  const marble = state.dragged;
  const nextX = Math.max(-halfW + marble.radius, Math.min(halfW - marble.radius, point.x));
  const nextY = Math.max(-halfH + marble.radius, Math.min(halfH - marble.radius, point.y));
  rollMarble(marble, nextX - marble.x, nextY - marble.y);
  marble.x = nextX;
  marble.y = nextY;
  marble.vx = (point.x - state.pointer.lastX) / elapsed;
  marble.vy = (point.y - state.pointer.lastY) / elapsed;
  marble.sleepTime = 0;
  state.pointer.lastX = point.x;
  state.pointer.lastY = point.y;
  state.pointer.time = now;
});

function releasePointer(event) {
  if (!state.dragged) return;
  if (state.mode === "game") {
    const shooter = state.dragged;
    const pull = Math.hypot(state.game.aimX, state.game.aimY);
    state.dragged = null;
    state.hovered = null;
    canvas.classList.remove("is-dragging");
    aimLayer.classList.remove("is-visible");
    powerMeter.hidden = true;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (pull < GAME_MIN_PULL) {
      state.game.phase = "ready";
      state.game.aimX = 0;
      state.game.aimY = 0;
      return;
    }
    shooter.vx = state.game.aimX * GAME_SHOT_POWER;
    shooter.vy = state.game.aimY * GAME_SHOT_POWER;
    shooter.sleepTime = 0;
    state.game.shotsRemaining -= 1;
    state.game.shotElapsed = 0;
    state.game.settleElapsed = 0;
    state.game.phase = "rolling";
    updateGameHud();
    return;
  }
  const speed = Math.hypot(state.dragged.vx, state.dragged.vy);
  if (speed > 10) {
    const scale = 10 / speed;
    state.dragged.vx *= scale;
    state.dragged.vy *= scale;
  }
  state.dragged = null;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

function cancelPointer(event) {
  if (!state.dragged) return;
  if (state.mode === "game") {
    state.game.phase = "ready";
    state.game.aimX = 0;
    state.game.aimY = 0;
    aimLayer.classList.remove("is-visible");
    powerMeter.hidden = true;
  }
  state.dragged.vx = 0;
  state.dragged.vy = 0;
  state.dragged = null;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", cancelPointer);
canvas.addEventListener("pointerleave", () => {
  if (!state.dragged) state.hovered = null;
});

countSlider.addEventListener("input", () => {
  if (state.mode === "free") setMarbleCount(countSlider.value);
});
backgroundButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (state.mode !== "free") return;
    const nextMode = Number(button.dataset.background);
    if (!Number.isInteger(nextMode) || nextMode === state.backgroundMode) return;
    setBackgroundMode(nextMode);
  });
});
modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.modeButton));
});
restartGameButton.addEventListener("click", () => startGame());
resultContinueButton.addEventListener("click", () => continueGame());
resultRestartButton.addEventListener("click", () => startGame());
shareResultButton.addEventListener("click", () => void shareGameResult());
resultShareButton.addEventListener("click", () => void shareGameResult());
helpButton.addEventListener("click", openHelpDialog);
helpCloseButton.addEventListener("click", closeHelpDialog);
helpConfirmButton.addEventListener("click", closeHelpDialog);
helpBackdrop.addEventListener("click", (event) => {
  if (event.target === helpBackdrop) closeHelpDialog();
});
document.addEventListener("keydown", handleHelpKeydown);

soundButton.addEventListener("click", () => {
  void setSoundEnabled(!audio.enabled);
});
menuButton.addEventListener("click", () => {
  setMenuHidden(!stage.classList.contains("is-ui-hidden"));
});
tiltButton.addEventListener("click", () => {
  if (state.mode !== "free") return;
  if (tiltControl.enabled) disableTiltControl();
  else void enableTiltControl();
});
scatterButton.addEventListener("click", () => {
  if (state.mode !== "free") return;
  if (!audio.enabled) void setSoundEnabled(true);
  scatterMarbles();
});
motionButton.addEventListener("click", () => {
  if (state.mode !== "free") return;
  state.running = !state.running;
  motionButton.setAttribute("aria-pressed", String(!state.running));
  const motionLabel = t(state.running ? "motion.stop" : "motion.resume");
  motionButton.setAttribute("aria-label", motionLabel);
  motionButton.title = motionLabel;
  motionButton.querySelector(".button-label").textContent = motionLabel;
});

document.addEventListener("visibilitychange", () => {
  state.lastTime = performance.now();
  if (document.hidden) resetTiltCalibration();
  if (!audio.context) return;
  if (document.hidden) {
    void audio.context.suspend();
  } else if (audio.enabled) {
    void audio.context.resume();
  }
});

window.addEventListener("resize", () => {
  resizeCanvas();
  for (const marble of state.marbles) {
    const halfW = state.view.width * 0.5;
    const halfH = state.view.height * 0.5;
    marble.x = Math.max(-halfW + marble.radius, Math.min(halfW - marble.radius, marble.x));
    marble.y = Math.max(-halfH + marble.radius, Math.min(halfH - marble.radius, marble.y));
  }
  updateAimGuide();
});
screen.orientation?.addEventListener?.("change", resetTiltCalibration);
window.addEventListener("orientationchange", resetTiltCalibration);

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  errorBox.textContent = t("error.contextLost");
  errorBox.hidden = false;
});

try {
  discordLink.href = DISCORD_URL;
  updateTiltButton();
  setMenuHidden(false);
  
  resizeCanvas();
  setMode(query.get("mode") === "free" ? "free" : "game", true);
  openFirstVisitHelp();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  errorBox.textContent = t("error.renderer");
  errorBox.hidden = false;
}
