# BOARD — Refinement Audit

> Pre-implementation audit. No code changed for this document. Every claim below is
> grounded in the current codebase. The recurring theme: **most of these systems
> already exist** — the work is consistency, polish, and finishing stubs, not new
> invention.

Legend: ✅ exists & solid · 🟡 exists but inconsistent / needs polish · 🟠 exists but stubbed/partial · 🔴 genuinely missing

---

## 1. Drop Hierarchy Consistency — 🟡

**Current state**
- Canonical order is defined identically in two places:
  - `DropTile.tsx` → `["YouTube","Music","News","Link","Media","Pay","Doc","Thought"]`
  - `DropConsole.tsx` (line ~854) → `["youtube","music","news","link","media","pay","doc","thought"]`
- `ActivityCard.tsx` derives its label from `meta.dropType / drop_flavor` — it doesn't order, it just displays, so it inherits whatever it's given.
- **Divergence:** `DropPadOS.tsx` (and `.v2`, `.v3`) use a *different model* — `AssetKind = media | music | youtube | link | doc | note` ordered `[media, music, youtube, doc, link, note]`. This set drops `news`/`pay`/`thought` and renames `thought`→`note`.

**Gap**
- The two canonical surfaces agree; the DropPad surfaces are the only real inconsistency.
- Open question on the *ordering itself*: priority says "most commonly used creation tools first." Today link-ingest types (YouTube/Music/News/Link) lead, while the core creative Drops (Media/Vision, Thought) sit mid/late. That may be backwards for a Drop-centric, creation-first product.

**Recommended refinement**
- Extract a single shared constant (e.g. `DROP_FLAVOR_ORDER` in `lib/board/drops.ts`) and consume it in `DropTile`, `DropConsole`, and any DropPad surface still in use — single source of truth.
- Decide the canonical order once (recommendation: lead with **Vision/Media, Thought**, then Pay, then link-ingest types) and apply everywhere.
- Confirm which DropPad variant is live (`.v3` appears newest) and retire/realign the others rather than maintaining three.

---

## 2. Drop Removal — 🟡 (largely built)

**Current state**
- `RemovableDropBadge.tsx` exists: creator-only, hover (desktop) / long-press (mobile) on the Drop **type label**, slide-up reveal, red-glass styling. (Its half-stuck transition was fixed this session.)
- Wired in `ActivityCard.tsx` (line ~1054): `canRemove={isCurrentUserDrop}`, `onRemove={removeDropFromBoard}` — so the **Feed** already has correct creator-gated removal.
- `BoardWhispers` + `ActivityCard` are used by the profile activity views, so those likely inherit the same badge.

**Gap**
- `DropTile.tsx` (the composer / profile board grid) still renders a plain `Remove` text button (`drop-mini`, ~line 1980) instead of the `RemovableDropBadge` — inconsistent interaction model on that surface.
- Need to confirm the **Activity Channel** and **Profile activity** surfaces all route through `ActivityCard` (they appear to).

**Recommended refinement**
- Replace the `DropTile` grid `Remove` button with the same label-interaction `RemovableDropBadge` so all surfaces share one removal affordance.
- Verify `isCurrentUserDrop` ownership logic holds on profile views (it falls back to local identity when `authorUserId`/`currentAuthUserId` are absent).

---

## 3. Activity Channel Refinement — 🟡

**Current state**
- "Activity Channel" is used in `app/board/profile/page.tsx` and `profile/[username]/page.tsx` (tile titles, loading states).
- But the feed route (`app/board/feed/page.tsx`) calls it "Live feed" / `.feed`, and `DropTile`/`ProjectCenter` say "enter the **Feed**" vs "stays in your **Activity Channel**" in adjacent sentences.
- Forums deliberately uses "Rooms" (documented intent — leave alone).

**Gap**
- Mixed vocabulary: "Feed" vs "Activity Channel" for the same concept.

**Recommended refinement**
- Standardize user-facing copy to **Activity Channel** wherever the public/stream surface is meant (feed route header, DropTile/ProjectCenter hint text). Keep internal component names (`BoardNewsFeed`, `.feed`) as-is to avoid churn; only the *labels* need to align.

---

## 4. Mobile Feed Priority — ✅ (already done on feed route)

**Current state**
- `app/board/feed/page.tsx` already does this: at `@media (max-width: 980px)` it switches `.layout` to a column and sets `.dropConsoleSlot { order: 1 }`, `.feed { order: 2 }`, `.bucketSlot { order: 3 }`. Creation (Drop Console) sits **above** consumption on mobile.

**Gap**
- Confirm the **home board** (`app/board/page.tsx` / `BoardShell.tsx`) applies the same priority; the rule may only live on the feed route.

**Recommended refinement**
- If the home board doesn't mirror it, port the same `order:` stacking. Otherwise mark complete.

---

## 5. Universal Drop Descriptions — 🟡

**Current state**
- `DropItem` (DropTile) already carries `description`, and `addLinkDrop/addMediaDrop/addDocDrop/addPayDrop/addThoughtDrop` all persist a description (`dropDesc`/`payDesc`/`docDesc`).
- Render paths show description for media/link/thought; pay/doc have their own.

**Gap**
- The composer doesn't expose a description field uniformly — some flavors (e.g. YouTube/Music/News) reuse `dropDesc`, others have bespoke fields, and the input isn't always visible. Inconsistent presence rather than missing capability.

**Recommended refinement**
- Add one lightweight, optional "Add a description" field shared by every flavor in `DropConsole`/`DropTile`, persisted to the existing `description` field. Render as a subtle secondary line under the Drop title — no new layout, no clutter.

---

## 6. Comment Experience — ✅ (already action-oriented + drawer)

**Current state**
- `ActivityCard.tsx` already uses singular **"Comment"** (`title="Comment"`, label `Comment{count}`) and opens `DropCommentsDrawer` (a side/drawer with eyebrow "Drop Side Channel"); the drop stays visible behind it.
- `DropTile` also uses "Comment".

**Gap**
- Minor: confirm the drawer is consistent across all surfaces and that the count formatting/empty states feel native.

**Recommended refinement**
- Polish the drawer (`DropCommentsDrawer.module.css`) for the "side channel" feel; ensure the originating drop remains anchored/visible on mobile widths too. Largely complete.

---

## 7. Push System — 🟠

**Current state**
- Push deposits the drop into the Bucket Brain `push` folder (`ReactionRail`/`bucketBrain`), and `ActivityCard` renders a `pushedDrop` style + "Pushed by {name}" label when `meta.isPushed`.
- `lib/board/dropSignals.ts` and `powerBus.ts` exist for signal events.

**Gap**
- Push currently reads as "save to a bucket + a label" — close to a generic repost, which the brief explicitly wants to avoid. No amplification/redistribution visual semantics.

**Recommended refinement**
- Lean into **signal amplification**: on push, intensify the drop's Signal Aura / sonar treatment and surface a transient amplification animation; optionally bump visibility weighting in feed ordering. Keep it Drop-centric (amplifying the signal), not a "shared to your followers" repost frame.

---

## 8. Reaction Rail Polish — 🟡

**Current state**
- `ReactionRail.tsx` already applies the user's aura via `--reaction-aura` to **selected** Pass/Pin/Push (color, border, glow, text-shadow), reading aura from `board.options.v1` / profile.
- `ActivityCard` sets `--reaction-aura` on the card and has its **own inline rail** (PassGlyph/StarGlyph/ArrowGlyph + **Comment**).

**Gap**
- Two rail implementations (standalone `ReactionRail` vs the inline one in `ActivityCard`) risk drift. Need to confirm the inline rail's selected states + **Comment** use the same aura treatment; Comment is an action (not a toggle) so its aura affordance should be hover/active, not "selected."

**Recommended refinement**
- Unify on one rail or share the aura CSS; ensure Comment inherits aura on hover/active so aura identity is visible across all four actions consistently.

---

## 9. Vision Drop Studio — 🟡 (emoji stickers already exist)

**Current state**
- `DropStudio.tsx` already has tools: **text · stickers (emoji picker) · button · effects (FILTERS)**, and `dropCustomizations.ts` models `textLabels`, `stickers` (with a `type` field already defaulting to `"emoji"`), `actionButton`, and `effects.{filter,overlay}`. `DropStudioOverlay` renders them over the media.
- Capture/upload feeds the studio (`selectedMediaPreview` → `DropStudio`).

**Gap**
- The brief's "add emoji stickers" is essentially **already present**. The real opportunity is polish + future-proofing: the `sticker.type` field already allows non-emoji types, so BOARD-specific sticker packs are architecturally close.

**Recommended refinement**
- Polish the studio UI (drag/resize feel, layer list, mobile ergonomics), expand the filter/overlay presets, and formalize a `stickerPack` notion (id + asset set) on top of the existing `type` field so packs can be added later without schema change. Keep it artistic, not vanity-metric.

---

## 10. Pay Drop Refinement — 🟡 (capture already exists)

**Current state**
- `DropTile` Pay mode already supports **Upload + Capture** (`CameraDropPortal`), price, description, and provider chips: "Direct Request" (`authorize_net_accept_hosted`) / "Add Payment Link" (`payment_link`).
- Capture wiring (`setCameraMode("photo")`, `mediaSource: "capture"`, "Captured on Board" badge) is in place.

**Gap**
- The flow leads with **provider/processor chips** (transaction-first) before the human context (what you're asking support for). Button hierarchy reads financial, not expressive.

**Recommended refinement**
- Reorder the Pay composer so **capture/show-the-context** comes first, price/ask second, processor choice last (or tucked). Soften copy toward human-centered support language. No new mechanics — just hierarchy and tone.

---

## 11. Banking Settings — 🟠

**Current state**
- `OptionsClient.tsx` already has a **Banking** tab and `BankingPayDropsPanel`, with `bankingProfile.processor = "National Bank Card"`, `BankingStatus` states, payout-enabled flags, and a `connectBanking()` with a `// TODO: confirm National Bank Card supports marketplace payouts` stub.

**Gap**
- It's scaffolded but inert (payouts disabled, connect is a TODO). No bank-on-file capture, no trust/clarity framing.

**Recommended refinement**
- Flesh out the Banking panel: clear processor status, a simple "connect payout method" step, masked bank-on-file display (`bankName` + `bankLast4` fields already modeled), and trust copy. Keep it clarity-first; don't add processors.

---

## 12. Board Whispers — ✅ (exists) / 🟡 (integration)

**Current state**
- `BoardWhispers.tsx` + `whispers.ts` produce ambient, toned text rows (`createBoardWhisper({eventType})`), used in `ActivityCard`, profile pages, and `DropsBucket`. Already atmospheric, not alert/badge/popup.

**Gap**
- Integration into the **Activity Channel** could be more woven-in (currently sample-driven in places).

**Recommended refinement**
- Surface real, context-derived whispers inline within the Activity Channel cadence (between drops), tied to actual events (profile_view, drop_pin, friend_zone_activity). Keep them subtle and personal. Largely a wiring/polish task.

---

## 13. Store Drops — ✅ (refine)

**Current state**
- `StoreDropMarketplace.tsx`, `StoreDropTile.tsx`, `lib/board/storeDrops.ts` exist.

**Recommended refinement**
- Treat as polish: strengthen the "collectible digital artifact" presentation (tile framing, scarcity/edition cues if already modeled), marketplace browsing clarity, and profile collection integration. Preserve existing philosophy — no new commerce mechanics. (Deeper read recommended before editing.)

---

## 14. Thread Drops — ✅ (refine)

**Current state**
- `forums/ThreadDropTile.tsx`, `ThreadDropOverlay.tsx`, `ThreadDropPanel.tsx`, `RoomsPanel.tsx` implement Thread Drops within the Rooms/forums area.

**Recommended refinement**
- Strengthen the "entering a space" feeling on open (overlay transition, spatial framing) vs feeling like a comment list. Keep room for expansion. (Deeper read recommended before editing.)

---

## 15. FriendZone Orbs — ✅ (refine visuals)

**Current state**
- `FriendZoneOrb.tsx` + `FriendZoneOrb.module.css`, `FriendDropCell.tsx`, `app/board/friend-zone/` exist (note: there's also a legacy `friendzone/` route — possible duplication to reconcile).

**Recommended refinement**
- Visual-only: push iridescent, bubble-like, soft-glow, low-saturation treatment in the orb CSS. Reconcile `friend-zone` vs `friendzone` routes if both are live.

---

## 16. Overall Design Direction — ✅

Liquid Glass, Signal Auras, sonar/orb visuals, and Bucket Brain aesthetics are present throughout (aura CSS vars, glass surfaces, orb components). Direction is intact; keep refinements additive and avoid SaaS/social-media patterns.

---

## Suggested sequencing (highest leverage first)

1. **#1 Drop hierarchy** — single shared order constant; quick, removes cross-surface drift.
2. **#2 Drop removal** — bring `DropTile` grid onto `RemovableDropBadge` for consistency (feed already done).
3. **#8 Reaction rail** — unify the two rails + aura on Comment; small, high visibility.
4. **#3 Activity Channel naming** — copy alignment; low risk.
5. **#5 Descriptions** — one shared optional field.
6. **#10 Pay hierarchy** + **#11 Banking** — human-centered reorder + finish the stubbed panel.
7. **#7 Push amplification**, **#9 Studio polish/packs**, **#12 Whispers weaving** — the expressive depth work.
8. **#13–15 Store / Thread / FriendZone** — visual polish passes (read each fully first).

**Open questions for you**
- Canonical Drop order: keep link-ingest-first, or lead with Vision/Thought (creation-first)?
- Which `DropPadOS` variant is canonical (v1/v2/v3)?
- Is the home board (`/board`) in scope for the mobile creation-first order, or just the feed?
