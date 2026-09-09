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
