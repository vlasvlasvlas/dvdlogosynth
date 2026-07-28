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
// de la app. Reverb/delay quedan bajos y limitados para que no haya saltos
// de volumen por logo durante performance en vivo.
export const LOGO_DEFAULTS = {
  reverbSend: 0.04,
  delayMix:   0.03,
  delayTime:  0.25, // segundos — tiempo del delay (~25% del rango 0.02..1)
};

export const AUDIO_LIMITS = {
  masterGainMax: 1,
  masterOutputTrim: 0.82,
  reverbReturnMax: 0.42,
  delayReturnMax: 0.28,
  logoReverbSendMax: 0.18,
  logoDelayMixMax: 0.14,
  logoDelayTimeMax: 1.2,
  logoDelayFeedbackMax: 0.5,
};

export const CONFIG = {
  dprLimit: 2,
  maxLogos: 64,
  minLogos: 0,
  minSpeed: 60,
  maxSpeed: 720,
  defaultMasterGain: 0.75,
  defaultReverbReturn: 0.28,
  defaultDelayReturn: 0.12,
};
