/**
 * Punch hits and a thin city bed. Everything is synthesized, so the raid
 * does not ship a sample library. The context stays suspended until a click.
 */

export interface RaidAudio {
  play(id: string): void;
  resume(): Promise<void>;
  startCity(): void;
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
  let city: { stop: () => void } | null = null;
  let cityOn = false;
  let timer = 0;

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

  const play = (id: string) => {
    plays.push(id);
    if (plays.length > 24) plays.shift();
    void ctx.resume();
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
    gain.connect(master);
    source.start();
    const events = [carPass, carPass, horn, siren];
    timer = window.setInterval(() => {
      events[Math.floor(Math.random() * events.length)]();
    }, 3400);
    city = {
      stop: () => {
        window.clearInterval(timer);
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  };

  const api: RaidAudio = {
    play,
    resume: () => ctx.resume().then(() => undefined),
    startCity,
    dispose: () => {
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
