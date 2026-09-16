import { publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";

type DirectoryIdentity = {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type DirectoryClient = {
  from: (table: string) => any;
};

export function friendZoneDirectoryMeta(identity: {
  lastSeenAt: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}) {
  return {
    presence: true,
    source: "board_presence",
    hidden: true,
    lastSeenAt: identity.lastSeenAt,
    authorUsername: identity.username,
    authorName: identity.displayName,
    authorAvatar: identity.avatarUrl,
  };
}

/**
 * Publish this Board user into the public Friend Zone directory.
 * Production activity currently accepts board_drop / announcement only, so
 * presence pings use board_drop + hidden meta instead of kind=system.
 */
export async function publishFriendZoneDirectory(
  supabase: DirectoryClient,
  userId: string,
  identity: DirectoryIdentity = {}
) {
  const lastSeenAt = new Date().toISOString();
  const username = String(identity.username || "").trim().slice(0, 24);
  const displayName = String(identity.displayName || username || "Board User").trim().slice(0, 60);
  const avatarUrl = publicOrbAvatarUrl(identity.avatarUrl);
  const meta = friendZoneDirectoryMeta({
    lastSeenAt,
    username,
    displayName,
    avatarUrl,
  });

  await supabase.from("board_orbit").upsert(
    {
      user_id: userId,
      username: username || null,
      display_name: displayName,
      avatar_url: avatarUrl.startsWith("http") || avatarUrl.startsWith("/") ? avatarUrl : null,
      last_seen_at: lastSeenAt,
      visible: true,
    },
    { onConflict: "user_id" }
  );

  const { data: existing } = await supabase
    .from("board_activity")
    .select("id")
    .eq("user_id", userId)
    .contains("meta", { presence: true })
    .limit(1)
    .maybeSingle();

  const payload = {
    scope: "global",
    user_id: userId,
    kind: "board_drop",
    title: " ",
    body: " ",
    href: null,
    image_url: null,
    meta,
  };

  if (existing?.id) {
    await supabase
      .from("board_activity")
      .update({
        created_at: lastSeenAt,
        meta,
        kind: "board_drop",
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
  } else {
    const { error } = await supabase.from("board_activity").insert(payload);
    if (error) {
      await supabase.from("board_activity").insert({ ...payload, kind: "announcement" });
    }
  }

  return lastSeenAt;
}
