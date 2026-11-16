import assert from 'node:assert/strict';
import { FrameProfiler, formatProfile } from './profiler';

let clock = 0;
const profiler = new FrameProfiler(() => clock);

profiler.begin('sim');
clock += 5;
profiler.end('sim');
profiler.beginFrame();
profiler.endFrame();
assert.equal(profiler.report().frames, 0, 'a disabled profiler records nothing');

profiler.setEnabled(true);
// 100 frames at 10 ms with 4 ms of work, 3 ms of it in `sim`, then one 80 ms hitch.
for (let i = 0; i < 101; i += 1) {
  profiler.beginFrame();
  profiler.begin('sim');
  clock += 3;
  profiler.end('sim');
  profiler.begin('render');
  clock += 1;
  profiler.end('render');
  profiler.endFrame();
  clock += i === 99 ? 76 : 6;
}
profiler.setRender({ calls: 120, triangles: 250000, geometries: 30, textures: 12, programs: 9 });
profiler.setCount('hosts', 16);

const report = profiler.report();
assert.equal(report.frames, 101);
assert.ok(Math.abs(report.interval.p50 - 10) < 1e-3, 'median interval is the steady frame time');
assert.ok(Math.abs(report.interval.max - 80) < 1e-3, 'the hitch is the worst frame');
assert.equal(report.hitches, 1);
assert.ok(Math.abs(report.slowFrames - 0.01) < 1e-6, 'one frame in a hundred ran under 50 fps');
assert.ok(Math.abs(report.cpu.avg - 4) < 1e-3, 'cpu time excludes the idle wait between frames');
assert.equal(report.sections[0].name, 'sim', 'sections sort by cost');
assert.ok(Math.abs(report.sections[0].avg - 3) < 1e-3);
assert.ok(Math.abs(report.sections[1].avg - 1) < 1e-3);
assert.ok(report.fps > 90 && report.fps < 100);
assert.equal(report.render.calls, 120);
assert.equal(report.counts.hosts, 16);

const text = formatProfile(report);
assert.ok(text.includes('draws 120') && text.includes('hosts 16') && text.includes('sim'));

profiler.setEnabled(false);
profiler.setEnabled(true);
assert.equal(profiler.report().frames, 0, 'toggling clears the window');

console.log('profiler checks passed');
