export const LOGO_IMAGE_PATH = 'dvdlogo.png';

export const TRAIL_MODES = ['off', 'ghost', 'line', 'line-only'];

export const STAR_DEFAULT_FORCE = 50;
export const STAR_FORCE_SCALE = 30000;
export const STAR_DEFAULT_RADIUS = 350;
export const STAR_MAX = 16;
export const STAR_DISPLAY_MODES = ['full', 'star', 'off'];
export const STAR_DEFAULT_DISPLAY = 'full';

export const WAVE_TYPES = ['sine', 'triangle', 'sawtooth', 'square'];

// ─── DEFAULTS DEL LOGO ──────────────────────────────────────────────────────
// Valores iniciales que se aplican a cada logo nuevo (el del splash y los
// agregados con el boton +). Editar estos numeros cambia el "punto de partida"
// de la app — los rangos del slider en el sidebar siguen siendo libres, esto
// es solo el default. Reverb/delay quedan bajos a proposito asi el sonido
// arranca seco y el usuario los sube cuando quiere.
export const LOGO_DEFAULTS = {
  reverbSend: 0.05, // 0..1 — send al bus de reverb (5% por default)
  delayMix:   0.05, // 0..1 — send al delay per-logo (5% por default)
  delayTime:  0.25, // segundos — tiempo del delay (~25% del rango 0.02..1)
};

export const CONFIG = {
  dprLimit: 2,
  maxLogos: 64,
  minLogos: 0,
  minSpeed: 60,
  maxSpeed: 720,
  defaultMasterGain: 0.75,
  defaultReverbReturn: 0.7,
  defaultDelayReturn: 0.18,
};
