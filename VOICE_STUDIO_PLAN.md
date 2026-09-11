# Voice → Studio Mode — Technical Plan

Status: **Phase 2 in repo** — Studio unfolds from Voice; mixdown still publishes one Audio Drop file.
Voice Mode (no Studio tap) is unchanged.

Source of truth for implementation.

Product constraint (locked):
- **Voice** stays the fast recorder. Tap, speak, post.
- **Studio** is not a separate mode in the picker. A **Studio** button unfolds Voice in place.
- A 15-second Thought Drop must never open onto a mixing console.

---

## 0. Thesis

Voice Mode currently treats audio as a **recording**: one blob, one waveform, one
preset baked at export (`renderVoicePresetFile`). Studio Mode treats audio as a
**session**: multiple lanes, independent control, monitor-while-record, then a
single mixdown File that existing Drop publish paths already understand.

The published artifact stays an **Audio Drop** (Music / Thought voice / Pay audio).
The session is the editor state. The mixdown is the drop.

---

## 1. What already exists (reuse, do not reinvent)

| Piece | Where | Role in Studio |
| --- | --- | --- |
| Single-track capture | `DropStudioStage` `startVocalRecording` | Voice Mode stays here unchanged |
| Channel strip graph | `lib/board/voicePresetAudio.ts` | Per-track FX + mixdown building block |
| Frozen presets | `VOICE_PRESET_SETTINGS` | Seed of Clean / Warm / Radio / Concert / Dream |
| Offline bounce | `renderVoicePresetFile` | Pattern for N-track `renderSessionFile` |
| Preview rack | `VoicePresets.tsx` | Voice-level UI; Studio gets a different surface |
| Visualizer | `VocalVisualizer.tsx` | Keep for Voice; Studio lanes need real peak-data waveforms |
| Publish | `onComplete(file, source)` | Unchanged. Studio still emits one `File` |
| Upload limits | `lib/board/uploadLimits.ts` | Audio 150MB per imported file |

The graph already implements: HP/LP (clarity + noise floor), EQ shelves/peak
(tone), compressor, saturation, reverb, delay/echo, master gain. Playback-rate
is currently used as “pitch” and **must not** be exposed as pitch (it changes
speed). Independent pitch / Auto-Tune is a later phase.

`DropStudioStage.tsx` is already ~2100 lines across five modes. Studio must not
become a sixth branch inside that file.

---

## 2. Disclosure model

```
Voice (default)                    Studio (unfolded)
─────────────────                  ─────────────────
[visualizer]                       VOICE STUDIO   00:21 / 01:48
[Record]                           VOCALS lane
[Upload]                           INSTRUMENTAL lane
[presets after take]               + Audio
                                   [Record over beat]
        [ Studio ]  ─────────────► [simple track controls]
```

Rules:
- Studio button is visible in Voice capture and Voice review.
- Unfolding Studio does not discard the current take. The recording becomes the
  Vocals lane.
- Collapsing Studio does not destroy the session. If a second track exists,
  collapsing is disabled or confirms “this session has multiple tracks.”
- Thought Drops that never tap Studio never see lanes, pan, or FX drawers.

---

## 3. Target file layout

Keep `DropStudioStage` as the shell (choose / camera / Voice shutter / Done).
New code lives beside it:

```
lib/board/audioSession/
  types.ts              session, track, clip, lane kind
  graph.ts              wrap existing VoicePresetNodes per track
  engine.ts             playhead, transport, record-into-lane, latency offset
  mixdown.ts            OfflineAudioContext bounce of all unmuted tracks
  latency.ts            measured offset + per-device cache

app/components/board/
  VoiceStudioSession.tsx     unfold surface (lanes + transport)
  VoiceStudioLane.tsx        one track row
  VoiceStudioAddDrawer.tsx   Upload · Board Audio · Record · Samples
```

Do **not** put the Web Audio graph in a React component. Engine is headless.
UI subscribes to playhead / meters / track list.

---

## 4. Session data model

In-memory while editing. Persist as a draft JSON + per-clip blobs only if we
need resume-after-reload (phase 3). v1 can live in component/engine refs.

```ts
type LaneKind = "vocal" | "instrumental" | "audio" | "fx";

type TrackClip = {
  id: string;
  file: File;            // original, never mutated
  decoded?: AudioBuffer; // cached
  offsetMs: number;      // start on timeline
  trimInMs: number;
  trimOutMs: number;     // exclusive; duration = trimOut - trimIn
};

type TrackMix = {
  volume: number;        // 0–1
  pan: number;           // -1..1
  muted: boolean;
  solo: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  preset: VoicePresetKey | "airy" | "deep" | "stage" | "raw" | "none";
  // later: per-knob overrides on top of preset
};

type SessionTrack = {
  id: string;
  kind: LaneKind;
  label: string;
  clips: TrackClip[];    // v1: one clip per track
  mix: TrackMix;
  latencyMs: number;     // applied only to recorded (not imported) clips
};

type AudioSession = {
  id: string;
  sampleRate: number;
  tracks: SessionTrack[];
  playheadMs: number;
  loop?: { inMs: number; outMs: number };
};
```

**v1 clip rule:** one clip per track. Trim/move exist. Split is phase 2 (it
forces a clip array and a real timeline hit-tester).

Mixdown output: one `audio/wav` File, same as today’s preset bounce, so
`onComplete` / storage / feed players do not change.

Optional later publish metadata (not required for v1 playback):

```ts
type AudioDropExtras = {
  coverUrl?: string;     // from Art Mode
  lyrics?: string;       // from Descript
  credits?: string;
  description?: string;
  sessionTrackCount?: number;
};
```

These extras ride on the existing drop `description` / `fromDescript` / art
overlay paths. Do not invent a new drop type.

---

## 5. Audio engine

### 5.1 Playback graph (live)

For each unmuted track (honoring solo):

1. BufferSource or MediaElementSource for the clip
2. Existing `connectVoicePresetGraph` + `applyVoicePreset`
3. Extra nodes **after** master of that track: `StereoPannerNode`, fade
   automation on a gain node, then into a shared bus

Transport:
- One `AudioContext` for the session
- Play starts all scheduled sources at `ctx.currentTime + lookAhead` with
  `offset` = playhead mapped into each clip
- Record lane uses `MediaRecorder` **and** a live tap into the visualizer

### 5.2 Record-over-instrumental (the differentiator)

This is the riskiest slice and the first real Studio build after the engine
skeleton.

Must-haves:
1. **Music-mode getUserMedia** — disable browser “help”:

```ts
getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
});
```

Voice Mode (simple recorder) keeps the current `{ audio: true }` defaults.
Those defaults duck vocals when a beat is playing; that is why Studio cannot
reuse `startVocalRecording` as-is.

2. **Headphones required** before armed record, with a one-line warning.
   Speaker monitoring will bleed the beat into the vocal lane.

3. **Latency offset.** Vocal arrives late relative to the instrumental
   (often 100–300ms, device-dependent). Store `latencyMs` on the recorded
   track. Apply at mixdown by shifting the vocal clip earlier.
   Calibration v1: “tap on the snare” or a 3-beep count-in whose known
   time is subtracted from the recorded take. Cache last offset in
   `localStorage` per device.

4. **Count-in + pre-roll.** 1 bar (or 3 seconds) of instrumental before
   punch-in, so the performer is not recording from silence.

5. **Monitoring mix.** Instrumental in headphones at user volume. Live
   vocal optionally in headphones at low level. Never route headphone mix
   back into MediaRecorder.

### 5.3 Mixdown

`renderSessionFile(session): Promise<File>`:
- `OfflineAudioContext` sized to max track end + reverb tail
- Same graph as live, no MediaRecorder
- Skip muted tracks; if any track is solo, skip non-solo
- Apply `latencyMs` and fades
- WAV encode via existing `audioBufferToWav` (extract it from
  `voicePresetAudio.ts` so both paths share it)

Timeouts: keep the existing decode/render timeout pattern. A 4-minute
session will need a longer cap than today’s 45s voice-memo render.

### 5.4 Pitch / Auto-Tune

Out of v1–v2. Document as a later research track (AudioWorklet pitch
shifter or WASM). Do not reuse `playbackRate`.

---

## 6. UI

### 6.1 Voice (unchanged)

Current monitor + shutter + `VoicePresets` review. Add one control:
`Studio` text button near Save / Drafts / Use this Vocal.

### 6.2 Studio monitor

Keep Drop Studio’s 4:5 operating table. Do not go full-screen DAW.

```
VOICE STUDIO              00:21 / 01:48
──────────────────────────────────────
VOCALS
  [waveform from peaks]
  Vol  Tone  FX
INSTRUMENTAL
  [waveform]
  Vol  Trim  Fade  FX
[+ Audio]
            [ ● RECORD ]
```

Lane controls stay chips/drawers, not frequency graphs. Preset chips:

| Key | Intent | Seed |
| --- | --- | --- |
| Clean | current `clean` | exists |
| Warm | current `warm` | exists |
| Airy | new; closer to current `dream` highs | new settings object |
| Deep | new; more low shelf, less air | new |
| Radio | current `radio` | exists |
| Dream | current `dream` | exists |
| Stage | new; closer to `concert` | rename/alias concert |
| Raw | new; bypass most FX, light HP only | new |

Per-lane **FX** drawer (phase 2): volume, pan, fade in/out, preset.
Do not show compressor ratio or Hz values in v1.

### 6.3 + Audio drawer

`Upload File · Board Audio · Record · Samples`

- Upload: same `checkUploadSize` audio 150MB path
- Board Audio: picker of current user’s audio `boardDrops` (signed URL → File)
- Record: arms a new vocal/ad-lib lane
- Samples: stub in v1 (empty state “Coming to Drop Studio”) unless a small
  bundled pack is trivial

Choosing an instrumental **immediately** creates the Instrumental lane and
keeps the current vocal.

### 6.4 Timeline interactions (phased)

| Action | v1 | v2 |
| --- | --- | --- |
| Mute / solo | yes | yes |
| Volume | yes | yes |
| Trim ends | yes (clip handles) | yes |
| Move on timeline | yes (offsetMs) | yes |
| Split | no | yes |
| Multiple clips / lane | no | yes |
| Automation curves | no | later |

Waveforms: precompute peak min/max per pixel from `AudioBuffer` once per
clip. Do not use `VocalVisualizer`’s decorative oscillator for lanes.

---

## 7. Mode handoff (Drop Studio as one product)

Studio does not replace Art / Descript. It sequences them.

1. Mixdown in Studio → still in Drop Studio, file is the session bounce
2. **Art Mode** — user can open draw-on-cover with the audio remaining the
   drop media; cover becomes `previewImage` / art overlay, not a replacement
   of the audio file
3. **Descript** — lyrics/credits as HTML/text attached via existing
   `fromDescript` or description body
4. **Dropbook** — optional later: cover page + audio page + lyrics page
   using the existing 4-page Dropbook shelf

Handoff rule: switching modes must not destroy the `AudioSession`. Keep it
in a ref on `DropStudioStage` until `onComplete` or discard.

v1 handoff can be linear buttons: `Add cover` / `Add lyrics` after mixdown,
not a full persistent session across unmounts.

---

## 8. Publish contract

Downstream players (`VoiceDropSoundboard`, feed, profile) keep taking **one
src**. They never load a session.

v1 publish = mixdown File + existing metadata (title, description, flavor).

v2 extras (cover, lyrics) use fields already on drops. No schema migration
required if they stay in `description`, `previewImage`, and `fromDescript`.

---

## 9. Build phases

### Phase 0 — Plan (this document)

Locked product rules and file boundaries.

### Phase 1 — Headless engine (no DAW UI) — in repo

- Extract `audioBufferToWav` + shared graph helpers — `lib/board/audioSession/wav.ts`, `createVoicePresetNodes`
- `AudioSession` types — `lib/board/audioSession/types.ts`
- Play two buffers with independent volume/mute — `AudioSessionEngine`
- `renderSessionFile` mixdown of two tracks — `mixdown.ts` (`mixTwoFiles` debug hook)
- Timeline math check: `npx tsx lib/board/audioSession/timeline.check.ts`

Exit: a test or a tiny debug hook can mix vocal+beat to a wav. `mixTwoFiles(vocal, beat)` is the hook; full OfflineAudioContext bounce still needs a browser.

### Phase 2 — Record over instrumental — in repo

- Studio unfold button on Voice capture + review
- Two lanes: Vocals + Instrumental (`VoiceStudioSession`)
- + Audio drawer: Upload · Board Audio · Samples stub
- Music-mode mic (`MUSIC_MIC_CONSTRAINTS`) — not Voice `getUserMedia({audio:true})`
- Headphones acknowledgement before recording over a beat
- Latency slider (persisted, applied as `track.latencyMs`)
- 3-second count-in while the instrumental plays
- Mixdown through existing `onComplete` (`Mix to Drop →`)

Exit: upload a beat, record a vocal in headphones, bounce, post an Audio Drop.

### Phase 3 — Presets + simple mix controls

- Airy / Deep / Stage / Raw
- Per-lane volume, mute, solo, pan, fade in/out
- FX drawer with presets only (no graphs)

### Phase 4 — Timeline craft

- Trim / move
- Split + multiple clips
- Peak waveforms
- Optional loop region

### Phase 5 — Cross-mode session

- Keep session while opening Art / Descript
- Cover + lyrics on the published Audio Drop
- Optional Dropbook export

### Phase 6 — Later research

- Auto-Tune / independent pitch
- Samples library
- Collaborative sessions
- Podcast markers / ADR

---

## 10. Non-goals (keep Drop Studio from becoming Ableton)

- No piano roll, MIDI, or tempo map in v1–v4
- No plugin format (VST)
- No unlimited track count — cap at 4 lanes (vocal, instrumental, audio, fx)
- No live input monitoring through speakers
- No destructive editing of original files
- No new public drop type

---

## 11. Risks

| Risk | Why | Mitigation |
| --- | --- | --- |
| Echo cancellation ducks vocals | Default `getUserMedia({audio:true})` | Separate music constraints; don’t reuse Voice capture |
| Latency makes takes unusable | Variable 100–300ms | Per-track offset + device cache; expose a nudge control |
| iOS AudioContext / mic conflicts | Safari quirks already seen in preset render | One context; resume on user gesture; keep Voice path untouched |
| Mixdown timeouts | Long sessions vs 45s voice timeout | Scale timeout with duration; show progress |
| Stage file bloat | 2100-line DropStudioStage | Strict file split listed in §3 |
| Thought Drop UX regression | Mixing console on 15s takes | Unfold-only; Voice default unchanged |

---

## 12. Testing

Phase 2 must be proven on a real phone with headphones, not only desktop:

- Record 10s vocal over a known beat; bounced wav vocal onset vs beat
  grid should be within ~30ms after offset
- Mute instrumental → bounce is vocal-only
- Solo instrumental → bounce is beat-only
- Voice Mode (no Studio tap) still posts a single-track thought with
  current presets
- Oversized import still hits `checkUploadSize` (150MB audio)
- iOS: music-mode mic + headphone playback does not mute the beat

---

## 13. Implementation trigger

Do not start Phase 1 until this plan is accepted. First code to write:

1. `lib/board/audioSession/types.ts`
2. Extract wav + graph helpers
3. `mixdown.ts` for two files

UI and the Studio button wait until two files can be mixed headlessly.
