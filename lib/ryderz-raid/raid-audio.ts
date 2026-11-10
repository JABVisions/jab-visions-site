/**
 * Punch hits and a thin city bed. Everything is synthesized, so the raid
 * does not ship a sample library. The context stays suspended until a click.
 */

export interface RaidAudio {
  play(id: string): void;
  resume(): Promise<void>;
  startCity(): void;
  /** Tropical bed instead of traffic. Safe to call every frame. */
  setIsland(on: boolean): void;
  /**
   * Woods instead of traffic, with the party's beat at `level` (0 far, 1 at the
   * speakers). Null leaves the woods. Safe to call every frame.
   */
  setParty(level: number | null): void;
  /** Muffles the bed while the camera is under the wave. */
  setSubmerged(on: boolean): void;
  dispose(): void;
  readonly plays: string[];
  readonly city: boolean;
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    brown = brown * 0.985 + white * 0.015;
    data[i] = Math.max(-1, Math.min(1, brown * 3.2));
  }
  return buffer;
}

function envGain(ctx: AudioContext, peak: number, seconds: number, when = ctx.currentTime) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
  return gain;
}

export function createRaidAudio(): RaidAudio {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const bed = noiseBuffer(ctx, 2);
  const plays: string[] = [];
  let city: { stop: () => void; gain: GainNode } | null = null;
  let cityOn = false;
  let timer = 0;
  let islandOn = false;
  let surf: { stop: () => void } | null = null;
  let party: { stop: () => void; level: GainNode } | null = null;
  let partyWall: BiquadFilterNode | null = null;
  const muffler = ctx.createBiquadFilter();
  muffler.type = 'lowpass';
  muffler.frequency.value = 2800;
  muffler.connect(master);

  const whoosh = (heavy: boolean) => {
    const when = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = bed;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(heavy ? 900 : 1600, when);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 220 : 380, when + 0.16);
    const gain = envGain(ctx, heavy ? 0.28 : 0.2, heavy ? 0.2 : 0.14, when);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + 0.22);
  };

  const impact = (heavy: boolean) => {
    const when = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const freq = (heavy ? 78 : 118) * (0.92 + Math.random() * 0.16);
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + (heavy ? 0.16 : 0.1));
    const body = envGain(ctx, heavy ? 0.7 : 0.55, heavy ? 0.18 : 0.12, when);
    osc.connect(body);
    body.connect(master);
    osc.start(when);
    osc.stop(when + 0.2);

    const click = ctx.createBufferSource();
    click.buffer = bed;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = heavy ? 500 : 900;
    const clickGain = envGain(ctx, heavy ? 0.22 : 0.16, 0.06, when);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(master);
    click.start(when);
    click.stop(when + 0.08);
  };

  const carPass = () => {
    const when = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = bed;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(280, when);
    filter.frequency.linearRampToValueAtTime(1400, when + 0.7);
    filter.frequency.linearRampToValueAtTime(320, when + 1.6);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(-0.85, when);
    panner.pan.linearRampToValueAtTime(0.85, when + 1.6);
    const gain = envGain(ctx, 0.16, 1.6, when);
    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + 1.65);
  };

  const horn = () => {
    const when = ctx.currentTime;
    [392, 494].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      const gain = envGain(ctx, index === 0 ? 0.05 : 0.035, 0.42, when);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + 0.45);
    });
  };

  const siren = () => {
    const when = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, when);
    osc.frequency.linearRampToValueAtTime(880, when + 0.45);
    osc.frequency.linearRampToValueAtTime(620, when + 0.9);
    osc.frequency.linearRampToValueAtTime(880, when + 1.35);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    const gain = envGain(ctx, 0.04, 1.4, when);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + 1.45);
  };

  // Signal Orb pickup: an airy swoosh and a rising sweep that land on a bright
  // two-note chime. Rapid pickups climb in pitch; a short voice gate keeps a
  // shower of orbs from stacking into distortion.
  let orbStreak = 0;
  let orbLast = -1;
  const orbVoices: number[] = [];
  const shwoop = (batch: number) => {
    const when = ctx.currentTime;
    while (orbVoices.length && orbVoices[0] < when) orbVoices.shift();
    if (orbVoices.length >= 3) return;
    orbVoices.push(when + 0.34);
    orbStreak = when - orbLast < 0.6 ? Math.min(8, orbStreak + 1) : 0;
    orbLast = when;
    const lift = 2 ** ((orbStreak * 1.5 + (Math.random() - 0.5) * 0.6) / 12);
    const loud = Math.min(1.5, 1 + Math.log2(Math.max(1, batch)) * 0.18);
    const out = ctx.createGain();
    out.gain.value = 0.9 * loud;
    out.connect(master);

    const air = ctx.createBufferSource();
    air.buffer = bed;
    air.loop = true;
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.Q.value = 1.1;
    airBand.frequency.setValueAtTime(700 * lift, when);
    airBand.frequency.exponentialRampToValueAtTime(5200 * lift, when + 0.17);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, when);
    airGain.gain.exponentialRampToValueAtTime(0.16, when + 0.07);
    airGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
    air.connect(airBand);
    airBand.connect(airGain);
    airGain.connect(out);
    air.start(when);
    air.stop(when + 0.22);

    const sweep = ctx.createOscillator();
    sweep.type = 'triangle';
    sweep.frequency.setValueAtTime(480 * lift, when);
    sweep.frequency.exponentialRampToValueAtTime(1500 * lift, when + 0.15);
    const sweepGain = ctx.createGain();
    sweepGain.gain.setValueAtTime(0.0001, when);
    sweepGain.gain.exponentialRampToValueAtTime(0.1, when + 0.04);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
    sweep.connect(sweepGain);
    sweepGain.connect(out);
    sweep.start(when);
    sweep.stop(when + 0.19);

    const ring = when + 0.13;
    const notes = batch > 2 ? [1568, 2349, 3136] : [1568, 2349];
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * lift;
      osc.detune.value = (Math.random() - 0.5) * 8;
      const gain = ctx.createGain();
      const at = ring + index * 0.035;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.09 : 0.06, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      osc.connect(gain);
      gain.connect(out);
      osc.start(at);
      osc.stop(at + 0.22);
    });
  };

  const play = (id: string) => {
    plays.push(id);
    if (plays.length > 24) plays.shift();
    void ctx.resume();
    if (id.startsWith('signal.orb')) {
      shwoop(Number(id.split('.')[2]) || 1);
      return;
    }
    const heavy = /kick|smash|heavy/.test(id);
    if (/whiff|swing/.test(id)) {
      whoosh(heavy);
      return;
    }
    if (/impact|punch|kick|jab|cross|slash|chop|slap|smash|melee|hit/.test(id)) impact(heavy);
  };

  const startCity = () => {
    if (city) return;
    cityOn = true;
    const source = ctx.createBufferSource();
    source.buffer = bed;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(muffler);
    source.start();
    const events = [carPass, carPass, horn, siren];
    const armTraffic = () => {
      if (timer || islandOn) return;
      timer = window.setInterval(() => {
        if (!party) events[Math.floor(Math.random() * events.length)]();
      }, 3400);
    };
    armTraffic();
    city = {
      gain,
      stop: () => {
        window.clearInterval(timer);
        timer = 0;
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  };

  const setIsland = (on: boolean) => {
    if (on === islandOn) return;
    islandOn = on;
    if (!city) return;
    if (on) {
      window.clearInterval(timer);
      timer = 0;
      city.gain.gain.value = 0.02;
      if (!surf) {
        const source = ctx.createBufferSource();
        source.buffer = bed;
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 520;
        filter.Q.value = 0.6;
        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(muffler);
        source.start();
        surf = {
          stop: () => {
            try {
              source.stop();
            } catch {
              /* already stopped */
            }
          },
        };
      }
      return;
    }
    surf?.stop();
    surf = null;
    city.gain.gain.value = 0.07;
    if (!timer) {
      const events = [carPass, carPass, horn, siren];
      timer = window.setInterval(() => {
        if (!party) events[Math.floor(Math.random() * events.length)]();
      }, 3400);
    }
  };

  /** One muffled bar step: a kick on every beat, a soft hat between, heard through the woods. */
  const beat = (out: AudioNode, when: number, step: number) => {
    if (step % 2 === 0) {
      const kick = ctx.createOscillator();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(110, when);
      kick.frequency.exponentialRampToValueAtTime(42, when + 0.16);
      const g = envGain(ctx, 0.9, 0.32, when);
      kick.connect(g);
      g.connect(out);
      kick.start(when);
      kick.stop(when + 0.34);
    }
    if (step % 4 === 2 || step % 8 === 7) {
      const bass = ctx.createOscillator();
      bass.type = 'triangle';
      bass.frequency.value = step % 8 === 7 ? 73.4 : 55;
      const g = envGain(ctx, 0.35, 0.22, when);
      bass.connect(g);
      g.connect(out);
      bass.start(when);
      bass.stop(when + 0.24);
    }
    if (step % 2 === 1) {
      const hat = ctx.createBufferSource();
      hat.buffer = bed;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const g = envGain(ctx, 0.12, 0.05, when);
      hat.connect(hp);
      hp.connect(g);
      g.connect(out);
      hat.start(when, Math.random());
      hat.stop(when + 0.06);
    }
  };

  const startParty = () => {
    const level = ctx.createGain();
    level.gain.value = 0;
    // Walls and trees take the top off; up close the filter opens a little.
    const wall = ctx.createBiquadFilter();
    wall.type = 'lowpass';
    wall.frequency.value = 420;
    level.connect(wall);
    wall.connect(muffler);
    const leaves = ctx.createBufferSource();
    leaves.buffer = bed;
    leaves.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.5;
    const leafGain = ctx.createGain();
    leafGain.gain.value = 0.035;
    leaves.connect(band);
    band.connect(leafGain);
    leafGain.connect(muffler);
    leaves.start();
    const stepSeconds = 60 / 122 / 2;
    let next = ctx.currentTime + 0.1;
    let step = 0;
    const schedule = window.setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        beat(level, next, step);
        next += stepSeconds;
        step += 1;
      }
      // Crickets once the light goes.
      if (Math.random() < 0.08) {
        const when = ctx.currentTime + Math.random() * 0.2;
        for (let k = 0; k < 3; k += 1) {
          const chirp = ctx.createOscillator();
          chirp.type = 'sine';
          chirp.frequency.value = 4400 + Math.random() * 300;
          const g = envGain(ctx, 0.012, 0.04, when + k * 0.07);
          chirp.connect(g);
          g.connect(muffler);
          chirp.start(when + k * 0.07);
          chirp.stop(when + k * 0.07 + 0.05);
        }
      }
    }, 100);
    party = {
      level,
      stop: () => {
        window.clearInterval(schedule);
        try {
          leaves.stop();
        } catch {
          /* already stopped */
        }
        level.disconnect();
      },
    };
    partyWall = wall;
  };
  const setParty = (level: number | null) => {
    if (level === null) {
      if (!party) return;
      party.stop();
      party = null;
      partyWall = null;
      if (city && !islandOn) city.gain.gain.value = 0.07;
      return;
    }
    if (!party) {
      startParty();
      if (city) city.gain.gain.value = 0.025;
    }
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, level));
    party!.level.gain.setTargetAtTime(0.06 + v * 0.34, now, 0.25);
    partyWall?.frequency.setTargetAtTime(380 + v * 900, now, 0.25);
  };

  const setSubmerged = (on: boolean) => {
    const now = ctx.currentTime;
    muffler.frequency.cancelScheduledValues(now);
    muffler.frequency.setTargetAtTime(on ? 420 : 2800, now, 0.08);
  };

  const api: RaidAudio = {
    play,
    resume: () => ctx.resume().then(() => undefined),
    startCity,
    setIsland,
    setParty,
    setSubmerged,
    dispose: () => {
      party?.stop();
      party = null;
      surf?.stop();
      surf = null;
      city?.stop();
      city = null;
      cityOn = false;
      void ctx.close();
    },
    plays,
    get city() {
      return cityOn;
    },
  };
  if (process.env.NODE_ENV !== 'production') {
    (window as unknown as { __raidAudio?: RaidAudio }).__raidAudio = api;
  }
  return api;
}
