import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSessionFile, mixTakeDurationMs, sessionCanExport } from './mixdown';
import { createAudioSession, createTrackFromFile } from './session';
import { capturedChunksToWav } from './record';
import { connectScheduledClip } from './graph';
import { scheduleClip } from './timeline';
import type { AudioSession, LaneKind, SessionTrack } from './types';

function track(seconds: number, kind: LaneKind = 'vocal', rate = 8000): SessionTrack {
  const file = new File(['fixture'], `${kind}.wav`, { type: 'audio/wav' });
  const lane = createTrackFromFile(kind, file, { preset: 'none', volume: 1 });
  const data = new Float32Array(Math.round(seconds * rate)).fill(0.2);
  data[data.length - 1] = 0.4; // Sentinel at the actual end, beyond the old cutoff.
  lane.clips[0].decoded = {
    duration: seconds, length: data.length, sampleRate: rate, numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
  return lane;
}
function session(...tracks: SessionTrack[]): AudioSession {
  return { ...createAudioSession(), tracks };
}
async function wav(file: Blob) {
  const bytes = new DataView(await file.arrayBuffer());
  const rate = bytes.getUint32(24, true);
  const channels = bytes.getUint16(22, true);
  const frames = bytes.getUint32(40, true) / channels / 2;
  assert.equal(bytes.byteLength, 44 + frames * channels * 2);
  assert.equal(bytes.getUint32(4, true), bytes.byteLength - 8);
  return { bytes, rate, frames, seconds: frames / rate,
    sample: (frame: number, channel = 0) => bytes.getInt16(44 + frame * channels * 2 + channel * 2, true) / 32767 };
}

async function run() {
  for (const seconds of [30, 120, 300, 900, 1800]) {
    const project = session(track(seconds));
    assert.equal(mixTakeDurationMs(project), seconds * 1000);
    const out = await wav(await renderSessionFile(project));
    assert.equal(out.seconds, seconds);
    assert.ok(out.sample(out.frames - 1) > 0.39, `${seconds}s: final sample must survive`);
    assert.ok(out.sample(Math.floor(out.frames / 2)) > 0.19);
  }
  // Full-duration stereo export also stays below Board's 250MiB audio cap.
  const stereo30 = await renderSessionFile(session(track(1800, 'instrumental', 24000)));
  assert.ok(stereo30.size < 250 * 1024 * 1024);
  assert.equal((await wav(stereo30)).seconds, 1800);

  const instrumental = track(300, 'instrumental');
  const instrumentalProject = session(instrumental);
  assert.equal(sessionCanExport(instrumentalProject), true);
  let out = await wav(await renderSessionFile(instrumentalProject));
  assert.equal(out.seconds, 300);
  assert.ok(out.sample(0) > 0.19, 'no empty vocal or leading silence');
  assert.ok(out.sample(out.frames - 1) > 0.39);

  instrumental.clips[0].trimInMs = 1000;
  instrumental.clips[0].trimOutMs = 4000;
  instrumental.mix.volume = 0.5;
  out = await wav(await renderSessionFile(instrumentalProject));
  assert.equal(out.seconds, 3);
  assert.ok(Math.abs(out.sample(100) - 0.1) < 0.001, 'trimmed instrumental volume');

  const vocal = track(5);
  const beat = track(12, 'instrumental');
  const adlib = track(1, 'adlib');
  adlib.clips[0].offsetMs = 15000;
  const project = session(vocal, beat, adlib);
  out = await wav(await renderSessionFile(project));
  assert.equal(out.seconds, 16, 'later ad-lib and longer instrumental survive');
  assert.ok(out.sample(8000) > 0.39, 'vocals and beat are mixed');
  assert.equal(out.sample(14 * 8000), 0, 'explicit gap preserved');
  assert.ok(out.sample(15 * 8000) > 0.19, 'ad-lib offset preserved');
  beat.mix.solo = true;
  out = await wav(await renderSessionFile(project));
  assert.equal(out.seconds, 12, 'solo defines audible export length');
  assert.ok(out.sample(8000) < 0.21);
  beat.mix.solo = false;
  beat.mix.muted = true;
  adlib.mix.muted = true;
  vocal.latencyMs = 200;
  out = await wav(await renderSessionFile(project));
  assert.equal(out.seconds, 4.8, 'latency compensation preserved');

  // Continuous limiter across block boundaries, with no saturated PCM samples.
  const loud = track(21, 'instrumental');
  loud.mix.volume = 1.5;
  loud.clips[0].volume = 1.5;
  const loudData = loud.clips[0].decoded!.getChannelData(0);
  loudData.fill(1);
  out = await wav(await renderSessionFile(session(loud)));
  assert.ok(out.sample(10 * 8000 - 1) < 0.981);
  assert.equal(out.sample(10 * 8000 - 1), out.sample(10 * 8000));

  let abortChecks = 0;
  await assert.rejects(renderSessionFile(session(track(30)), undefined, () => ++abortChecks > 4), /aborted/);
  const trimmedAway = track(10, 'instrumental');
  trimmedAway.clips[0].trimInMs = 10000;
  assert.equal(sessionCanExport(session(trimmedAway)), false);

  assert.equal(sessionCanExport(createAudioSession()), false);
  await assert.rejects(renderSessionFile(createAudioSession()), /no audible audio/);
  vocal.mix.muted = true;
  assert.equal(sessionCanExport(session(vocal)), false);
  await assert.rejects(renderSessionFile(session(vocal)), /no audible audio/);
  await assert.rejects(renderSessionFile(instrumentalProject, undefined, () => true), /aborted/);
  const broken = createTrackFromFile('instrumental', new File(['bad'], 'broken.wav'));
  await assert.rejects(renderSessionFile(session(broken), {
    decodeAudioData: async () => { throw new Error('invalid data'); },
  } as unknown as BaseAudioContext), /could not|decode|invalid|load/i);

  const recorded = await wav(capturedChunksToWav([
    new Float32Array(8000).fill(0.1), new Float32Array(8000).fill(0.2),
  ], 8000, 0.2));
  assert.equal(recorded.seconds, 2);
  assert.ok(recorded.sample(15999) > 0.87, 'chunked capture keeps normalization and final sample');

  const captureChunk = new Float32Array(8000 * 10).fill(0.2);
  const longCapture = await wav(capturedChunksToWav(Array(180).fill(captureChunk), 8000, 0.2));
  assert.equal(longCapture.seconds, 1800, '30-minute recording payload');
  assert.ok(longCapture.sample(longCapture.frames - 1) > 0.87);

  // Windowed effects scheduling retains source offsets and fade positions.
  const calls: unknown[][] = [];
  const param = () => ({ value: 0, setValueAtTime: (...a: unknown[]) => calls.push(a),
    linearRampToValueAtTime: (...a: unknown[]) => calls.push(a) });
  const node = () => ({ connect() {}, gain: param(), pan: param() });
  const source = { ...node(), start: (...a: unknown[]) => calls.push(['start', ...a]) };
  const ctx = { createBufferSource: () => source, createGain: node, createStereoPanner: node };
  const faded = track(30, 'instrumental');
  faded.clips[0].fadeOutMs = 5000;
  const scheduled = scheduleClip(faded, faded.clips[0])!;
  connectScheduledClip(ctx as unknown as BaseAudioContext, scheduled, node() as unknown as AudioNode,
    { window: { start: 27, end: 30 } });
  assert.ok(calls.some((c) => c[0] === 'start' && c[1] === 0 && c[2] === 27 && c[3] === 3));
  assert.ok(calls.some((c) => c[0] === 0.6 && c[1] === 0), 'fade envelope is not reset by a block');

  const stage = readFileSync('app/components/board/DropStudioStage.tsx', 'utf8');
  for (const [start, end] of [['const openVoiceStudio', 'const collapseVoiceStudio'],
    ['const setStudioInstrumental', 'const playStudioSession']]) {
    const body = stage.slice(stage.indexOf(start), stage.indexOf(end));
    assert.doesNotMatch(body, /getUserMedia|getMusicMicStream|startVocalRecording/);
  }
  assert.doesNotMatch(stage, /Record a vocal before mixing/);
  assert.match(stage, /!sessionCanExport\(audioSession\)/, 'publish button blocks empty projects');
  console.log('Voice Studio duration, WAV payload, instrumental, mixing, capture, effects scheduling and permission checks passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
