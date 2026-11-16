/**
 * Frame profiler for Ryderz: Raid.
 *
 * Measures what the frame actually costs instead of guessing: wall-clock frame
 * intervals (for fps and pacing), CPU time per engine section, and the
 * renderer's draw-call and triangle counters. Disabled, every call returns on
 * its first line.
 *
 * Enable with `?raidflags=profiler`, or call `engine.profile(true)`.
 */

export interface ProfileStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface RenderCounters {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

export interface ProfileReport {
  frames: number;
  fps: number;
  /** Wall-clock time between frames, ms. */
  interval: ProfileStats;
  /** CPU time spent inside the engine's frame callback, ms. */
  cpu: ProfileStats;
  /** Average ms per frame for each timed section, largest first. */
  sections: Array<{ name: string; avg: number; max: number }>;
  /** Share of frames slower than 20 ms (below 50 fps). */
  slowFrames: number;
  /** Frames over 50 ms: visible hitches. */
  hitches: number;
  render: RenderCounters;
  counts: Record<string, number>;
}

const WINDOW = 240;

function stats(samples: Float32Array, count: number): ProfileStats {
  if (!count) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = Array.from(samples.subarray(0, count)).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(count - 1, Math.floor(q * count))];
  let sum = 0;
  for (const v of sorted) sum += v;
  return { avg: sum / count, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[count - 1] };
}

interface Section {
  started: number;
  /** Time accumulated in the frame being measured. */
  frame: number;
  total: number;
  max: number;
}

export class FrameProfiler {
  enabled = false;
  private now: () => number;
  private intervals = new Float32Array(WINDOW);
  private cpus = new Float32Array(WINDOW);
  private cursor = 0;
  private filled = 0;
  private frames = 0;
  private lastFrameAt = -1;
  private frameStart = 0;
  private sections = new Map<string, Section>();
  private sectionFrames = 0;
  private hitches = 0;
  private render: RenderCounters = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  private counts: Record<string, number> = {};

  constructor(now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.now = now;
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.reset();
  }

  reset() {
    this.cursor = 0;
    this.filled = 0;
    this.frames = 0;
    this.lastFrameAt = -1;
    this.sections.clear();
    this.sectionFrames = 0;
    this.hitches = 0;
  }

  beginFrame() {
    if (!this.enabled) return;
    this.frameStart = this.now();
  }

  endFrame() {
    if (!this.enabled) return;
    const t = this.now();
    if (this.lastFrameAt >= 0) {
      const interval = t - this.lastFrameAt;
      this.intervals[this.cursor] = interval;
      this.cpus[this.cursor] = t - this.frameStart;
      this.cursor = (this.cursor + 1) % WINDOW;
      this.filled = Math.min(WINDOW, this.filled + 1);
      if (interval > 50) this.hitches += 1;
    }
    this.lastFrameAt = t;
    this.frames += 1;
    this.sectionFrames += 1;
    this.sections.forEach((section) => {
      section.total += section.frame;
      if (section.frame > section.max) section.max = section.frame;
      section.frame = 0;
    });
  }

  begin(name: string) {
    if (!this.enabled) return;
    let section = this.sections.get(name);
    if (!section) {
      section = { started: 0, frame: 0, total: 0, max: 0 };
      this.sections.set(name, section);
    }
    section.started = this.now();
  }

  end(name: string) {
    if (!this.enabled) return;
    const section = this.sections.get(name);
    if (section) section.frame += this.now() - section.started;
  }

  /** Renderer counters for the frame just drawn. */
  setRender(counters: RenderCounters) {
    if (!this.enabled) return;
    this.render = counters;
  }

  setCount(name: string, value: number) {
    if (!this.enabled) return;
    this.counts[name] = value;
  }

  report(): ProfileReport {
    const interval = stats(this.intervals, this.filled);
    const cpu = stats(this.cpus, this.filled);
    let slow = 0;
    for (let i = 0; i < this.filled; i += 1) if (this.intervals[i] > 20) slow += 1;
    const frames = Math.max(1, this.sectionFrames);
    const sections = Array.from(this.sections.entries())
      .map(([name, section]) => ({ name, avg: section.total / frames, max: section.max }))
      .sort((a, b) => b.avg - a.avg);
    return {
      frames: this.frames,
      fps: interval.avg > 0 ? 1000 / interval.avg : 0,
      interval,
      cpu,
      sections,
      slowFrames: this.filled ? slow / this.filled : 0,
      hitches: this.hitches,
      render: { ...this.render },
      counts: { ...this.counts },
    };
  }
}

const ms = (value: number) => value.toFixed(value >= 10 ? 1 : 2);

/** Plain-text block for the on-screen overlay. */
export function formatProfile(report: ProfileReport) {
  const lines = [
    `${report.fps.toFixed(0)} fps   frame ${ms(report.interval.avg)} ms   p95 ${ms(report.interval.p95)}   max ${ms(report.interval.max)}`,
    `cpu ${ms(report.cpu.avg)} ms   p95 ${ms(report.cpu.p95)}   slow ${(report.slowFrames * 100).toFixed(0)}%   hitches ${report.hitches}`,
    `draws ${report.render.calls}   tris ${(report.render.triangles / 1000).toFixed(0)}k   geo ${report.render.geometries}   tex ${report.render.textures}   prog ${report.render.programs}`,
  ];
  const counts = Object.entries(report.counts)
    .map(([name, value]) => `${name} ${value}`)
    .join('   ');
  if (counts) lines.push(counts);
  for (const section of report.sections.slice(0, 9)) {
    lines.push(`${section.name.padEnd(10)} ${ms(section.avg).padStart(6)} ms   max ${ms(section.max)}`);
  }
  return lines.join('\n');
}

/** A fixed text panel in the corner of the page. Pointer events pass through to the game. */
export class ProfilerOverlay {
  private element: HTMLPreElement | null = null;
  private nextAt = 0;

  show() {
    if (this.element || typeof document === 'undefined') return;
    const element = document.createElement('pre');
    element.setAttribute('data-raid-profiler', '');
    element.style.cssText = [
      'position:fixed',
      'left:8px',
      'bottom:8px',
      'z-index:2147483000',
      'margin:0',
      'padding:8px 10px',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#d8ffe6',
      'background:rgba(6,10,18,0.78)',
      'border:1px solid rgba(120,255,190,0.35)',
      'border-radius:6px',
      'pointer-events:none',
      'white-space:pre',
    ].join(';');
    document.body.appendChild(element);
    this.element = element;
  }

  hide() {
    this.element?.remove();
    this.element = null;
  }

  /** Repaints four times a second so the overlay never becomes the thing being measured. */
  update(profiler: FrameProfiler, now: number) {
    if (!this.element || now < this.nextAt) return;
    this.nextAt = now + 250;
    this.element.textContent = formatProfile(profiler.report());
  }
}
