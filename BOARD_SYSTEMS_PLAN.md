# Board — 5 Connected Systems: Plan, Schema, Files, Patches, Testing

Inspected the existing data flow first (per the constraint). No new drop types; Vision
drops remain Board Drops (image/video). Language kept: drops, Board Drops, Activity
Channel, Bucket Brain, signals, whispers, Store Drop Collection.

Status legend: ✅ done this pass · 🟡 patch specified below (needs apply/test) · 🗄️ needs Supabase

---

## 0. What already exists (so we reuse, not reinvent)

- `profiles` table with a JSON `board_style` column — already the home for avatar,
  aura color/intensity, and `boardDrops`. **Energy level and store collection can
  live here without a migration**, or in dedicated tables (both options below).
- `ActivityCard` already queries the live profile (`loadAuthorProfile`) for avatar,
  name, aura — we just had it prefer a stale snapshot.
- Board activity table (via `lib/board/activity.ts` `createActivity`) already powers
  **signals** (board_drop, etc.). Whispers are rendered by `BoardWhisper` /
  `BoardWhispers` from `lib/board/whispers.ts`.
- `lib/board/storeDrops.ts` — Store Drop Collection, currently **localStorage only**.
- `RemovableDropBadge` — creator-only red-glass slide-up label (hover/long-press),
  already wired into the feed and the profile grid.

---

## 1. Drop Tile profile pictures — ✅ DONE

**Root cause:** `ActivityCard.authorAvatarSrc` listed `meta.authorAvatar` (the avatar
snapshot baked into the drop's activity meta at creation) *before* the freshly
fetched Supabase profile avatar. After a user changes their picture, old drops kept
showing the old snapshot.

**Fix applied** (`app/components/board/ActivityCard.tsx`): reorder so the live
profile avatar wins; meta.* is only a pre-load fallback. `loadAuthorProfile` already
resolves `board-avatars` signed URLs / `avatar_url` from `profiles` by `user_id`, so
the feed, Activity Channel, and any surface using `ActivityCard` now show the current
picture. Initials only render when **no** Supabase image exists (unchanged).

`DropTile` (profile board grid) renders the current user's own avatar from the same
`board_style`/`board-avatars` path it already loads — consistent.

**Test:** change your avatar in Options/Profile → open feed + a profile with old
drops → every tile shows the new picture; a user with no image shows the initial.

---

## 2. Energy-level slider on the Profile Board snapshot — 🟡 (no migration)

Persist in `board_style.energyLevel` (0–100 int). No table change.

**Files:** `app/board/profile/page.tsx` (snapshot/identity section + profile state +
`sanitizeProfileForStorage`).

**Patch (add to the profile state shape + load):**
```ts
// in the profile state type/default
energyLevel: number; // 0–100
// default
energyLevel: 60,
// when hydrating from board_style:
energyLevel:
  typeof bs.energyLevel === "number" ? Math.max(0, Math.min(100, bs.energyLevel)) : 60,
// in sanitizeProfileForStorage(...) include:
energyLevel: profile.energyLevel,
```

**Slider UI (drop into the identity `<section className="inner-tile identity">`,
under `.profile-pills`):**
```tsx
<div className="energy-row" style={{ "--energy": `${profile.energyLevel}%` } as React.CSSProperties}>
  <div className="energy-head">
    <span className="energy-label">Energy</span>
    <span className="energy-value">{profile.energyLevel}</span>
  </div>
  <input
    className="energy-slider"
    type="range" min={0} max={100} step={1}
    value={profile.energyLevel}
    onChange={(e) => {
      const v = Number(e.target.value);
      setProfile((p) => ({ ...p, energyLevel: v }));
    }}
    onPointerUp={() => persistProfile()}   // reuse existing board_style save
    aria-label="Energy level"
  />
  <div className="energy-aura" aria-hidden />
</div>
```

**Styled-jsx (Board aesthetic — glowing track, no generic input):**
```css
.energy-row { margin-top: 12px; display: grid; gap: 6px; }
.energy-head { display: flex; justify-content: space-between; align-items: baseline; }
.energy-label { font-size: 10px; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; color: rgba(0,0,0,.55); }
.energy-value { font-size: 13px; font-weight: 950; color: var(--board-glow, #FF4FD8); text-shadow: 0 0 12px color-mix(in srgb, var(--board-glow,#FF4FD8) 45%, transparent); }
.energy-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 10px; border-radius: 999px;
  background: linear-gradient(90deg, var(--board-glow,#FF4FD8) var(--energy), rgba(0,0,0,.08) var(--energy));
  box-shadow: inset 0 0 10px rgba(255,255,255,.4), 0 0 16px color-mix(in srgb, var(--board-glow,#FF4FD8) 30%, transparent); outline: none; }
.energy-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #fff, var(--board-glow,#FF4FD8)); border: 1px solid rgba(255,255,255,.7);
  box-shadow: 0 0 14px color-mix(in srgb, var(--board-glow,#FF4FD8) 60%, transparent); cursor: pointer; }
.energy-slider::-moz-range-thumb { width: 20px; height: 20px; border: none; border-radius: 999px; background: var(--board-glow,#FF4FD8); box-shadow: 0 0 14px var(--board-glow,#FF4FD8); }
```
Set `--board-glow` from the user's aura color (already on the profile). The
snapshot updates live (the track fill + value are bound to state).

**Optional signal:** on `onPointerUp`, emit an `energy_change` board signal (see #3)
so it shows in the Activity Channel.

**Test:** drag slider → fill + number update instantly; reload → value persists
(check `board_style.energyLevel` in Supabase).

---

## 3. Bucket Brain whispers & signals in the Activity Channel — 🟡

Two halves, both reusing existing systems:

**Signals (real activity):** the profile Activity Channel already maps real
`board_drop` activity into `ActivityCard`. Extend the *kinds* surfaced to include the
existing Board actions: drops created, profile updates, **pushed drops** (already
`isPushed`), store interactions (#4), and **energy changes** (#2). Add a tiny helper
that emits a signal activity for these via the existing `createActivity` +
`emitBoardDropSignal` (already used for drops/pushes). No new activity table — reuse
`kind: "board_drop"` with `meta.signalType` so we don't invent types.

**Whispers (ambient, from real observations):** replace the static
`PROFILE_ACTIVITY_WHISPERS` array in `app/board/profile/page.tsx` with whispers
**derived from the user's actual recent activity** using the existing
`getBoardWhisper(eventType, seed)` bank in `lib/board/whispers.ts`. Map recent
activity → eventType:
```ts
function whisperEventFor(item: BoardActivity): BoardWhisperEventType | null {
  const t = item.meta?.signalType ?? item.meta?.dropType ?? item.kind;
  if (item.meta?.isPushed) return "drop_push";
  if (t === "Pay" || t === "store") return "drop_view";
  if (item.kind === "board_drop") return "drop_view";
  if (t === "profile_update") return "profile_view";
  if (t === "energy_change") return "drop_pin"; // soft, memory-toned
  return null;
}
// build: recentDrops.slice(0,6).map(d => createBoardWhisper({ id:`w-${d.id}`, eventType: whisperEventFor(d) ?? "quiet_day" }))
```
Render exactly as today (`<BoardWhisper>` between `ActivityCard`s) so the **floating
pastel note** look (BoardWhispers.module.css) is preserved — not notification boxes.

**Reliability:** the channel already falls back to whispers-only when there are no
drops; keep that. Ensure `recentDrops` includes the viewer's own drops (it queries
`profiles.board_style.boardDrops` + activity) so signals always appear.

**Schema:** none required (reuses the activity table + `board_style`). Optional: a
`board_signals` view/table later for cross-device durability.

**Files:** `app/board/profile/page.tsx` (whisper derivation), `lib/board/whispers.ts`
(add `energy_change` mapping if you want a distinct line), `lib/board/dropSignals.ts`
(emit on profile/energy/store events).

**Test:** create a drop, push a drop, change energy, bookmark a store drop → each
produces a signal card and/or a pastel whisper in the profile Activity Channel on
next load.

---

## 4. Store Drop Collection via Supabase + Explore — 🗄️ 🟡

**Supabase schema (run this SQL):**
```sql
create table if not exists public.store_drop_collection (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  drop_id     text not null,                 -- store drop identifier
  title       text not null,
  image_url   text,
  product_url text,
  price       text,
  artifact_no text,
  status      text not null default 'bookmarked'  -- 'bookmarked' | 'collected'
                check (status in ('bookmarked','collected')),
  created_at  timestamptz default now(),
  unique (user_id, drop_id)
);
alter table public.store_drop_collection enable row level security;
create policy "own rows read"   on public.store_drop_collection for select using (auth.uid() = user_id);
create policy "own rows write"  on public.store_drop_collection for insert with check (auth.uid() = user_id);
create policy "own rows modify" on public.store_drop_collection for update using (auth.uid() = user_id);
create policy "own rows delete" on public.store_drop_collection for delete using (auth.uid() = user_id);
```

**Plan:** make `lib/board/storeDrops.ts` Supabase-backed with the current
localStorage as an offline cache/fallback. Keep the exact same exported function
names so `StoreDropMarketplace`, the Explore page, and the profile collection don't
need shape changes.

**Patch shape for `lib/board/storeDrops.ts`** (add async Supabase fns; keep sync
local ones as cache):
```ts
import { supabaseBrowser } from "@/lib/supabase/browser";

export async function syncStoreDropCollection(): Promise<BoardStoreDrop[]> {
  const sb = supabaseBrowser();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return readList(STORE_DROP_COLLECTION_STORAGE_KEY);
  const { data } = await sb.from("store_drop_collection").select("*").eq("user_id", auth.user.id);
  const rows = (data ?? []).map(rowToDrop);                 // map columns -> BoardStoreDrop
  writeList(STORE_DROP_COLLECTION_STORAGE_KEY, rows.filter(d => d.status === "collected"));
  writeList(STORE_DROP_BOOKMARKS_STORAGE_KEY, rows.filter(d => d.status === "bookmarked"));
  return rows;
}

export async function persistStoreDrop(drop: StoreDropInput, status: StoreDropStatus) {
  const sb = supabaseBrowser();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) { /* fall back to local bookmark/collect */ return; }
  await sb.from("store_drop_collection").upsert({
    user_id: auth.user.id, drop_id: drop.id, title: drop.title, image_url: drop.imageUrl,
    product_url: drop.productUrl, price: drop.price, artifact_no: drop.artifactNumber, status,
  }, { onConflict: "user_id,drop_id" });
}

export async function removeStoreDropRemote(dropId: string) {
  const sb = supabaseBrowser();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return;
  await sb.from("store_drop_collection").delete().eq("user_id", auth.user.id).eq("drop_id", dropId);
}
```
Then `toggleStoreDropBookmark` calls `persistStoreDrop(drop, "bookmarked")` /
`removeStoreDropRemote(id)` in addition to the local write (optimistic UI).

**Explore wiring** (`app/board/explore/page.tsx` + `StoreDropMarketplace.tsx`):
- The bookmark/star control already toggles `toggleStoreDropBookmark`; now it
  persists to Supabase. Yellow star = `isStoreDropBookmarked(id)` (unchanged visual).
- On mount, call `syncStoreDropCollection()` so Explore reflects what's already
  collected/bookmarked across devices.

**Profile board collection** (`readStoreDropCollectionSlots` consumer): call
`syncStoreDropCollection()` on profile load; render the existing limited-slot
collection/table with the yellow-star bookmarked artifacts. Visual idea preserved.

**Files:** `lib/board/storeDrops.ts` (Supabase fns), `app/board/explore/page.tsx`,
`app/components/board/StoreDropMarketplace.tsx`, `StoreDropTile.tsx` (star already
exists), profile collection consumer in `app/board/profile/page.tsx`.

**Test:** bookmark a store drop in Explore → row appears in `store_drop_collection`
(Supabase) → shows with a yellow star in the profile Store Drop Collection → reload /
other device shows it; collected items fill the limited slots first.

---

## 5. Remove button layout on board drop tiles — ✅ DONE

**Root cause:** the profile grid's `.drop-badges` wrapper had `overflow: hidden` and
stretch alignment, clipping the `RemovableDropBadge` slide/glow and mis-sizing it next
to the taller ghost pills.

**Fix applied** (`app/components/board/DropTile.tsx`): `.drop-badges` →
`overflow: visible`, `align-items: center`, and the removable label gets
`flex: 0 0 auto` so it never shrinks/distorts. The label still slides into the red
REMOVE on hover (desktop) and long-press (mobile), creator-only, contained — no
overflow or clipping. The transition fix from earlier (translate by a fixed face
height) keeps the full "REMOVE" visible.

**Test:** hover (desktop) / press-hold (mobile) the drop-type label on your own
drops → it transforms into the red Remove pill fully inside the tile; not shown on
others' drops; long badges still wrap without breaking the tile.

---

## Summary of edits this pass
- `ActivityCard.tsx` — avatar now sourced from live Supabase profile (#1).
- `DropTile.tsx` — `.drop-badges` layout so Remove fits cleanly (#5).
- This document — full plan, SQL, file list, patches, and testing for #2/#3/#4.

#2, #3, #4 are specified as ready-to-apply patches + the one SQL migration (#4).
Recommended apply order: #2 (no migration) → #3 (reuses activity/whispers) → #4
(run SQL first, then the storeDrops Supabase layer + Explore/profile wiring).
