import { clamp } from './utils.js';
import { CONFIG } from './config.js';

export class Logo {
  constructor(opts) {
    this.id = opts.id;
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.w = opts.w;
    this.h = opts.h;
    this.hue = opts.hue;
    this.glow = opts.glow;
    this.trail = opts.trail;
    this.soundEnabled = opts.soundEnabled;
    this.wave = opts.wave;
    this.reverbSend = opts.reverbSend;
    this.delayMix = opts.delayMix ?? opts.delaySend ?? 0;
    this.delayTime = opts.delayTime ?? 0.26;
    this.trailLength = opts.trailLength ?? (opts.trail === 'line' ? 52 : 16);
    this.droneEnabled = opts.droneEnabled;
    this.droneFreq = opts.droneFreq;
    this.droneVolume = opts.droneVolume;
    this.droneWave = opts.droneWave || 'sawtooth';
    this.droneFilterType = opts.droneFilterType || 'lowpass';
    this.droneFilterCutoff = opts.droneFilterCutoff ?? 800;
    this.droneFilterQ = opts.droneFilterQ ?? 0.72;
    this.droneLfoRate = opts.droneLfoRate ?? 0.19;
    this.droneLfoDepth = opts.droneLfoDepth ?? 0.3;
    this.name = opts.name;
    this.muted = opts.muted;
    this.solo = opts.solo;
    this.locked = opts.locked;
    this.droneActive = true;
    this.history = [];
    this.hitCooldown = 0;
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  setSpeed(nextSpeed) {
    const safeSpeed = clamp(nextSpeed, CONFIG.minSpeed, CONFIG.maxSpeed);
    const angle = Math.atan2(this.vy, this.vx);
    this.vx = Math.cos(angle) * safeSpeed;
    this.vy = Math.sin(angle) * safeSpeed;
  }

  serialize() {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      w: this.w,
      h: this.h,
      hue: this.hue,
      glow: this.glow,
      trail: this.trail,
      soundEnabled: this.soundEnabled,
      wave: this.wave,
      reverbSend: this.reverbSend,
      delayMix: this.delayMix,
      delayTime: this.delayTime,
      trailLength: this.trailLength,
      droneEnabled: this.droneEnabled,
      droneFreq: this.droneFreq,
      droneVolume: this.droneVolume,
      droneWave: this.droneWave,
      droneFilterType: this.droneFilterType,
      droneFilterCutoff: this.droneFilterCutoff,
      droneFilterQ: this.droneFilterQ,
      droneLfoRate: this.droneLfoRate,
      droneLfoDepth: this.droneLfoDepth,
      name: this.name,
      muted: this.muted,
      solo: this.solo,
      locked: this.locked,
    };
  }
}

export function makeLogoName(index) {
  return `DVD-${String(index).padStart(2, '0')}`;
}

export function cleanLogoName(name, fallback) {
  if (typeof name !== 'string') {
    return fallback;
  }
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 18);
  return normalized || fallback;
}

export function getSoloActive(logos) {
  return logos.some((logo) => logo.solo);
}

export function logoCanSound(logo, logos) {
  return logo.soundEnabled && !logo.muted && (!getSoloActive(logos) || logo.solo);
}

export function logoCanDrone(logo, logos) {
  return logo.droneEnabled && !logo.muted && (!getSoloActive(logos) || logo.solo);
}
