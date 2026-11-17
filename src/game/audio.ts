export class SoundEngine {
  ctx: AudioContext | null = null;
  muted = false;
  musicModes = ['auto', 'adventure', 'night', 'battle', 'off'] as const;
  musicModeIndex = 0;
  sfxVolume = 0.35;
  musicVolume = 0.13;
  bgmTimer: number | null = null;
  step = 0;
  tvStep = 0;
  lastMobStepTime = 0;
  lastRotorTime = 0;
  lastEngineTime = 0;
  lastTurnScrubTime = 0;
  lastZombieGroanTime = 0;
  lastAnimalCallTime = 0;
  lastImpactTime = 0;
  private getTrackContext: (() => { isBloodmoon: boolean; hasBoss: boolean; nearbyZeds: number; isNight: boolean }) | null = null;

  setTrackContextProvider(
    fn: () => { isBloodmoon: boolean; hasBoss: boolean; nearbyZeds: number; isNight: boolean }
  ) {
    this.getTrackContext = fn;
  }

  init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.bgmTimer && this.ctx) {
      this.startAdaptiveMusic();
    }
  }

  cycleMusicMode(): string {
    this.init();
    this.musicModeIndex = (this.musicModeIndex + 1) % this.musicModes.length;
    return this.musicModes[this.musicModeIndex];
  }

  getMusicLabel(): string {
    const mode = this.musicModes[this.musicModeIndex];
    const labels: Record<string, string> = {
      auto: 'Auto',
      adventure: 'Day',
      night: 'Night',
      battle: 'Battle',
      off: 'Off',
    };
    return labels[mode] || 'Auto';
  }

  toggleMute(): boolean {
    this.init();
    this.muted = !this.muted;
    return this.muted;
  }

  private getResolvedTrack(): string {
    const mode = this.musicModes[this.musicModeIndex];
    if (mode !== 'auto') return mode;
    if (!this.getTrackContext) return 'adventure';
    const info = this.getTrackContext();
    if (info.isBloodmoon || info.hasBoss || info.nearbyZeds >= 3) return 'battle';
    return info.isNight ? 'night' : 'adventure';
  }

  playTone(
    freq: number,
    type: OscillatorType = 'square',
    duration = 0.12,
    vol = 0.3,
    slideTo: number | null = null
  ) {
    if (this.muted || !this.ctx || freq <= 0 || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      gain.gain.setValueAtTime(Math.max(0.001, vol * this.sfxVolume), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // ignore audio context errors before gesture
    }
  }

  playNoise(duration = 0.12, vol = 0.35, filterFreq = 1200) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, now);
      filter.Q.setValueAtTime(1.2, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.001, vol * this.sfxVolume), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
    } catch {
      // ignore
    }
  }

  // Player footstep sound effect based on terrain surface
  sfxPlayerFootstep(surface: 'grass' | 'road' | 'stone' | 'water' | 'wood', sprinting = false) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const pitchJitter = 0.9 + Math.random() * 0.22;
    const sprintBoost = sprinting ? 1.25 : 1.0;

    if (surface === 'water') {
      this.playNoise(0.09, 0.24 * sprintBoost, 780 * pitchJitter);
      this.playTone(170 * pitchJitter, 'sine', 0.06, 0.12 * sprintBoost, 95);
    } else if (surface === 'road') {
      this.playNoise(0.04, 0.22 * sprintBoost, 1650 * pitchJitter);
      this.playTone(135 * pitchJitter, 'triangle', 0.045, 0.22 * sprintBoost, 65);
    } else if (surface === 'stone') {
      this.playNoise(0.06, 0.26 * sprintBoost, 2200 * pitchJitter);
      this.playTone(165 * pitchJitter, 'triangle', 0.04, 0.16 * sprintBoost, 80);
    } else if (surface === 'wood') {
      this.playTone(145 * pitchJitter, 'triangle', 0.055, 0.24 * sprintBoost, 75);
      this.playNoise(0.035, 0.12 * sprintBoost, 900);
    } else {
      this.playNoise(0.06, 0.18 * sprintBoost, 620 * pitchJitter);
      this.playTone(95 * pitchJitter, 'sine', 0.05, 0.16 * sprintBoost, 52);
    }
  }

  // Distance-attenuated & throttled mob footstep sound effect
  sfxMobFootstep(
    mobKind: 'zombie' | 'brute' | 'human' | 'animal',
    distancePx: number,
    maxHearingDist = 360
  ) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    if (distancePx > maxHearingDist) return;

    const nowMs = performance.now();
    if (nowMs - this.lastMobStepTime < 55) return;
    this.lastMobStepTime = nowMs;

    const atten = Math.max(0.05, 1 - distancePx / maxHearingDist);
    const jitter = 0.88 + Math.random() * 0.24;

    if (mobKind === 'brute') {
      this.playTone(72 * jitter, 'triangle', 0.09, 0.34 * atten, 34);
      this.playNoise(0.07, 0.22 * atten, 450);
    } else if (mobKind === 'zombie') {
      this.playNoise(0.055, 0.16 * atten, 700 * jitter);
      this.playTone(88 * jitter, 'sine', 0.05, 0.13 * atten, 48);
    } else if (mobKind === 'human') {
      this.playNoise(0.035, 0.12 * atten, 1300 * jitter);
      this.playTone(122 * jitter, 'triangle', 0.035, 0.11 * atten, 68);
    } else {
      this.playNoise(0.03, 0.08 * atten, 1800 * jitter);
    }
  }

  // Proximity zombie groans / snarls
  sfxZombieGrowl(subType: string, distancePx: number, maxDist = 420) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    if (distancePx > maxDist) return;
    const nowMs = performance.now();
    if (nowMs - this.lastZombieGroanTime < 1550) return;
    this.lastZombieGroanTime = nowMs;

    const atten = Math.max(0.06, 1 - distancePx / maxDist);
    if (subType === 'king' || subType === 'brute') {
      this.playTone(92, 'sawtooth', 0.34, 0.3 * atten, 48);
      this.playNoise(0.24, 0.18 * atten, 320);
    } else if (subType === 'spitter') {
      this.playNoise(0.18, 0.2 * atten, 1950);
      this.playTone(230, 'triangle', 0.16, 0.15 * atten, 125);
    } else {
      const f = 135 + Math.random() * 45;
      this.playTone(f, 'sawtooth', 0.26, 0.17 * atten, f * 0.65);
    }
  }

  // Gentle proximity farm animal ambiance
  sfxAnimalSound(subType: string, distancePx: number, maxDist = 340) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    if (distancePx > maxDist) return;
    const nowMs = performance.now();
    if (nowMs - this.lastAnimalCallTime < 2400) return;
    this.lastAnimalCallTime = nowMs;

    const atten = Math.max(0.05, 1 - distancePx / maxDist);
    if (subType === 'cow') {
      this.playTone(148, 'sawtooth', 0.38, 0.14 * atten, 118);
    } else if (subType === 'pig') {
      this.playTone(220, 'triangle', 0.12, 0.13 * atten, 170);
      setTimeout(() => this.playTone(210, 'triangle', 0.1, 0.11 * atten, 165), 110);
    } else if (subType === 'chicken') {
      this.playTone(680, 'triangle', 0.06, 0.1 * atten, 540);
      setTimeout(() => this.playTone(720, 'triangle', 0.07, 0.1 * atten, 580), 80);
    } else {
      this.playTone(340, 'triangle', 0.18, 0.1 * atten, 270);
    }
  }

  // Helicopter rotor thump
  sfxHelicopterRotor(volumeScale = 0.5) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this.lastRotorTime < 95) return;
    this.lastRotorTime = nowMs;
    this.playNoise(0.075, 0.26 * volumeScale, 320);
    this.playTone(62, 'sawtooth', 0.065, 0.14 * volumeScale, 44);
  }

  // Ground Car / Jeep engine rumble
  sfxVehicleEngine(kind: 'car' | 'jeep', speedRatio = 0.5, volumeScale = 0.45) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this.lastEngineTime < 115) return;
    this.lastEngineTime = nowMs;
    const baseFreq = kind === 'jeep' ? 54 : 68;
    const freq = baseFreq + Math.min(1, Math.max(0, speedRatio)) * 44;
    this.playTone(freq, 'sawtooth', 0.11, 0.13 * volumeScale, freq * 0.94);
    this.playNoise(0.08, 0.08 * volumeScale, 280);
  }

  sfxTireTurn() {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this.lastTurnScrubTime < 220) return;
    this.lastTurnScrubTime = nowMs;
    this.playNoise(0.08, 0.14, 1900);
    this.playTone(540, 'triangle', 0.07, 0.08, 420);
  }

  sfxVehicleCrash() {
    this.init();
    this.playNoise(0.24, 0.72, 480);
    this.playTone(115, 'sawtooth', 0.22, 0.55, 38);
    this.playTone(220, 'square', 0.1, 0.32, 70);
  }

  sfxCarHorn() {
    this.init();
    this.playTone(392, 'sawtooth', 0.18, 0.28);
    this.playTone(493.88, 'sawtooth', 0.18, 0.26);
  }

  sfxRadarHorn() {
    this.init();
    this.playTone(196, 'sawtooth', 0.42, 0.55, 175);
    this.playTone(261.63, 'square', 0.42, 0.38, 233);
    setTimeout(() => {
      this.playTone(196, 'sawtooth', 0.55, 0.55, 165);
      this.playTone(261.63, 'square', 0.55, 0.36, 220);
    }, 460);
  }

  sfxPresidentCommand() {
    this.init();
    // Radio chirp + authoritative Presidential command chord
    this.playNoise(0.04, 0.18, 2400);
    this.playTone(523.25, 'triangle', 0.11, 0.28);
    setTimeout(() => this.playTone(659.25, 'triangle', 0.11, 0.28), 85);
    setTimeout(() => this.playTone(783.99, 'triangle', 0.16, 0.3), 170);
  }

  sfxCashRegister() {
    this.init();
    this.playTone(987.77, 'sine', 0.07, 0.28);
    setTimeout(() => this.playTone(1318.51, 'sine', 0.12, 0.32), 65);
    setTimeout(() => this.playTone(1567.98, 'triangle', 0.14, 0.22), 130);
  }

  sfxRefuel() {
    this.init();
    this.playNoise(0.14, 0.24, 920);
    this.playTone(280, 'sine', 0.1, 0.24, 460);
    setTimeout(() => this.sfxCashRegister(), 120);
  }

  sfxPiano() {
    this.init();
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => {
        this.playTone(n, 'triangle', 0.36, 0.24);
        this.playTone(n * 0.5, 'sine', 0.32, 0.16);
      }, idx * 75);
    });
  }

  sfxComputerBoot(turnOn = true) {
    this.init();
    if (turnOn) {
      this.playTone(523.25, 'square', 0.07, 0.16);
      setTimeout(() => this.playTone(659.25, 'square', 0.07, 0.16), 75);
      setTimeout(() => this.playTone(1046.5, 'square', 0.14, 0.18), 150);
    } else {
      this.playTone(659.25, 'square', 0.08, 0.16, 220);
    }
  }

  sfxDoor(isIron = false, opening = true) {
    this.init();
    if (isIron) {
      this.playNoise(0.14, 0.28, 1250);
      this.playTone(opening ? 140 : 185, 'sawtooth', 0.12, 0.28, opening ? 210 : 95);
    } else {
      this.playTone(opening ? 220 : 190, 'triangle', 0.08, 0.22, opening ? 280 : 140);
      this.playNoise(0.05, 0.14, 700);
    }
  }

  sfxBulletImpact(isMetal = false) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this.lastImpactTime < 45) return;
    this.lastImpactTime = nowMs;
    if (isMetal) {
      this.playTone(1150, 'triangle', 0.05, 0.16, 620);
      this.playNoise(0.04, 0.14, 2400);
    } else {
      this.playNoise(0.045, 0.15, 780);
    }
  }

  sfxMeteorIncoming() {
    this.init();
    this.playTone(980, 'sine', 0.35, 0.22, 160);
    this.playNoise(0.28, 0.22, 1100);
  }

  sfxGrenadeThrow() {
    this.init();
    this.playTone(380, 'triangle', 0.11, 0.2, 190);
    this.playNoise(0.08, 0.16, 1400);
  }

  sfxCraft() {
    this.init();
    this.playTone(330, 'triangle', 0.08, 0.28, 495);
    setTimeout(() => this.playTone(587.33, 'triangle', 0.12, 0.28), 80);
  }

  sfxAnvil() {
    this.init();
    this.playTone(920, 'square', 0.16, 0.28, 640);
    this.playTone(460, 'triangle', 0.18, 0.26, 320);
  }

  sfxHarvest() {
    this.init();
    this.playNoise(0.08, 0.22, 1600);
    this.playTone(480, 'triangle', 0.07, 0.2, 690);
  }

  sfxHeal() {
    this.init();
    this.playTone(440, 'sine', 0.1, 0.24);
    setTimeout(() => this.playTone(587.33, 'sine', 0.12, 0.26), 80);
    setTimeout(() => this.playTone(783.99, 'sine', 0.16, 0.28), 160);
  }

  sfxLevelUp() {
    this.init();
    [523.25, 659.25, 783.99, 1046.5].forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 'triangle', 0.18, 0.32), idx * 90);
    });
  }

  sfxDeath() {
    this.init();
    this.playTone(220, 'sawtooth', 0.38, 0.42, 98);
    setTimeout(() => this.playTone(146.83, 'sawtooth', 0.55, 0.4, 65), 220);
  }

  sfxRespawn() {
    this.init();
    [392.0, 523.25, 659.25, 783.99].forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 'sine', 0.16, 0.28), idx * 80);
    });
  }

  sfxBloodmoonHowl() {
    this.init();
    this.playTone(130, 'sawtooth', 0.9, 0.95, 55);
    setTimeout(() => this.playTone(185, 'sawtooth', 1.1, 0.9, 65), 220);
    this.playNoise(1.1, 0.85, 240);
  }

  sfxBossRoarEarthquake() {
    this.init();
    this.playNoise(0.95, 1.35, 190);
    this.playTone(95, 'sawtooth', 0.85, 1.05, 28);
    this.playTone(58, 'square', 0.9, 0.95, 22);
  }

  sfxSpit() {
    this.init();
    this.playTone(360, 'sawtooth', 0.14, 0.35, 140);
    this.playNoise(0.09, 0.25, 1800);
  }

  sfxShoot(weaponType = 'pistol') {
    this.init();
    if (weaponType === 'shotgun') {
      this.playNoise(0.22, 0.85, 650);
      this.playTone(130, 'sawtooth', 0.18, 0.5, 42);
    } else if (weaponType === 'sniper') {
      this.playNoise(0.25, 0.9, 1400);
      this.playTone(260, 'square', 0.2, 0.55, 55);
    } else if (weaponType === 'rifle' || weaponType === 'heli_gun') {
      this.playNoise(0.09, 0.6, 1600);
      this.playTone(weaponType === 'heli_gun' ? 175 : 210, 'triangle', 0.08, 0.38, 65);
    } else if (weaponType === 'bow') {
      this.playTone(420, 'triangle', 0.12, 0.3, 180);
      this.playNoise(0.06, 0.16, 2100);
    } else {
      this.playNoise(0.11, 0.6, 1300);
      this.playTone(240, 'square', 0.09, 0.35, 80);
    }
  }

  sfxExplosion() {
    this.init();
    this.playNoise(0.55, 1.15, 280);
    this.playTone(88, 'sawtooth', 0.48, 0.85, 24);
  }

  sfxGasExplosion() {
    this.init();
    this.playNoise(0.28, 0.95, 2400);
    this.playNoise(0.95, 1.55, 320);
    this.playTone(110, 'sawtooth', 0.72, 1.05, 20);
    this.playTone(62, 'square', 0.85, 0.85, 18);
    setTimeout(() => {
      this.playNoise(0.55, 0.95, 420);
      this.playTone(74, 'sawtooth', 0.45, 0.65, 24);
    }, 110);
  }

  sfxTvNewsPulse() {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const notes = [880, 1174.66, 880, 1318.51, 987.77, 1174.66, 0, 1567.98];
    const f = notes[this.tvStep % notes.length];
    this.tvStep++;
    if (f > 0) this.playTone(f, 'square', 0.08, 0.14);
    else this.playNoise(0.05, 0.08, 2200);
  }

  sfxSplash() {
    this.init();
    this.playNoise(0.12, 0.22, 850);
    this.playTone(220, 'sine', 0.08, 0.14, 120);
  }

  sfxHorseNeigh() {
    this.init();
    this.playTone(540, 'sawtooth', 0.14, 0.3, 680);
    setTimeout(() => this.playTone(620, 'sawtooth', 0.22, 0.28, 320), 130);
  }

  sfxHoof() {
    this.init();
    this.playTone(115, 'triangle', 0.05, 0.18, 65);
    this.playNoise(0.03, 0.1, 1400);
  }

  sfxSwing() {
    this.init();
    this.playTone(320, 'triangle', 0.1, 0.25, 110);
    this.playNoise(0.06, 0.15, 1600);
  }

  sfxHit() {
    this.init();
    this.playTone(140, 'sawtooth', 0.09, 0.35, 55);
  }

  sfxChop() {
    this.init();
    this.playTone(190, 'square', 0.08, 0.35, 95);
    this.playNoise(0.06, 0.3, 900);
  }

  sfxMine() {
    this.init();
    this.playTone(520, 'triangle', 0.08, 0.3, 280);
    this.playNoise(0.05, 0.2, 2200);
  }

  sfxBuild() {
    this.init();
    this.playTone(260, 'square', 0.07, 0.3, 390);
  }

  sfxPickup() {
    this.init();
    this.playTone(580, 'sine', 0.07, 0.3, 880);
  }

  sfxEat() {
    this.init();
    this.playTone(340, 'triangle', 0.08, 0.3, 480);
    setTimeout(() => this.playTone(440, 'triangle', 0.09, 0.3, 620), 70);
  }

  sfxShieldBlock() {
    this.init();
    this.playTone(460, 'square', 0.1, 0.45, 220);
    this.playNoise(0.06, 0.22, 2100);
  }

  sfxAlert() {
    this.init();
    this.playTone(440, 'square', 0.12, 0.35);
    setTimeout(() => this.playTone(587, 'square', 0.18, 0.35), 130);
  }

  private startAdaptiveMusic() {
    const tracks: Record<
      string,
      { bass: number[]; lead: number[]; pad: number[]; leadType: OscillatorType; volMult: number }
    > = {
      adventure: {
        bass: [130.81, 130.81, 164.81, 196.0, 146.83, 146.83, 174.61, 196.0],
        lead: [523.25, 0, 659.25, 783.99, 659.25, 587.33, 523.25, 392.0, 440.0, 523.25, 587.33, 659.25, 587.33, 0, 523.25, 0],
        pad: [261.63, 329.63, 293.66, 392.0],
        leadType: 'triangle',
        volMult: 0.9,
      },
      night: {
        bass: [98.0, 0, 110.0, 0, 87.31, 0, 98.0, 0],
        lead: [392.0, 440.0, 493.88, 0, 329.63, 0, 392.0, 293.66, 329.63, 0, 392.0, 440.0, 392.0, 0, 293.66, 0],
        pad: [196.0, 220.0, 174.61, 196.0],
        leadType: 'sine',
        volMult: 0.72,
      },
      battle: {
        bass: [110, 110, 146.83, 130.81, 164.81, 164.81, 146.83, 196.0],
        lead: [440, 523.25, 587.33, 659.25, 587.33, 523.25, 440, 659.25, 392, 440, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33],
        pad: [220.0, 261.63, 293.66, 329.63],
        leadType: 'square',
        volMult: 1.05,
      },
    };

    this.bgmTimer = window.setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const trackName = this.getResolvedTrack();
      if (trackName === 'off') return;

      const t = tracks[trackName] || tracks.adventure;
      const now = this.ctx.currentTime;
      const bNote = t.bass[this.step % t.bass.length];
      const lNote = t.lead[this.step % t.lead.length];

      if (bNote > 0) {
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'triangle';
        bOsc.frequency.setValueAtTime(bNote, now);
        bGain.gain.setValueAtTime(this.musicVolume * 0.8 * t.volMult, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        bOsc.connect(bGain);
        bGain.connect(this.ctx.destination);
        bOsc.start(now);
        bOsc.stop(now + 0.2);
      }

      if (lNote > 0) {
        const lOsc = this.ctx.createOscillator();
        const lGain = this.ctx.createGain();
        lOsc.type = t.leadType;
        lOsc.frequency.setValueAtTime(lNote, now);
        lGain.gain.setValueAtTime(this.musicVolume * 0.34 * t.volMult, now);
        lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        lOsc.connect(lGain);
        lGain.connect(this.ctx.destination);
        lOsc.start(now);
        lOsc.stop(now + 0.18);
      }

      // Soft warm harmonic pad on measure quarter-beats
      if (this.step % 4 === 0) {
        const pNote = t.pad[Math.floor(this.step / 4) % t.pad.length];
        if (pNote > 0) {
          const pOsc = this.ctx.createOscillator();
          const pGain = this.ctx.createGain();
          pOsc.type = 'sine';
          pOsc.frequency.setValueAtTime(pNote, now);
          pGain.gain.setValueAtTime(this.musicVolume * 0.28 * t.volMult, now);
          pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
          pOsc.connect(pGain);
          pGain.connect(this.ctx.destination);
          pOsc.start(now);
          pOsc.stop(now + 0.54);
        }
      }

      // Crisp rhythmic pulse on battle / adventure tracks
      if ((trackName === 'battle' || trackName === 'adventure') && this.step % 2 === 1) {
        this.playNoise(0.025, trackName === 'battle' ? 0.08 : 0.045, 5200);
      }

      this.step++;
    }, 215);
  }

  destroy() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const audio = new SoundEngine();
