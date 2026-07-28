import { clamp } from './utils.js';
import { AUDIO_LIMITS, CONFIG, LOGO_DEFAULTS } from './config.js';

function waveformTrim(type) {
  if (type === 'square') return 0.62;
  if (type === 'sawtooth') return 0.68;
  if (type === 'triangle') return 0.86;
  return 1;
}

export function makeDriveCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = typeof amount === 'number' ? amount : 80;

  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }

  return curve;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;

    this.master = null;
    this.monoOutput = null;
    this.comp = null;
    this.limiter = null;

    this.dryBus = null;
    this.reverbSendBus = null;
    this.reverbReturnBus = null;
    this.delaySendBus = null;
    this.delayReturnBus = null;

    this.delayNode = null;
    this.delayFeedback = null;
    this.delayFilter = null;
    this.convolver = null;
    this.driveCurve = null;

    this.masterTarget = CONFIG.defaultMasterGain;
    this.reverbReturnTarget = CONFIG.defaultReverbReturn;
    this.delayReturnTarget = CONFIG.defaultDelayReturn;
    this.performanceModeTarget = false;

    this.droneVoices = new Map();
    this.logoChannels = new Map();

    this.voiceBudgetCount = 0;
    this.voiceBudgetWindow = 0;
    this.maxOneShotsPerSecond = 170;
  }

  async boot() {
    if (!this.initialized) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterTarget * AUDIO_LIMITS.masterOutputTrim;

      this.monoOutput = this.ctx.createGain();
      this.monoOutput.channelCount = 1;
      this.monoOutput.channelCountMode = 'explicit';
      this.monoOutput.channelInterpretation = 'speakers';

      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -20;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 5.5;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.14;

      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -4;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.08;

      this.dryBus = this.ctx.createGain();
      this.dryBus.gain.value = 1;

      this.reverbSendBus = this.ctx.createGain();
      this.reverbSendBus.gain.value = 1;
      this.reverbReturnBus = this.ctx.createGain();
      this.reverbReturnBus.gain.value = this.reverbReturnTarget;

      this.delaySendBus = this.ctx.createGain();
      this.delaySendBus.gain.value = 1;
      this.delayReturnBus = this.ctx.createGain();
      this.delayReturnBus.gain.value = this.delayReturnTarget;

      this.delayNode = this.ctx.createDelay(1.2);
      this.delayNode.delayTime.value = 0.26;

      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.34;

      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = 'lowpass';
      this.delayFilter.frequency.value = 4700;

      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = this._buildImpulse(4.5, 1.6);
      this.driveCurve = makeDriveCurve(240);

      this.dryBus.connect(this.comp);

      this.reverbSendBus.connect(this.convolver);
      this.convolver.connect(this.reverbReturnBus);
      this.reverbReturnBus.connect(this.comp);

      this.delaySendBus.connect(this.delayNode);
      this.delayNode.connect(this.delayReturnBus);
      this.delayReturnBus.connect(this.comp);

      this.delayNode.connect(this.delayFilter);
      this.delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);

      this.comp.connect(this.limiter);
      this.limiter.connect(this.master);
      this.master.connect(this.monoOutput);
      this.monoOutput.connect(this.ctx.destination);

      this.initialized = true;
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.setMasterGain(this.masterTarget);
    this.setFxReturnLevels(this.reverbReturnTarget, this.delayReturnTarget);
    this.setPerformanceMode(this.performanceModeTarget);
  }

  _buildImpulse(seconds, decay) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const impulse = this.ctx.createBuffer(1, length, this.ctx.sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }

    return impulse;
  }

  _smoothParam(param, target, timeConstant = 0.06) {
    const now = this.ctx.currentTime;
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    param.setTargetAtTime(target, now, timeConstant);
  }

  _normalizeLogoFx(opts = {}) {
    return {
      reverbSend: clamp(
        Number(opts.reverbSend ?? LOGO_DEFAULTS.reverbSend),
        0,
        AUDIO_LIMITS.logoReverbSendMax,
      ),
      delayMix: clamp(
        Number(opts.delayMix ?? LOGO_DEFAULTS.delayMix),
        0,
        AUDIO_LIMITS.logoDelayMixMax,
      ),
    };
  }

  _connectVoice(voiceGain, opts, logoId) {
    const fx = this._normalizeLogoFx(opts);
    const dry = this.ctx.createGain();
    dry.gain.value = Math.max(0.78, 0.98 - (fx.reverbSend * 0.5 + fx.delayMix * 0.4));

    const toReverb = this.ctx.createGain();
    toReverb.gain.value = fx.reverbSend * 0.75;

    const toDelay = this.ctx.createGain();
    toDelay.gain.value = fx.delayMix * 0.55;

    voiceGain.connect(dry);
    voiceGain.connect(toReverb);
    voiceGain.connect(toDelay);

    dry.connect(this.dryBus);
    toReverb.connect(this.reverbSendBus);

    const channel = logoId != null ? this._ensureLogoChannel(logoId) : null;
    if (channel) {
      toDelay.connect(channel.input);
    }

    return { dry, toReverb, toDelay };
  }

  _ensureLogoChannel(logoId) {
    if (!this.initialized || !this.ctx) {
      return null;
    }
    let ch = this.logoChannels.get(logoId);
    if (ch) {
      return ch;
    }

    const input = this.ctx.createGain();
    input.gain.value = 1;

    const delayNode = this.ctx.createDelay(2.5);
    delayNode.delayTime.value = 0.26;

    const feedback = this.ctx.createGain();
    feedback.gain.value = 0;

    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;

    const wet = this.ctx.createGain();
    wet.gain.value = 1;

    input.connect(delayNode);
    delayNode.connect(tone);
    tone.connect(feedback);
    feedback.connect(delayNode);
    tone.connect(wet);
    wet.connect(this.dryBus);

    ch = { input, delayNode, feedback, tone, wet };
    this.logoChannels.set(logoId, ch);
    return ch;
  }

  syncLogoChannel(logo) {
    const ch = this._ensureLogoChannel(logo.id);
    if (!ch) {
      return;
    }
    const now = this.ctx.currentTime;
    const time = clamp(logo.delayTime ?? LOGO_DEFAULTS.delayTime, 0.02, AUDIO_LIMITS.logoDelayTimeMax);
    const mix = clamp(logo.delayMix ?? LOGO_DEFAULTS.delayMix, 0, AUDIO_LIMITS.logoDelayMixMax);
    ch.delayNode.delayTime.setTargetAtTime(time, now, 0.08);
    ch.feedback.gain.setTargetAtTime(
      Math.min(AUDIO_LIMITS.logoDelayFeedbackMax, mix * 0.42),
      now,
      0.08,
    );
  }

  _withinVoiceBudget() {
    if (!this.ctx) {
      return false;
    }

    const now = this.ctx.currentTime;
    if (now - this.voiceBudgetWindow >= 1) {
      this.voiceBudgetWindow = now;
      this.voiceBudgetCount = 0;
    }

    if (this.voiceBudgetCount >= this.maxOneShotsPerSecond) {
      return false;
    }

    this.voiceBudgetCount += 1;
    return true;
  }

  setPerformanceMode(enabled) {
    this.performanceModeTarget = enabled;
    this.maxOneShotsPerSecond = enabled ? 90 : 170;
    if (!this.initialized || !this.ctx) {
      return;
    }

    this._smoothParam(this.delayFeedback.gain, enabled ? 0.22 : 0.28, 0.12);
    this._smoothParam(this.delayFilter.frequency, enabled ? 3600 : 4700, 0.12);
  }

  setMasterGain(value) {
    this.masterTarget = clamp(value, 0, AUDIO_LIMITS.masterGainMax);
    if (!this.initialized || !this.ctx) {
      return;
    }
    this._smoothParam(this.master.gain, this.masterTarget * AUDIO_LIMITS.masterOutputTrim, 0.07);
  }

  setFxReturnLevels(reverb, delay) {
    this.reverbReturnTarget = clamp(reverb, 0, AUDIO_LIMITS.reverbReturnMax);
    this.delayReturnTarget = clamp(delay, 0, AUDIO_LIMITS.delayReturnMax);
    if (!this.initialized || !this.ctx) {
      return;
    }
    this._smoothParam(this.reverbReturnBus.gain, this.reverbReturnTarget, 0.1);
    this._smoothParam(this.delayReturnBus.gain, this.delayReturnTarget, 0.1);
  }

  triggerBounce(logo, intensity = 0.65, kind = 'wall') {
    if (!this.initialized || !logo.soundEnabled || !this.ctx) {
      return;
    }
    if (!this._withinVoiceBudget()) {
      return;
    }

    const now = this.ctx.currentTime;
    const clampedIntensity = clamp(intensity, 0.06, 1);
    const base = kind === 'corner' ? 80 : kind === 'collision' ? 105 : 145;
    const freq = clamp(base + logo.hue * 1.4 + clampedIntensity * 300, 70, 3200);
    const duration = kind === 'corner' ? 0.55 : kind === 'collision' ? 0.23 : 0.15;
    const baseLevel = kind === 'corner'
      ? clamp(0.12 + clampedIntensity * 0.18, 0.1, 0.32)
      : clamp(0.06 + clampedIntensity * 0.13, 0.05, 0.24);
    const level = baseLevel * waveformTrim(logo.wave);

    const carrier = this.ctx.createOscillator();
    carrier.type = logo.wave;
    carrier.frequency.setValueAtTime(freq, now);

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * (kind === 'collision' ? 1.35 : 2.1), now);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.22 * clampedIntensity, now);
    modGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.9);

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(level, now + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq * 1.3;
    filter.Q.value = 0.8 + clampedIntensity * 2.2;

    const preDrive = this.ctx.createGain();
    preDrive.gain.value = 1 + clampedIntensity * 0.85;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.driveCurve;
    shaper.oversample = '2x';

    this.syncLogoChannel(logo);
    const aux = this._connectVoice(envelope, {
      reverbSend: logo.reverbSend,
      delayMix: logo.delayMix,
    }, logo.id);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    carrier.connect(filter);
    filter.connect(preDrive);
    preDrive.connect(shaper);
    shaper.connect(envelope);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + duration + 0.07);
    mod.stop(now + duration + 0.05);

    carrier.onended = () => {
      carrier.disconnect();
      mod.disconnect();
      modGain.disconnect();
      filter.disconnect();
      preDrive.disconnect();
      shaper.disconnect();
      envelope.disconnect();
      aux.dry.disconnect();
      aux.toReverb.disconnect();
      aux.toDelay.disconnect();
    };
  }

  playAddPing() {
    if (!this.initialized || !this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.11);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.dryBus);

    osc.start(now);
    osc.stop(now + 0.18);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  playRemoveBlip() {
    if (!this.initialized || !this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.dryBus);

    osc.start(now);
    osc.stop(now + 0.22);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  syncDrone(logo) {
    if (!this.initialized || !this.ctx) {
      return;
    }

    const existing = this.droneVoices.get(logo.id);
    if (existing) {
      this._stopDroneVoice(existing);
      this.droneVoices.delete(logo.id);
    }
  }

  removeLogo(logoId) {
    const voice = this.droneVoices.get(logoId);
    if (voice) {
      this._stopDroneVoice(voice);
      this.droneVoices.delete(logoId);
    }
    const ch = this.logoChannels.get(logoId);
    if (ch) {
      this.logoChannels.delete(logoId);
      const now = this.ctx.currentTime;
      ch.input.gain.setTargetAtTime(0, now, 0.08);
      ch.feedback.gain.setTargetAtTime(0, now, 0.08);
      const tailMs = Math.max(500, (ch.delayNode.delayTime.value || 0.26) * 8000);
      setTimeout(() => {
        ch.input.disconnect();
        ch.delayNode.disconnect();
        ch.feedback.disconnect();
        ch.tone.disconnect();
        ch.wet.disconnect();
      }, tailMs);
    }
  }

  stopAllDrones() {
    for (const [logoId, voice] of this.droneVoices.entries()) {
      this._stopDroneVoice(voice);
      this.droneVoices.delete(logoId);
    }
  }

  _stopDroneVoice(voice) {
    if (!this.ctx) {
      return;
    }

    const now = this.ctx.currentTime;
    voice.amp.gain.cancelScheduledValues(now);
    voice.amp.gain.setTargetAtTime(0.0001, now, 0.06);

    voice.oscA.stop(now + 0.22);
    voice.oscB.stop(now + 0.22);
    voice.lfo.stop(now + 0.2);

    voice.oscA.onended = () => {
      voice.oscA.disconnect();
      voice.oscB.disconnect();
      voice.lfo.disconnect();
      voice.lfoGain.disconnect();
      voice.filter.disconnect();
      voice.amp.disconnect();
      voice.aux.dry.disconnect();
      voice.aux.toReverb.disconnect();
      voice.aux.toDelay.disconnect();
    };
  }
}
