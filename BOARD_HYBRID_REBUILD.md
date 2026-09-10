# Board Hybrid Rebuild — Feature Inventory

**Rule of this branch:** the current build is the visual baseline. Features are transplanted
from newer code as *logic*, not as layout. Nothing here should change page layout, spacing,
typography, colors, card/panel chrome, feed presentation, or Drop Pad appearance unless a
restored feature cannot function otherwise.

## Branch lineage

| Ref | What it is |
|---|---|
| `main` @ `55e22e2` | Deployed Board. Preferred aesthetic. |
| `3e19972` | `main` + finished Board systems (whispers, Stripe banking, Activity Channel rename). **Baseline for this branch.** |
| `board-lock-gate` @ `34a2f15` | Newer Board (Drop Studio 3, Dropbook editor, Drop Pad OS 4). **Organ donor.** |
| `board-hybrid-rebuild` @ `59f10cb` | Previous attempt: merged the donor wholesale, which replaced the preferred UI. Kept only as a donor worktree. |

`cursor/board-hybrid-rebuild-4486` branches from `3e19972` so the preferred aesthetic is the
starting point rather than something to be recovered later.

## A. Exists and works (do not touch)

- Drop Studio shell: `choose → capture → edit` phases, `studioStage / studioSheet / capStage /
  capTopBand / capMain` layout, mode rail, 4:5 chip monitor (`DropChipWorkbench`).
- Capture modes: Vision (photo), Video, Voice (audio), Art, Descript.
- Art: `BoardArtCanvas` with paint / blend (smudge) / erase, brush size, colour wheel + swatches,
  light slider, undo/redo/clear, paper-dark toggle, palette deck (`DropStudioPaletteDeck`),
  draw-on-photo via `DropStudioArtPalette` (`artOverlayUrl`).
- Descript: `DescriptStudio` launcher/editor, templates, import, rich toolbar, outline nav,
  localStorage autosave, share-to-destination.
- Dropbook in-session UX: Start a Dropbook, 1.8s title splash, 4:5 chip shelf, Cover chip,
  drag a page onto the cover, blank/colour/drawable covers, glowing orbit rings on mode rail.
- Voice: mic `MediaRecorder`, `VocalVisualizer`, `VoicePresets` (5 presets, playback-time FX).
- Drafts: `lib/board/dropDrafts.ts` + `DropDraftsDrawer` (localStorage, revision `count`).
- Drop Pad OS: power/boot phases, crown standby, orb home with 7 orbit bubbles, Assets /
  Portfolio / Projects / Board Drops / Work Calls / Profile Drops / Store Drops screens,
  Supabase `board_assets` sync.
- Supabase: `profiles`, `board_assets`, `board_activity`, `board_drops`, `board_posts`,
  `store_drop_collection`, `pay_drop_payments`, `pay_drop_accounts`, `music_links`;
  buckets `board-media`, `board-avatars`, `board-images`.

## B. Exists but incomplete

| Feature | Gap |
|---|---|
| Dropbook persistence | In-memory only. Closing Drop Studio loses the shelf. |
| Dropbook completion | `done()` appends to the shelf but there is no "place this book" exit. |
| Dropbook cover "Use Existing Drop" | Only flashes a hint; no picker. |
| Dropbook page re-edit | Chip click reopens media/descript, but link pages don't exist yet. |
| `DropItem.draftCount` | Field is typed; nothing ever writes it. |
| `getDropDraftTotal()` / `getDropDraftCount()` | Implemented, never called. |
| Drop Studio `drawOpen` | Branch renders, but `setDrawOpen(true)` is never reachable. |
| Drop Pad Work Space | Assets/Portfolio exist as separate screens, not as a spatial Work Space. |

## C. Existed in newer code, missing here

| Missing | Donor source |
|---|---|
| Dropbook persistence engine | `lib/board/dropbookProgress.ts` (561 lines, local + `profiles.board_style.dropbookProgress`) |
| Link resolution for studio | `lib/board/studioLinks.ts` |
| Link entry as a Dropbook page type | `DropStudioStage` `phase === "link"`, `commitStudioLink` |
| Voice Studio (multi-track booth) | `VoiceStudio.tsx` + `voiceStudio.module.css` |
| Standalone voice memo recorder | `VoiceRecorder.tsx` |
| Shared Drop Pad asset writer | `lib/board/dropPadAssets.ts` |
| `dropbook` asset kind + tile | `dropPadShared.ts`, `dropPadTiles.tsx` |
| Drop Pad spatial spaces | `DropPadOS.tsx` `SpatialSpace` pager + overlays |
| Activity Channel inside Drop Pad | `DropPadActivityChannel.tsx`, `lib/board/activityChannel.ts` |
| Bucket Brain inside Drop Pad | `DropPadBucketBrain.tsx`, `lib/board/boardSignals.ts` |

## D. Requires reconstruction (no working prior art)

- Trimming: neither build trims recordings, imported audio, or ad-libs.
- Ad-Libs Sound Bar as an editable clip rack (donor only stacks takes).
- Vocal alteration presets beyond the 5 playback presets, and a Voice button beside Record.
- Draft Count increment on substantial edit + successful republish.
- Drop lifecycle `Framed → Sent → Asset / Portfolio`. No enum exists in either build; the donor
  only routes assets to three localStorage buckets.

## Order of work

1. Dropbook engine + persistence
2. Dropbook links + place-into-assets
3. Voice Studio (record / instrumental / ad-libs / trim / presets)
4. Drop Studio gaps + Draft Count
5. Drop Pad OS spaces + drop lifecycle

---

# Outcome

Every item in B, C and D above is now closed. The visual baseline was not touched: the orb home,
the Drop Studio shell, the mode rail, the feed, and the profile board all render exactly as they
did on `3e19972`.

## Dropbook

`lib/board/dropbookProgress.ts` and `lib/board/studioLinks.ts` were ported from the donor. The
shelf now autosaves on a 450 ms debounce (title colour, cover, page order, page IDs, media
references, link metadata) to `localStorage` with a mirror in
`profiles.board_style.dropbookProgress`, media going to the existing `board-media` bucket.
Reopening Start a Dropbook hydrates whichever copy is newer.

The link bar renders only after Dropbook Mode has started, above the Dropbook controls. YouTube,
News, Music and generic links resolve into real Dropbook pages, with a live preview while typing.
The Place control hands the finished book to its host through `onCompleteDropbook`; Drop Console
writes it into the Assets bin via `lib/board/dropPadAssets.ts`. Place is only rendered where a host
supplied that callback, so it is never a dead button. Drop Pad OS gained a `dropbook` asset kind
and a tile that pages through the book.

`useExistingDropAsCover` replaced the hint-only cover button: it promotes the newest shelf page, or
opens a picker when no visual page exists yet.

## Voice Studio

This is the **Recording Booth from `cd5d935`, restored byte for byte** — `VoiceStudio.tsx` and
`voiceStudio.module.css` are identical to that commit, and the `DropStudioStage` wiring matches it
too. A rewritten booth briefly replaced it on this branch; the original was preferred and put back.

Voice mode opens the booth directly (no intermediate capture screen and no Studio button):

- Load an instrumental (mp3 / wav / m4a), play and pause it, or Replace it.
- Record Lead over the beat — the beat restarts from the top each take so layers align — then
  Re-record Lead or stack Add Adlib takes.
- The Session list shows every take as BEAT / LEAD / ADLIB with its duration, Mute, and Remove.
- **Mix & Use Vocal →** renders the stack to a WAV through `OfflineAudioContext` and hands it to
  the existing audio Drop pipeline. The instrumental sits at 0.72 gain and ad-libs at 0.92 so leads
  cut through.
- The review screen that follows reads VOICE STUDIO MIX READY and runs the existing `VoicePresets`
  over the mixed result, which is where vocal alteration lives in this design.

An instrumental is required before recording, by design — this is a booth, not a memo recorder.

Deliberately **not** in this version (they were in the rewrite that was reverted): trimming takes
or imported audio, an Ad-Libs Sound Bar with per-clip audition and trim, per-track placement
offsets, waveform-accurate peak rendering, a preview-the-mix step before saving, and an in-booth
preset grid. These remain open if the booth should grow; they need to be added in this UI's idiom
rather than by replacing it.

## Drop Studio gaps

The `drawOpen` branch — a fully built draw-on-photo and video-overlay editor with no entry point —
is now reachable from a **🎨 Draw** control in the edit actions.

## Draft Count

`lib/board/draftCount.ts` compares media, copy, customizations, visibility, price and links before
and after an edit. `withDraftCount` stamps the increment onto the payload that
`BoardDropEditModal` is about to persist, so opening the editor, cancelling, or a failed save can
never inflate it.

## Drop Pad OS spaces

The orb home is now the centre of a five-place environment: Activity Channel up, Bucket Brain
down, Free Space left, Work Space right. Panes sit in a cross and the whole layer translates, so
every space slides within the same holographic screen instead of looking like a separate page.
Swipe, arrow keys and a chip row in the OS header all navigate.

The chip row lives in the header rather than floating over the orbs — the screen is user-resizable,
so anything pinned inside the orb area can scroll out of reach and crowd the bubbles.

`DropPadActivityChannel` and `DropPadBucketBrain` were ported and render in their `zone` layout
against the baseline's existing `activity`, `dropComments`, `bucketBrain` and `whispers` data.
Free Space is a glance (clock plus counts). Work Space exposes Assets and Portfolio with a route
into the full screens, deliberately left uncluttered for a dedicated Drop Pad OS 4 design.

## Profile boards

Both profile boards are back on the **three-column layout from before `7a0358a`**
("Restore Drop Studio and refine profile board"), which is the commit that had replaced it with a
two-column `grid-template-areas` arrangement.

That commit did not move any markup — it set `display: contents` on the three column wrappers and
reordered everything through named areas, which put a new `identity` tile in the top-left and
pushed Vision Wall and Cover Poster down to the second row. Reverting is therefore CSS-only: the
column wrappers are real grids again, `.profile-grid` is back to three tracks, and the
`grid-area` hook classes that `7a0358a` added to each `<section>` are removed. Section markup now
matches the pre-`7a0358a` build exactly.

Restored arrangement, own profile (`app/board/profile/page.tsx`):

| Column | Tiles |
|---|---|
| Left | Vision Wall, then the Board Drop tile |
| Centre (wider) | Identity, Aura Snapshot, Activity Channel |
| Right | Cover Poster, Board Bookmarks, Store Drops Collection |

Restored arrangement, public profile (`app/board/profile/[username]/page.tsx`):

| Column | Tiles |
|---|---|
| Left | Vision Wall, Aura Snapshot, Board Drop |
| Centre (wider) | Identity, Activity Channel |
| Right | Cover Poster, Friend Zone, Drops Bucket |

Track widths are the pre-`7a0358a` values:
`minmax(280px, 0.95fr) minmax(340px, 1.2fr) minmax(280px, 0.95fr)` on the own profile and
`minmax(0, 0.95fr) minmax(0, 1.15fr) minmax(0, 0.95fr)` on the public profile. The responsive
ladder is restored too — two columns with the centre spanning both at ≤1180 px, one column at
≤980 px — while the newer ≤720 px tweaks (tighter gap, centred identity row) are kept.

Note: no literal `3/5` ratio exists anywhere in this repo's history. Searching every commit for
`3fr`, `5fr`, `3 / 5`, `aspect-ratio: 3`, `0.6fr` and `62.5%` in the profile files returns nothing,
so the three-column build above is the layout being referred to. If the outer columns should
specifically sit at three-fifths of the centre, that is the `0.95fr` value in each
`.profile-grid` rule and nothing else.

## Drop lifecycle

`lib/board/dropLifecycle.ts` models `Framed → Sent → Asset Drop / Portfolio Drop`. `advanceDropStage`
never regresses a sent drop back to framed, and Asset/Portfolio are siblings so a drop can move
between them. Drop Console stamps `sent` on publish, `BoardDropEditModal` keeps it on republish,
and `placeAsset` promotes to `asset` or `portfolio`. The stage rides inside the existing
`board_assets.payload` and `board_style.boardDrops` JSON, so no migration was needed.

## Supabase

No schema changes. Everything reuses existing storage: `profiles.board_style` (drops, dropbook
progress), `board_assets` (assets, with the stage inside `payload`), and the `board-media` bucket.
No table was dropped, no RLS policy was touched, and no existing user data is rewritten.

## Verification

`tsc --noEmit` and `next build` pass. The repo has no ESLint config, so `next lint` only offers to
create one; adding it would be an unrelated change.

Checked in a browser against a dev server (desktop): Drop Pad standby crown, boot, orb home
unchanged, all five spaces sliding in the same frame with no overlapping controls at the smallest
and largest screen sizes; Drop Studio mode rail; link bar absent before Dropbook Mode and present
above the Dropbook controls after it; cover save; YouTube link resolving to a preview and then to a
shelf chip; Place present; and Voice mode opening straight into the restored Recording Booth with
its instrumental upload card, Record Lead / Add Adlib controls, empty Session list and
Mix & Use Vocal footer.

Not verified: a 390×844 mobile viewport (the VM's browser would not resize), and microphone-driven
recording, playback and mixdown (no audio input device). Mobile layout rests on the responsive
rules added alongside each surface — the link bar is a `minmax(0, 1fr)` four-column grid, the booth
collapses to single-column controls under 520 px, and the header chip row wraps.
