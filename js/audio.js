import { clamp } from './utils.js';
import { CONFIG } from './config.js';

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
      this.master.gain.value = this.masterTarget;

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
      this.convolver.buffer = this._buildImpulse(1.8, 2.4);
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
      this.master.connect(this.ctx.destination);

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
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }

    return impulse;
  }

  _connectVoice(voiceGain, opts) {
    const dry = this.ctx.createGain();
    dry.gain.value = Math.max(0, 1 - (opts.reverbSend + opts.delaySend) * 0.55);

    const toReverb = this.ctx.createGain();
    toReverb.gain.value = opts.reverbSend;

    const toDelay = this.ctx.createGain();
    toDelay.gain.value = opts.delaySend;

    voiceGain.connect(dry);
    voiceGain.connect(toReverb);
    voiceGain.connect(toDelay);

    dry.connect(this.dryBus);
    toReverb.connect(this.reverbSendBus);
    toDelay.connect(this.delaySendBus);

    return { dry, toReverb, toDelay };
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

    const now = this.ctx.currentTime;
    this.delayFeedback.gain.setTargetAtTime(enabled ? 0.26 : 0.34, now, 0.12);
    this.delayFilter.frequency.setTargetAtTime(enabled ? 3600 : 4700, now, 0.12);
  }

  setMasterGain(value) {
    this.masterTarget = clamp(value, 0, 1.2);
    if (!this.initialized || !this.ctx) {
      return;
    }
    this.master.gain.setTargetAtTime(this.masterTarget, this.ctx.currentTime, 0.05);
  }

  setFxReturnLevels(reverb, delay) {
    this.reverbReturnTarget = clamp(reverb, 0, 1);
    this.delayReturnTarget = clamp(delay, 0, 1);
    if (!this.initialized || !this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    this.reverbReturnBus.gain.setTargetAtTime(this.reverbReturnTarget, now, 0.08);
    this.delayReturnBus.gain.setTargetAtTime(this.delayReturnTarget, now, 0.08);
  }

  triggerBounce(logo, intensity = 0.65, kind = 'wall') {
    if (!this.initialized || !logo.soundEnabled || !this.ctx) {
      return;
    }
    if (!this._withinVoiceBudget()) {
      return;
    }

    const now = this.ctx.currentTime;
    const clampedIntensity = clamp(intensity, 0.06, 1.25);
    const base = kind === 'corner' ? 80 : kind === 'collision' ? 105 : 145;
    const freq = clamp(base + logo.hue * 1.4 + clampedIntensity * 300, 70, 3200);
    const duration = kind === 'corner' ? 0.55 : kind === 'collision' ? 0.23 : 0.15;
    const level = kind === 'corner'
      ? clamp(0.12 + clampedIntensity * 0.18, 0.1, 0.32)
      : clamp(0.06 + clampedIntensity * 0.13, 0.05, 0.24);

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

    const aux = this._connectVoice(envelope, {
      reverbSend: logo.reverbSend,
      delaySend: logo.delaySend,
    });

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
    const droneActive = logo.droneEnabled && logo.droneActive !== false;
    if (!droneActive) {
      if (existing) {
        this._stopDroneVoice(existing);
        this.droneVoices.delete(logo.id);
      }
      return;
    }

    if (!existing) {
      const now = this.ctx.currentTime;

      const oscA = this.ctx.createOscillator();
      oscA.type = logo.droneWave || 'sawtooth';
      oscA.frequency.setValueAtTime(logo.droneFreq, now);

      const oscB = this.ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.setValueAtTime(logo.droneFreq * 1.003, now);

      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(logo.droneLfoRate || 0.19, now);

      const lfoGain = this.ctx.createGain();
      const lfoDepth = logo.droneLfoDepth != null ? logo.droneLfoDepth : 0.3;
      lfoGain.gain.setValueAtTime((logo.droneFilterCutoff || 800) * lfoDepth, now);

      const filter = this.ctx.createBiquadFilter();
      filter.type = logo.droneFilterType || 'lowpass';
      filter.frequency.setValueAtTime(logo.droneFilterCutoff || 800, now);
      filter.Q.value = logo.droneFilterQ || 0.72;

      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, logo.droneVolume * 0.22), now + 0.12);

      const aux = this._connectVoice(amp, {
        reverbSend: Math.min(1, logo.reverbSend * 0.7 + 0.1),
        delaySend: Math.min(1, logo.delaySend * 0.6),
      });

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(amp);

      oscA.start(now);
      oscB.start(now);
      lfo.start(now);

      this.droneVoices.set(logo.id, { oscA, oscB, lfo, lfoGain, filter, amp, aux });
      return;
    }

    const now = this.ctx.currentTime;
    existing.oscA.frequency.setTargetAtTime(logo.droneFreq, now, 0.05);
    existing.oscB.frequency.setTargetAtTime(logo.droneFreq * 1.003, now, 0.05);
    existing.filter.type = logo.droneFilterType || 'lowpass';
    existing.filter.frequency.setTargetAtTime(logo.droneFilterCutoff || 800, now, 0.08);
    existing.filter.Q.setTargetAtTime(logo.droneFilterQ || 0.72, now, 0.08);
    existing.lfo.frequency.setTargetAtTime(logo.droneLfoRate || 0.19, now, 0.08);
    const lfoDepth = logo.droneLfoDepth != null ? logo.droneLfoDepth : 0.3;
    existing.lfoGain.gain.setTargetAtTime((logo.droneFilterCutoff || 800) * lfoDepth, now, 0.08);
    existing.amp.gain.setTargetAtTime(Math.max(0.0001, logo.droneVolume * 0.22), now, 0.08);

    existing.aux.toReverb.gain.setTargetAtTime(Math.min(1, logo.reverbSend * 0.7 + 0.1), now, 0.08);
    existing.aux.toDelay.gain.setTargetAtTime(Math.min(1, logo.delaySend * 0.6), now, 0.08);
    existing.aux.dry.gain.setTargetAtTime(
      Math.max(0, 1 - (logo.reverbSend + logo.delaySend) * 0.4),
      now,
      0.08,
    );
  }

  removeLogo(logoId) {
    const voice = this.droneVoices.get(logoId);
    if (!voice) {
      return;
    }
    this._stopDroneVoice(voice);
    this.droneVoices.delete(logoId);
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
