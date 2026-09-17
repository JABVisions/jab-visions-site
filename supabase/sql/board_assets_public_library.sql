-- Public Work Board library preview.
-- Lets Bucket Brain open Assets / Portfolio that a creator has classified
-- onto their Work Board. Drop Studio drafts (lifecycle.phase = framed) stay hidden.
-- Run in Supabase SQL Editor if Preview Work Board Assets appear empty for other users.

alter table if exists public.board_assets enable row level security;

drop policy if exists "public work board library is readable" on public.board_assets;
create policy "public work board library is readable"
  on public.board_assets for select
  to anon, authenticated
  using (
    coalesce(payload -> 'lifecycle' ->> 'phase', 'sent') <> 'framed'
    and payload -> 'library' ->> 'archivedAt' is null
    and (
      coalesce(payload -> 'library' ->> 'isAsset', 'false') = 'true'
      or coalesce(payload -> 'library' ->> 'isPortfolio', 'false') = 'true'
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = board_assets.user_id
        and (
          coalesce(p.board_style ->> 'visibility', 'public') <> 'private'
          or (select auth.uid()) = p.id
        )
    )
  );

grant select on public.board_assets to anon, authenticated;
