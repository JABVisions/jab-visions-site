# ANDERZONE pre-alpha

JAB Visions Board district. The hub is **ANDERZONE CENTRAL**. Personal rooms are **Home Pods**. Pets are **Dooboos**.

## Architecture audit

Inspected this Next.js App Router repo before adding files.

- Board pages live in `app/board`. `middleware.ts` already requires a Supabase session for `/board/:path*` unless the path is public (`lib/supabase/boardPaths.ts`). `/board/anderzone` is not public, so a configured Board project redirects strangers to `/board/login`.
- Explore is the client page `app/board/explore/page.tsx`. It already hosts Profile Galaxy, the Store Drop market, and Drop Pad OS. The Anderzone portal is an extra section. Drop Pad OS was not changed.
- Auth and RLS conventions are raw SQL files in `supabase/sql` plus route handlers that call `createServerClient` and `auth.getUser()`. There is no migration runner and no Colyseus process.
- The site deploys as Vercel serverless functions (`next.config.ts` is empty). A long-lived game room cannot live inside those functions.
- Phaser was not a dependency. It is now loaded only from the Anderzone client, with `ssr: false`, and `game.destroy(true)` runs on unmount.
- Colyseus was not added. A persistent Colyseus process is not compatible with this Vercel deploy. Local and external hosting use `npm run anderzone:server` (`ws` on `ANDERZONE_ROOM_PORT`, default 2567). Movement snapshots stay in that process. They are not written to Supabase.

No earlier Anderzone game, avatar, Home Pod, or Dooboo code existed. The comics page mentions Anderzone as mythology only.

## What this slice adds

| Area | Files |
| --- | --- |
| Rules, maps, pets, pods, room | `lib/anderzone/**` |
| Checks | `lib/anderzone/anderzone.check.ts` |
| Playable client | `app/board/anderzone/page.tsx`, `app/components/board/anderzone/**` |
| Explore portal | `app/board/explore/page.tsx` |
| Dark Board shell for the route | `app/board/layout.tsx` |
| Account save | `app/api/board/anderzone/**` |
| SQL | `supabase/sql/anderzone.sql`, `supabase/sql/anderzone_down.sql` |
| Room process | `server/anderzone/start.cjs`, `server/anderzone/listen.ts` |

Playable places: ANDERZONE CENTRAL (plaza, keeper, sign, Dooboo Adoption Center, Home Pod portal) and the starter Home Pod.

Defined and not enterable: Pixel Paradise, Whisper Woods, Outer Grid, Underground, Null Zone.

## Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Board project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Board anon key |
| `NEXT_PUBLIC_ANDERZONE_ROOM_URL` | Optional, e.g. `ws://127.0.0.1:2567` |
| `ANDERZONE_ROOM_PORT` | Room process port, default `2567` |

When Supabase is missing, the page plays with a browser-local draft and says so. The room process accepts a dev id only when Supabase is not configured. With Supabase configured, join requires a verified access token.

## Database

Run `supabase/sql/anderzone.sql` in the Supabase SQL editor. Undo with `supabase/sql/anderzone_down.sql`.

Tables: `anderzone_profiles`, `anderzone_regions`, `anderzone_furniture_catalog`, `anderzone_pods`, `anderzone_inventory`, `anderzone_dooboos`.

Owner writes are tied to `auth.uid()`. Pods default to `visitor_access = private`. `public` pods can be read by other signed-in players. `friends` is stored and not granted yet. The first profile load inserts one Starter Pod when `starter_pod_granted` is false. A unique `owner_id` on pods blocks a second pod.

High-frequency positions are not columns that the client streams into. Saved pet coordinates update only when a row is written.

## Room deployment

```bash
npm run anderzone:server
```

Point `NEXT_PUBLIC_ANDERZONE_ROOM_URL` at that process. On Vercel, run the same command on a long-lived host and set the public URL. Do not expect the Next.js deployment to keep the room alive.

## Manual checks

1. Apply the SQL, sign in, open Explore, and choose Enter ANDERZONE CENTRAL.
2. Walk with WASD, arrows, or the eight touch buttons. E or Use reads the sign, talks to the keeper, opens adoption, or takes the Home Pod portal.
3. Adopt one Dooboo, name it, then Feed, Play, Sleep, and Greet. A second free adoption is refused.
4. In the Home Pod, click a floor tile, place furniture, move, rotate, remove, undo, redo, cancel, and save.
5. Run two browsers against the room URL and confirm both names appear. Reload one tab and confirm it keeps its seat.
6. Turn on reduced motion in the OS and confirm the camera stops easing.

## Verification log

- `node scripts/run-board-checks.cjs lib/anderzone/anderzone.check.ts` passed.
- Typecheck of the Anderzone files passed. A stale generated type for a removed dev page was the only other `tsc` error and was deleted locally.
- Chrome at a phone size opened `/board/anderzone`, showed ANDERZONE CENTRAL, drew a canvas, moved east with the keyboard (x 112 → 172), and adopted Pip. The pet appeared beside the player. The page stated that the draft was local because Supabase is not configured here.
- A desktop view showed the pixel avatar and nameplate, the adoption-center door, the plaza sign, and the purple Home Pod portal. Explore still rendered Profile Galaxy plus the new portal.
- Two websocket clients joined `ws://127.0.0.1:2567` and both names were in the snapshot. A later rejoin of Bea was still at the spawn point after a far input.

Not verified, so not treated as done:

- The SQL has not been applied to the live Supabase project.
- Two signed-in Board accounts were not joined from browsers.
- A physical iPad was not used. The phone viewport and on-screen buttons were.
- The Home Pod portal and furniture tools were not clicked in the browser. Their rules passed the check file.
- Drop Studio, Work Boards, banking, and Drop Pad OS were not re-walked. Their files were not edited, except the Explore page gained a portal above the existing market.
