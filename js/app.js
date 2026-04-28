import {
  CONFIG,
  TRAIL_MODES,
  WAVE_TYPES,
  STAR_DEFAULT_FORCE,
  STAR_DEFAULT_RADIUS,
  STAR_DEFAULT_DISPLAY,
  STAR_DISPLAY_MODES,
  STAR_MAX,
} from './config.js';
import { clamp, randomBetween } from './utils.js';
import { Logo, makeLogoName, cleanLogoName, logoCanDrone } from './logo.js';
import { AudioEngine } from './audio.js';
import { updatePhysics } from './physics.js';
import {
  initRenderer,
  resizeCanvas,
  getLogoAspectRatio,
  drawFrame,
} from './renderer.js';

const canvas = document.getElementById('stage');
const navbarEl = document.querySelector('.navbar');

const inspector = document.getElementById('inspector');
const controlsEl = document.getElementById('controls');
const starControlsEl = document.getElementById('starControls');
const starForceInput = document.getElementById('starForceInput');
const starForceReadout = document.getElementById('starForceReadout');
const starRadiusInput = document.getElementById('starRadiusInput');
const starDisplayInput = document.getElementById('starDisplayInput');
const deleteStarBtn = document.getElementById('deleteStarBtn');

function formatForce(value) {
  const n = Math.round(Number(value));
  return n > 0 ? `+${n}` : String(n);
}

const addBtn = document.getElementById('addBtn');
const removeBtn = document.getElementById('removeBtn');
const addStarBtn = document.getElementById('addStarBtn');
const removeStarBtn = document.getElementById('removeStarBtn');
const cornersModeBtn = document.getElementById('cornersModeBtn');
const helpBtn = document.getElementById('helpBtn');
const configBtn = document.getElementById('configBtn');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
const helpDialog = document.getElementById('helpDialog');
const closeHelpBtn = document.getElementById('closeHelpBtn');

const presetSelect = document.getElementById('presetSelect');
const applyPresetBtn = document.getElementById('applyPresetBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const saveSceneBtn = document.getElementById('saveSceneBtn');
const loadSceneBtn = document.getElementById('loadSceneBtn');
const loadSceneInput = document.getElementById('loadSceneInput');
const collisionsInput = document.getElementById('collisionsInput');
const masterGainInput = document.getElementById('masterGainInput');
const logoCountReadout = document.getElementById('logoCountReadout');
const fpsReadout = document.getElementById('fpsReadout');
const channelList = document.getElementById('channelList');
const channelCountLabel = document.getElementById('channelCountLabel');
const selectedChannelLabel = document.getElementById('selectedChannelLabel');

const speedInput = document.getElementById('speedInput');
const trailInput = document.getElementById('trailInput');
const soundEnabledInput = document.getElementById('soundEnabledInput');
const waveInput = document.getElementById('waveInput');
const reverbSendInput = document.getElementById('reverbSendInput');
const delayMixInput = document.getElementById('delayMixInput');
const delayTimeInput = document.getElementById('delayTimeInput');
const trailLengthInput = document.getElementById('trailLengthInput');
const droneEnabledInput = document.getElementById('droneEnabledInput');
const droneFreqInput = document.getElementById('droneFreqInput');
const droneVolumeInput = document.getElementById('droneVolumeInput');
const droneWaveInput = document.getElementById('droneWaveInput');
const droneFilterTypeInput = document.getElementById('droneFilterTypeInput');
const droneFilterCutoffInput = document.getElementById('droneFilterCutoffInput');
const droneFilterQInput = document.getElementById('droneFilterQInput');
const droneLfoRateInput = document.getElementById('droneLfoRateInput');
const droneLfoDepthInput = document.getElementById('droneLfoDepthInput');

let width = 0;
let height = 0;

let logoCounter = 0;
const logos = [];
let selectedLogoId = null;

let starCounter = 0;
const stars = [];
let selectedStarId = null;
let dragStarId = null;
const dragOffset = { x: 0, y: 0 };

let cornersModeActive = false;
let cornersModePrevCollisions = null;
const cornerStarIds = [];
const CORNER_STAR_FORCE = 100;
const CORNER_STAR_INSET = 60;
const STAR_RADIUS_MIN = 50;
const STAR_RADIUS_MAX = 1500;
const CORNER_STAR_RADIUS = Math.round(STAR_RADIUS_MIN + (STAR_RADIUS_MAX - STAR_RADIUS_MIN) * 0.25);

const state = {
  collisionsEnabled: true,
  performanceMode: false,
  trailQuality: 1,
  fps: 60,
  sceneLabel: 'Custom',
  masterGain: CONFIG.defaultMasterGain,
  reverbReturn: CONFIG.defaultReverbReturn,
  delayReturn: CONFIG.defaultDelayReturn,
  fpsReadoutAccumulator: 0,
  topInset: 0,
};

const audio = new AudioEngine();

initRenderer(canvas);

function handleResize() {
  const dims = resizeCanvas(CONFIG.dprLimit);
  width = dims.width;
  height = dims.height;
  state.topInset = navbarEl ? Math.round(navbarEl.getBoundingClientRect().height) : 0;
  for (const logo of logos) {
    clampLogoInBounds(logo);
  }
  for (const star of stars) {
    star.x = clamp(star.x, 0, width);
    star.y = clamp(star.y, state.topInset, height);
  }
  if (cornersModeActive) {
    repositionCornerStars();
  }
}

function cornerStarPositions() {
  const inset = CORNER_STAR_INSET;
  const topY = state.topInset + inset;
  const bottomY = Math.max(topY, height - inset);
  return [
    { x: inset, y: topY },
    { x: Math.max(inset, width - inset), y: topY },
    { x: inset, y: bottomY },
    { x: Math.max(inset, width - inset), y: bottomY },
  ];
}

function cornerStarRadius() {
  return CORNER_STAR_RADIUS;
}

function repositionCornerStars() {
  const positions = cornerStarPositions();
  const radius = cornerStarRadius();
  let i = 0;
  for (const id of cornerStarIds) {
    const star = stars.find((s) => s.id === id);
    if (star && positions[i]) {
      star.x = positions[i].x;
      star.y = positions[i].y;
      star.radius = radius;
    }
    i += 1;
  }
}

function enableCornersMode() {
  if (cornersModeActive) return false;

  const free = STAR_MAX - stars.length;
  if (free < 4) {
    return false;
  }

  const positions = cornerStarPositions();
  const radius = cornerStarRadius();
  cornerStarIds.length = 0;
  for (const pos of positions) {
    const id = ++starCounter;
    stars.push({
      id,
      x: pos.x,
      y: pos.y,
      force: CORNER_STAR_FORCE,
      radius,
      display: 'star',
    });
    cornerStarIds.push(id);
  }

  cornersModePrevCollisions = state.collisionsEnabled;
  state.collisionsEnabled = false;
  collisionsInput.checked = false;

  cornersModeActive = true;
  cornersModeBtn.classList.add('active');
  cornersModeBtn.setAttribute('aria-pressed', 'true');
  return true;
}

function disableCornersMode() {
  if (!cornersModeActive) return false;

  for (const id of cornerStarIds) {
    const idx = stars.findIndex((s) => s.id === id);
    if (idx >= 0) {
      stars.splice(idx, 1);
    }
    if (selectedStarId === id) {
      selectedStarId = null;
    }
  }
  cornerStarIds.length = 0;
  cornersModeActive = false;
  cornersModeBtn.classList.remove('active');
  cornersModeBtn.setAttribute('aria-pressed', 'false');

  if (cornersModePrevCollisions !== null) {
    state.collisionsEnabled = cornersModePrevCollisions;
    collisionsInput.checked = cornersModePrevCollisions;
    cornersModePrevCollisions = null;
  }

  syncInspector();
  return true;
}

function toggleCornersMode() {
  if (cornersModeActive) {
    disableCornersMode();
    return false;
  }
  return enableCornersMode();
}

function addStar() {
  if (stars.length >= STAR_MAX) {
    return false;
  }
  const id = ++starCounter;
  stars.push({
    id,
    x: randomBetween(width * 0.15, width * 0.85),
    y: randomBetween(height * 0.15, height * 0.85),
    force: STAR_DEFAULT_FORCE,
    radius: STAR_DEFAULT_RADIUS,
    display: STAR_DEFAULT_DISPLAY,
  });
  selectStar(id);
  return true;
}

function removeStar() {
  if (stars.length === 0) {
    return false;
  }
  const removed = stars.pop();
  if (removed && selectedStarId === removed.id) {
    selectedStarId = null;
    syncInspector();
  }
  return true;
}

function getSelectedStar() {
  return stars.find((s) => s.id === selectedStarId) || null;
}

function selectStar(id) {
  selectedStarId = id;
  selectedLogoId = null;
  syncInspector();
  renderChannelList();
}

function deleteStar(id) {
  const idx = stars.findIndex((s) => s.id === id);
  if (idx < 0) return;
  stars.splice(idx, 1);
  if (selectedStarId === id) {
    selectedStarId = null;
    syncInspector();
  }
}

function clampLogoInBounds(logo) {
  logo.x = clamp(logo.x, 0, Math.max(0, width - logo.w));
  logo.y = clamp(logo.y, state.topInset, Math.max(state.topInset, height - logo.h));
}

function refreshAllDrones() {
  for (const logo of logos) {
    logo.droneActive = logoCanDrone(logo, logos);
    audio.syncDrone(logo);
  }
}

function randomSeedFromLogo(fromLogo) {
  if (fromLogo) {
    return {
      hue: randomBetween(0, 360),
      glow: fromLogo.glow,
      trail: fromLogo.trail,
      soundEnabled: fromLogo.soundEnabled,
      wave: fromLogo.wave,
      reverbSend: fromLogo.reverbSend,
      delayMix: fromLogo.delayMix,
      delayTime: fromLogo.delayTime,
      trailLength: fromLogo.trailLength,
      droneEnabled: fromLogo.droneEnabled,
      droneFreq: fromLogo.droneFreq,
      droneVolume: fromLogo.droneVolume,
    };
  }

  return {
    hue: randomBetween(0, 360),
    glow: 0,
    trail: 'off',
    soundEnabled: true,
    wave: WAVE_TYPES[Math.floor(randomBetween(0, WAVE_TYPES.length))],
    reverbSend: randomBetween(0.12, 0.48),
    delayMix: randomBetween(0.06, 0.34),
    delayTime: randomBetween(0.18, 0.55),
    trailLength: 16,
    droneEnabled: false,
    droneFreq: randomBetween(60, 360),
    droneVolume: randomBetween(0.1, 0.5),
  };
}

function createLogoData(seed, spatial = null) {
  const aspect = getLogoAspectRatio();
  const id = ++logoCounter;
  const name = cleanLogoName(seed.name ?? spatial?.name, makeLogoName(id));
  const parsedW = Number(spatial?.w);
  const w = Number.isFinite(parsedW) ? clamp(parsedW, 48, 320) : randomBetween(180, 220);

  const parsedH = Number(spatial?.h);
  const h = Number.isFinite(parsedH) ? clamp(parsedH, 24, 160) : w / aspect;

  const parsedVx = Number(spatial?.vx);
  const parsedVy = Number(spatial?.vy);
  const hasVelocity = Number.isFinite(parsedVx) && Number.isFinite(parsedVy);

  const speed = Number.isFinite(Number(spatial?.speed))
    ? clamp(Number(spatial?.speed), CONFIG.minSpeed, CONFIG.maxSpeed)
    : randomBetween(70, 100);
  const angle = Number.isFinite(Number(spatial?.angle))
    ? Number(spatial?.angle)
    : randomBetween(0, Math.PI * 2);
  const vx = hasVelocity ? parsedVx : Math.cos(angle) * speed;
  const vy = hasVelocity ? parsedVy : Math.sin(angle) * speed;

  const parsedX = Number(spatial?.x);
  const parsedY = Number(spatial?.y);
  const x = Number.isFinite(parsedX) ? parsedX : randomBetween(0, Math.max(1, width - w));
  const y = Number.isFinite(parsedY)
    ? parsedY
    : randomBetween(state.topInset, Math.max(state.topInset + 1, height - h));

  return new Logo({
    id,
    x,
    y,
    vx,
    vy,
    w,
    h,
    hue: seed.hue,
    glow: seed.glow,
    trail: seed.trail,
    soundEnabled: seed.soundEnabled,
    wave: seed.wave,
    reverbSend: seed.reverbSend,
    delayMix: seed.delayMix,
    delayTime: seed.delayTime,
    trailLength: seed.trailLength,
    droneEnabled: seed.droneEnabled,
    droneFreq: seed.droneFreq,
    droneVolume: seed.droneVolume,
    name,
    muted: Boolean(seed.muted ?? spatial?.muted),
    solo: Boolean(seed.solo ?? spatial?.solo),
    locked: Boolean(seed.locked ?? spatial?.locked),
  });
}

function addLogo(fromSelected = true) {
  if (logos.length >= CONFIG.maxLogos) {
    return;
  }
  const selected = fromSelected ? getSelectedLogo() : null;
  const seed = randomSeedFromLogo(selected);
  const logo = createLogoData(seed);
  logos.push(logo);
  selectLogo(logo.id);
  audio.syncDrone(logo);
  syncGlobalControls();
}

function addLogoFromSerialized(data, shouldSelect = false) {
  if (logos.length >= CONFIG.maxLogos) {
    return;
  }

  const seed = {
    hue: clamp(Number(data.hue) || 0, 0, 360),
    glow: clamp(Number(data.glow) || 0.5, 0, 1),
    trail: TRAIL_MODES.includes(data.trail) ? data.trail : 'ghost',
    soundEnabled: data.soundEnabled !== false,
    wave: WAVE_TYPES.includes(data.wave) ? data.wave : 'sine',
    reverbSend: clamp(Number(data.reverbSend) || 0, 0, 1),
    delayMix: clamp(Number(data.delayMix ?? data.delaySend) || 0, 0, 1),
    delayTime: clamp(Number(data.delayTime ?? 0.26), 0.02, 2.4),
    trailLength: clamp(Number(data.trailLength ?? (data.trail === 'line' ? 52 : 16)), 2, 200),
    droneEnabled: Boolean(data.droneEnabled),
    droneFreq: clamp(Number(data.droneFreq) || 220, 40, 1200),
    droneVolume: clamp(Number(data.droneVolume) || 0.2, 0, 1),
    name: data.name,
    muted: Boolean(data.muted),
    solo: Boolean(data.solo),
    locked: Boolean(data.locked),
  };

  const logo = createLogoData(seed, data);
  clampLogoInBounds(logo);
  logos.push(logo);
  audio.syncDrone(logo);

  if (shouldSelect) {
    selectLogo(logo.id);
  }
  syncGlobalControls();
}

function removeLogo() {
  if (logos.length <= CONFIG.minLogos) {
    return;
  }

  const selected = getSelectedLogo();
  let removed = null;

  if (selected) {
    const index = logos.findIndex((logo) => logo.id === selected.id);
    if (index >= 0) {
      removed = logos.splice(index, 1)[0];
    }
  } else {
    removed = logos.pop();
  }

  if (removed) {
    audio.removeLogo(removed.id);
  }

  if (logos.length === 0) {
    selectedLogoId = null;
    syncInspector();
    syncGlobalControls();
    return;
  }

  selectLogo(logos[logos.length - 1].id);
  syncGlobalControls();
}

function removeLogoById(id) {
  if (logos.length <= CONFIG.minLogos) {
    return;
  }

  const index = logos.findIndex((logo) => logo.id === id);
  if (index < 0) {
    return;
  }

  const [removed] = logos.splice(index, 1);
  audio.removeLogo(removed.id);

  if (selectedLogoId === removed.id) {
    selectedLogoId = logos[Math.min(index, logos.length - 1)]?.id ?? null;
  }

  if (selectedLogoId) {
    selectLogo(selectedLogoId);
  } else {
    syncInspector();
  }
  syncGlobalControls();
}

function clearScene() {
  for (const logo of logos) {
    audio.removeLogo(logo.id);
  }
  logos.length = 0;
  logoCounter = 0;
  selectedLogoId = null;
  stars.length = 0;
  starCounter = 0;
  selectedStarId = null;
  dragStarId = null;
  cornerStarIds.length = 0;
  if (cornersModeActive) {
    cornersModeActive = false;
    cornersModeBtn.classList.remove('active');
    cornersModeBtn.setAttribute('aria-pressed', 'false');
  }
  cornersModePrevCollisions = null;
  syncGlobalControls();
}

function getSelectedLogo() {
  return logos.find((logo) => logo.id === selectedLogoId) || null;
}

function selectLogo(id) {
  selectedLogoId = id;
  selectedStarId = null;
  syncInspector();
  renderChannelList();
}

function syncInspector() {
  const logo = getSelectedLogo();
  const star = getSelectedStar();

  if (star) {
    controlsEl.classList.add('hidden');
    starControlsEl.classList.remove('hidden');
    selectedChannelLabel.textContent = `Star #${String(star.id).padStart(2, '0')}`;
    starForceInput.value = String(Math.round(star.force));
    starForceReadout.textContent = formatForce(star.force);
    starRadiusInput.value = String(Math.round(star.radius));
    starDisplayInput.value = star.display || 'full';
    return;
  }

  if (!logo) {
    controlsEl.classList.add('hidden');
    starControlsEl.classList.add('hidden');
    selectedChannelLabel.textContent = 'Nothing selected';
    return;
  }

  starControlsEl.classList.add('hidden');
  controlsEl.classList.remove('hidden');
  selectedChannelLabel.textContent = logo.name;

  speedInput.value = String(Math.round(logo.speed));
  trailInput.value = logo.trail;
  trailLengthInput.value = String(Math.round(logo.trailLength));
  soundEnabledInput.checked = logo.soundEnabled;
  waveInput.value = logo.wave;
  reverbSendInput.value = String(logo.reverbSend);
  delayMixInput.value = String(logo.delayMix);
  delayTimeInput.value = String(logo.delayTime);
  droneEnabledInput.checked = logo.droneEnabled;
  droneFreqInput.value = String(Math.round(logo.droneFreq));
  droneVolumeInput.value = String(logo.droneVolume);
  droneWaveInput.value = logo.droneWave;
  droneFilterTypeInput.value = logo.droneFilterType;
  droneFilterCutoffInput.value = String(Math.round(logo.droneFilterCutoff));
  droneFilterQInput.value = String(logo.droneFilterQ);
  droneLfoRateInput.value = String(logo.droneLfoRate);
  droneLfoDepthInput.value = String(logo.droneLfoDepth);
}

function syncGlobalControls() {
  collisionsInput.checked = state.collisionsEnabled;
  masterGainInput.value = String(state.masterGain);
  logoCountReadout.textContent = logos.length > 0 ? `${logos.length}` : '';
  channelCountLabel.textContent = `${logos.length}/${CONFIG.maxLogos}`;
  fpsReadout.textContent = logos.length > 0 ? `${Math.round(state.fps)}fps` : '';
  renderChannelList();
}

function renderChannelList() {
  if (!channelList) {
    return;
  }

  channelList.replaceChildren();

  for (const logo of logos) {
    const row = document.createElement('div');
    row.className = 'channel-row';
    row.classList.toggle('selected', logo.id === selectedLogoId);

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'channel-main';
    main.dataset.action = 'select';
    main.dataset.id = String(logo.id);

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = `hsl(${logo.hue}, 92%, 58%)`;

    const label = document.createElement('span');
    label.textContent = logo.name;

    main.append(swatch, label);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini-btn warn';
    del.dataset.action = 'delete';
    del.dataset.id = String(logo.id);
    del.textContent = 'X';

    row.append(main, del);
    channelList.append(row);
  }
}

function applyPreset(name) {
  const presets = {
    solo: () => {
      state.sceneLabel = 'Solo TV';
      state.collisionsEnabled = false;
      state.performanceMode = false;
      state.masterGain = 0.76;
      state.reverbReturn = 0.04;
      state.delayReturn = 0.03;

      clearScene();

      addLogoFromSerialized({
        name: 'DVD-01',
        hue: 55,
        trail: 'off',
        soundEnabled: true,
        wave: 'sine',
        reverbSend: 0.04,
        delayMix: 0.02,
        droneEnabled: false,
        droneFreq: 180,
        droneVolume: 0.12,
        x: width * 0.2,
        y: height * 0.28,
        vx: 85,
        vy: 70,
      });
    },
    classic: () => {
      state.sceneLabel = 'Classic DVD';
      state.collisionsEnabled = false;
      state.performanceMode = false;
      state.masterGain = 0.8;
      state.reverbReturn = 0.1;
      state.delayReturn = 0.08;

      clearScene();

      const baseSeed = {
        trail: 'off',
        soundEnabled: true,
        wave: 'sine',
        reverbSend: 0.08,
        delayMix: 0.04,
        droneEnabled: false,
        droneFreq: 180,
        droneVolume: 0.2,
      };

      addLogoFromSerialized({
        ...baseSeed,
        hue: 45,
        x: width * 0.2,
        y: height * 0.25,
        vx: 90,
        vy: 75,
      });

      addLogoFromSerialized({
        ...baseSeed,
        hue: 198,
        x: width * 0.58,
        y: height * 0.52,
        vx: -80,
        vy: 70,
      });
    },
    neon: () => {
      state.sceneLabel = 'Neon Rain';
      state.collisionsEnabled = true;
      state.performanceMode = false;
      state.masterGain = 0.84;
      state.reverbReturn = 0.28;
      state.delayReturn = 0.22;

      clearScene();

      for (let i = 0; i < 9; i += 1) {
        const hue = (i * 37 + 20) % 360;
        addLogoFromSerialized({
          hue,
          trail: i % 2 === 0 ? 'line' : 'off',
          soundEnabled: true,
          wave: i % 3 === 0 ? 'sawtooth' : 'triangle',
          reverbSend: 0.35,
          delayMix: 0.21,
          droneEnabled: false,
          droneFreq: 120 + i * 30,
          droneVolume: 0.2,
          x: randomBetween(0, Math.max(1, width - 220)),
          y: randomBetween(0, Math.max(1, height - 140)),
          vx: randomBetween(-120, 120),
          vy: randomBetween(-120, 120),
        });
      }
    },
    drone: () => {
      state.sceneLabel = 'Drone Choir';
      state.collisionsEnabled = true;
      state.performanceMode = false;
      state.masterGain = 0.76;
      state.reverbReturn = 0.44;
      state.delayReturn = 0.24;

      clearScene();

      const freqs = [82.41, 110, 146.83, 196, 246.94, 329.63];
      for (let i = 0; i < freqs.length; i += 1) {
        addLogoFromSerialized({
          hue: (i * 52 + 150) % 360,
          trail: 'off',
          soundEnabled: true,
          wave: i % 2 === 0 ? 'triangle' : 'sine',
          reverbSend: 0.48,
          delayMix: 0.17,
          droneEnabled: true,
          droneFreq: freqs[i],
          droneVolume: 0.32,
          x: randomBetween(0, Math.max(1, width - 220)),
          y: randomBetween(0, Math.max(1, height - 140)),
          vx: randomBetween(-90, 90),
          vy: randomBetween(-90, 90),
        });
      }
    },
  };

  const presetFn = presets[name] || presets.solo;
  presetFn();

  applyGlobalAudioState();
  audio.setPerformanceMode(state.performanceMode);

  if (logos.length > 0) {
    selectLogo(logos[0].id);
  }

  syncGlobalControls();
  syncInspector();
}

function randomizeScene() {
  if (logos.length === 0) {
    for (let i = 0; i < 4; i += 1) {
      addLogo(false);
    }
  }

  state.sceneLabel = 'Custom Random';

  for (const logo of logos) {
    logo.hue = randomBetween(0, 360);
    logo.glow = randomBetween(0.35, 0.95);
    logo.trail = TRAIL_MODES[Math.floor(randomBetween(0, TRAIL_MODES.length))];
    logo.wave = WAVE_TYPES[Math.floor(randomBetween(0, WAVE_TYPES.length))];
    logo.reverbSend = randomBetween(0.06, 0.9);
    logo.delayMix = randomBetween(0.04, 0.7);
    logo.delayTime = randomBetween(0.1, 1.2);
    logo.trailLength = Math.round(randomBetween(8, 120));
    logo.droneEnabled = Math.random() > 0.55;
    logo.droneFreq = randomBetween(55, 500);
    logo.droneVolume = randomBetween(0.05, 0.45);
    logo.setSpeed(randomBetween(120, 520));
    audio.syncLogoChannel(logo);
    audio.syncDrone(logo);
  }

  state.masterGain = randomBetween(0.65, 0.92);
  state.reverbReturn = randomBetween(0.08, 0.52);
  state.delayReturn = randomBetween(0.05, 0.36);
  applyGlobalAudioState();

  syncGlobalControls();
  syncInspector();
}

function applyGlobalAudioState() {
  audio.setMasterGain(state.masterGain);
  audio.setFxReturnLevels(state.reverbReturn, state.delayReturn);
}

function serializeScene() {
  return {
    version: 1,
    name: state.sceneLabel,
    exportedAt: new Date().toISOString(),
    global: {
      collisionsEnabled: state.collisionsEnabled,
      performanceMode: state.performanceMode,
      masterGain: state.masterGain,
      reverbReturn: state.reverbReturn,
      delayReturn: state.delayReturn,
    },
    logos: logos.map((logo) => logo.serialize()),
    stars: stars.map((s) => ({
      x: s.x,
      y: s.y,
      force: s.force,
      radius: s.radius,
      display: s.display || 'full',
    })),
  };
}

function saveSceneToFile() {
  const scene = serializeScene();
  const payload = JSON.stringify(scene, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dvdlogosynth-scene-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function loadSceneFromObject(scene) {
  if (!scene || typeof scene !== 'object' || !Array.isArray(scene.logos)) {
    throw new Error('Formato invalido.');
  }

  clearScene();

  const global = scene.global || {};
  state.sceneLabel = typeof scene.name === 'string' ? scene.name : 'Custom';
  state.collisionsEnabled =
    typeof global.collisionsEnabled === 'boolean' ? global.collisionsEnabled : true;
  state.performanceMode =
    typeof global.performanceMode === 'boolean' ? global.performanceMode : false;

  const parsedMaster = Number(global.masterGain);
  const parsedReverb = Number(global.reverbReturn);
  const parsedDelay = Number(global.delayReturn);
  state.masterGain = Number.isFinite(parsedMaster)
    ? clamp(parsedMaster, 0, 1.2)
    : CONFIG.defaultMasterGain;
  state.reverbReturn = Number.isFinite(parsedReverb)
    ? clamp(parsedReverb, 0, 1)
    : CONFIG.defaultReverbReturn;
  state.delayReturn = Number.isFinite(parsedDelay)
    ? clamp(parsedDelay, 0, 1)
    : CONFIG.defaultDelayReturn;

  for (const logoData of scene.logos.slice(0, CONFIG.maxLogos)) {
    addLogoFromSerialized(logoData);
  }

  if (Array.isArray(scene.stars)) {
    for (const s of scene.stars.slice(0, STAR_MAX)) {
      const sx = Number(s?.x);
      const sy = Number(s?.y);
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        const rawForce = Number(s?.force);
        const legacyMass = Number(s?.mass);
        const force = Number.isFinite(rawForce)
          ? clamp(rawForce, -100, 100)
          : Number.isFinite(legacyMass)
            ? clamp(legacyMass / 11000, -100, 100)
            : STAR_DEFAULT_FORCE;
        stars.push({
          id: ++starCounter,
          x: clamp(sx, 0, width),
          y: clamp(sy, 0, height),
          force,
          radius: clamp(Number(s?.radius) || STAR_DEFAULT_RADIUS, 50, 1500),
          display: STAR_DISPLAY_MODES.includes(s?.display) ? s.display : 'full',
        });
      }
    }
  }

  applyGlobalAudioState();
  audio.setPerformanceMode(state.performanceMode);

  if (logos.length > 0) {
    selectLogo(logos[0].id);
  }

  syncGlobalControls();
  syncInspector();
}

function updatePerformanceMetrics(dt) {
  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  const instantaneousFps = 1 / dt;
  state.fps = state.fps * 0.92 + instantaneousFps * 0.08;

  let targetQuality = 1;
  if (state.performanceMode) {
    if (state.fps < 42) {
      targetQuality = 0.25;
    } else if (state.fps < 50) {
      targetQuality = 0.45;
    } else if (state.fps < 56) {
      targetQuality = 0.7;
    }
  }

  state.trailQuality += (targetQuality - state.trailQuality) * 0.08;
  state.trailQuality = clamp(state.trailQuality, 0.2, 1);

  state.fpsReadoutAccumulator += dt;
  if (state.fpsReadoutAccumulator >= 0.18) {
    state.fpsReadoutAccumulator = 0;
    fpsReadout.textContent = logos.length > 0 ? `${Math.round(state.fps)}fps` : '';
  }
}

let lastTime = performance.now();

function animate(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  updatePerformanceMetrics(dt);
  updatePhysics(dt, { logos, stars, width, height, state, audio });

  for (const logo of logos) {
    logo.droneActive = logoCanDrone(logo, logos);
    audio.syncDrone(logo);
  }

  drawFrame(logos, stars, selectedStarId);
  requestAnimationFrame(animate);
}

function bindUI() {
  addBtn.addEventListener('click', async () => {
    await audio.boot();
    const before = logos.length;
    addLogo(true);
    if (logos.length > before) audio.playAddPing();
  });

  removeBtn.addEventListener('click', async () => {
    await audio.boot();
    const before = logos.length;
    removeLogo();
    if (logos.length < before) audio.playRemoveBlip();
  });

  addStarBtn.addEventListener('click', async () => {
    await audio.boot();
    if (addStar()) audio.playAddPing();
  });

  removeStarBtn.addEventListener('click', async () => {
    await audio.boot();
    if (removeStar()) audio.playRemoveBlip();
  });

  cornersModeBtn.addEventListener('click', async () => {
    await audio.boot();
    const wasActive = cornersModeActive;
    const changed = wasActive ? disableCornersMode() : enableCornersMode();
    if (!changed) return;
    if (wasActive) {
      audio.playRemoveBlip();
    } else {
      audio.playAddPing();
    }
    state.sceneLabel = 'Custom';
    syncGlobalControls();
  });

  starForceInput.addEventListener('input', () => {
    const star = getSelectedStar();
    if (!star) return;
    star.force = Number(starForceInput.value);
    starForceReadout.textContent = formatForce(star.force);
    state.sceneLabel = 'Custom';
  });

  starRadiusInput.addEventListener('input', () => {
    const star = getSelectedStar();
    if (!star) return;
    star.radius = Number(starRadiusInput.value);
    state.sceneLabel = 'Custom';
  });

  starDisplayInput.addEventListener('change', () => {
    const star = getSelectedStar();
    if (!star) return;
    star.display = STAR_DISPLAY_MODES.includes(starDisplayInput.value)
      ? starDisplayInput.value
      : 'full';
    state.sceneLabel = 'Custom';
  });

  deleteStarBtn.addEventListener('click', async () => {
    const star = getSelectedStar();
    if (!star) return;
    await audio.boot();
    deleteStar(star.id);
    audio.playRemoveBlip();
  });

  configBtn.addEventListener('click', () => {
    inspector.classList.toggle('open');
  });

  sidebarCloseBtn.addEventListener('click', () => {
    inspector.classList.remove('open');
  });

  helpBtn.addEventListener('click', () => {
    helpDialog.showModal();
  });

  closeHelpBtn.addEventListener('click', () => {
    helpDialog.close();
  });

  helpDialog.addEventListener('click', (event) => {
    const rect = helpDialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (clickedOutside) {
      helpDialog.close();
    }
  });

  applyPresetBtn.addEventListener('click', async () => {
    await audio.boot();
    applyPreset(presetSelect.value);
  });

  randomizeBtn.addEventListener('click', async () => {
    await audio.boot();
    randomizeScene();
  });

  saveSceneBtn.addEventListener('click', () => {
    saveSceneToFile();
  });

  loadSceneBtn.addEventListener('click', () => {
    loadSceneInput.click();
  });

  loadSceneInput.addEventListener('change', async () => {
    const file = loadSceneInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await audio.boot();
      loadSceneFromObject(parsed);
    } catch (error) {
      console.error(error);
      window.alert('No se pudo cargar el JSON de escena.');
    } finally {
      loadSceneInput.value = '';
    }
  });

  channelList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const id = Number(button.dataset.id);
    const logo = logos.find((candidate) => candidate.id === id);
    if (!logo) {
      return;
    }

    await audio.boot();

    if (button.dataset.action === 'select') {
      selectLogo(id);
    }
    if (button.dataset.action === 'mute') {
      logo.muted = !logo.muted;
      refreshAllDrones();
    }
    if (button.dataset.action === 'solo') {
      logo.solo = !logo.solo;
      refreshAllDrones();
    }
    if (button.dataset.action === 'lock') {
      logo.locked = !logo.locked;
    }
    if (button.dataset.action === 'delete') {
      const before = logos.length;
      removeLogoById(id);
      if (logos.length < before) audio.playRemoveBlip();
    }

    state.sceneLabel = 'Custom';
    syncInspector();
    syncGlobalControls();
  });

  collisionsInput.addEventListener('change', () => {
    state.collisionsEnabled = collisionsInput.checked;
    state.sceneLabel = 'Custom';
    syncGlobalControls();
  });

  masterGainInput.addEventListener('input', async () => {
    state.masterGain = Number(masterGainInput.value);
    await audio.boot();
    audio.setMasterGain(state.masterGain);
    state.sceneLabel = 'Custom';
  });

  const canvasToScene = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (width / rect.width),
      y: (event.clientY - rect.top) * (height / rect.height),
    };
  };

  canvas.addEventListener('pointerdown', async (event) => {
    await audio.boot();
    const { x: px, y: py } = canvasToScene(event);

    let starHit = null;
    let starHitDist2 = 24 * 24;
    for (let i = stars.length - 1; i >= 0; i -= 1) {
      const s = stars[i];
      if ((s.display || 'full') === 'off') continue;
      const dx = px - s.x;
      const dy = py - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < starHitDist2) {
        starHitDist2 = d2;
        starHit = s;
      }
    }

    if (starHit) {
      dragStarId = starHit.id;
      dragOffset.x = px - starHit.x;
      dragOffset.y = py - starHit.y;
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      selectStar(starHit.id);
      inspector.classList.add('open');
      return;
    }

    let logoHit = null;
    for (let i = logos.length - 1; i >= 0; i -= 1) {
      const logo = logos[i];
      if (px >= logo.x && px <= logo.x + logo.w && py >= logo.y && py <= logo.y + logo.h) {
        logoHit = logo;
        break;
      }
    }
    if (logoHit) {
      selectLogo(logoHit.id);
      inspector.classList.add('open');
    } else {
      selectedLogoId = null;
      selectedStarId = null;
      syncInspector();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (dragStarId == null) return;
    const star = stars.find((s) => s.id === dragStarId);
    if (!star) return;
    const { x: px, y: py } = canvasToScene(event);
    star.x = clamp(px - dragOffset.x, 0, width);
    star.y = clamp(py - dragOffset.y, 0, height);
  });

  const endDrag = (event) => {
    if (dragStarId == null) return;
    dragStarId = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const applyToSelected = (applyFn) => {
    const logo = getSelectedLogo();
    if (!logo) {
      return;
    }
    applyFn(logo);
    audio.syncDrone(logo);
    state.sceneLabel = 'Custom';
    renderChannelList();
    syncGlobalControls();
  };

  speedInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.setSpeed(Number(speedInput.value));
    });
  });

  trailInput.addEventListener('change', () => {
    applyToSelected((logo) => {
      logo.trail = trailInput.value;
    });
  });

  soundEnabledInput.addEventListener('change', () => {
    applyToSelected((logo) => {
      logo.soundEnabled = soundEnabledInput.checked;
    });
  });

  waveInput.addEventListener('change', () => {
    applyToSelected((logo) => {
      logo.wave = waveInput.value;
    });
  });

  reverbSendInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.reverbSend = Number(reverbSendInput.value);
    });
  });

  delayMixInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.delayMix = Number(delayMixInput.value);
      audio.syncLogoChannel(logo);
    });
  });

  delayTimeInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.delayTime = Number(delayTimeInput.value);
      audio.syncLogoChannel(logo);
    });
  });

  trailLengthInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.trailLength = Number(trailLengthInput.value);
    });
  });

  droneEnabledInput.addEventListener('change', () => {
    applyToSelected((logo) => {
      logo.droneEnabled = droneEnabledInput.checked;
    });
  });

  droneFreqInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.droneFreq = Number(droneFreqInput.value);
    });
  });

  droneVolumeInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.droneVolume = Number(droneVolumeInput.value);
    });
  });

  droneWaveInput.addEventListener('change', () => {
    applyToSelected((logo) => {
      logo.droneWave = droneWaveInput.value;
      audio.removeLogo(logo.id);
      audio.syncDrone(logo);
    });
  });

  droneFilterTypeInput.addEventListener('change', () => {
    applyToSelected((logo) => {
      logo.droneFilterType = droneFilterTypeInput.value;
    });
  });

  droneFilterCutoffInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.droneFilterCutoff = Number(droneFilterCutoffInput.value);
    });
  });

  droneFilterQInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.droneFilterQ = Number(droneFilterQInput.value);
    });
  });

  droneLfoRateInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.droneLfoRate = Number(droneLfoRateInput.value);
    });
  });

  droneLfoDepthInput.addEventListener('input', () => {
    applyToSelected((logo) => {
      logo.droneLfoDepth = Number(droneLfoDepthInput.value);
    });
  });

  window.addEventListener('keydown', async (event) => {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      await audio.boot();
      const before = logos.length;
      addLogo(true);
      if (logos.length > before) audio.playAddPing();
    }

    if (event.key === '-') {
      event.preventDefault();
      await audio.boot();
      const before = logos.length;
      removeLogo();
      if (logos.length < before) audio.playRemoveBlip();
    }

    if (event.key === '?') {
      event.preventDefault();
      helpDialog.showModal();
    }

    if (event.key.toLowerCase() === 'p') {
      state.performanceMode = !state.performanceMode;
      audio.setPerformanceMode(state.performanceMode);
      state.sceneLabel = 'Custom';
      syncGlobalControls();
    }

    if (event.key.toLowerCase() === 'c') {
      state.collisionsEnabled = !state.collisionsEnabled;
      collisionsInput.checked = state.collisionsEnabled;
      state.sceneLabel = 'Custom';
      syncGlobalControls();
    }

    if (event.key.toLowerCase() === 'r') {
      await audio.boot();
      randomizeScene();
    }
  });
}

function shutdownAudio() {
  try {
    audio.stopAllDrones();
  } catch (_) { /* noop */ }
  try {
    if (audio.ctx && audio.ctx.state !== 'closed') {
      audio.ctx.close();
    }
  } catch (_) { /* noop */ }
}

function spawnInitialLogo() {
  addLogo(false);
  selectedLogoId = null;
  syncGlobalControls();
  syncInspector();
}

function init() {
  handleResize();
  window.addEventListener('resize', handleResize);

  bindUI();

  syncGlobalControls();
  spawnInitialLogo();

  window.addEventListener('pagehide', shutdownAudio);
  window.addEventListener('beforeunload', shutdownAudio);

  requestAnimationFrame(animate);
}

init();
