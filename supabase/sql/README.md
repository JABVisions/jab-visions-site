# Board SQL

One file per table. Each is idempotent (`create table if not exists`, `drop policy if exists`
before every `create policy`), so re-running one is safe and never drops data.

Apply a file by pasting it into Supabase Dashboard → SQL Editor → Run, against the Board project.

| File | Table | Needed for |
| --- | --- | --- |
| `board_auth_profiles.sql` | `profiles` | Everything: auth, identity, `board_style` blob |
| `board_drop_comments.sql` | `board_drop_comments` | Comments on drops |
| `board_direct_messages.sql` | `board_direct_messages` | DMs |
| `board_glitch_reports.sql` | `board_glitch_reports` | Glitch reporting |
| `board_store_drop_collection.sql` | `store_drop_collection` | Store Drop bookmarks/collection syncing across devices |
| `board_pay_drop_payments.sql` | `pay_drop_payments` | Stripe webhook fulfillment records |
| `board_pay_drop_accounts.sql` | `pay_drop_accounts` | Stripe Connect payout capability flags |
| `board_music_links.sql` | `music_links` | My Music links |

`board_activity`, `board_drops`, `board_posts`, `board_assets` and `posts` have no file here —
they predate this directory and already exist on the project.

## Degradation

Not every table is load-bearing, which is why the app can run against a partially migrated
project:

- `store_drop_collection` — `lib/board/storeDrops.ts` wraps every call in try/catch, so a missing
  table silently falls back to the `localStorage` cache. The collection just stops following the
  user between devices.
- `pay_drop_accounts` — the webhook explicitly ignores a missing-table error.
- `music_links` — **not** graceful. `MyMusicModule` surfaces the Postgres error straight into its
  error banner, so a missing table shows the user a raw `PGRST205` message.
- `pay_drop_payments` — only reached when Stripe is configured and a checkout completes.

## RLS

Every table here enables row level security. The pattern is four owner-scoped policies keyed on
`auth.uid() = user_id`.

Two files deviate deliberately, and the comments in them explain why: `pay_drop_accounts` has no
policies at all (service-role writer only), and `pay_drop_payments` has no read policy yet because
`recipient_account` is not consistently populated from Connect account ids.

`music_links` is the one place where a policy is load-bearing rather than defensive:
`MyMusicModule` selects without a `user_id` filter and trusts RLS to scope the result.
