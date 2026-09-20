"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getCurrentUserId, loadAllLocalDrops } from "@/lib/board/boardDropEditStore";
import {
  configureBoardProjectsStorage,
  notebookProjectsOwnedByViewer,
  persistProjectListToAccount,
  syncResolvedProjectsToStorage,
} from "@/lib/board/projects";
import {
  isCloudProjectDrop,
  mergeCollectionPreservingProjectDrops,
} from "@/lib/board/projectProfileDrop";

export default function BoardCloudSync() {
  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();

    async function sync(userId: string | null) {
      if (!userId || cancelled) return;

      configureBoardProjectsStorage(userId, true);
      const localProjects = notebookProjectsOwnedByViewer(
        syncResolvedProjectsToStorage(),
        userId
      );
      if (localProjects.length) {
        await persistProjectListToAccount(localProjects);
      }
      if (cancelled) return;

      const localDrops = loadAllLocalDrops().items.filter(
        (drop) => drop?.id && !isCloudProjectDrop(drop)
      );
      if (!localDrops.length) return;

      const { data: profile } = await sb
        .from("profiles")
        .select("board_style")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;

      const style =
        profile?.board_style && typeof profile.board_style === "object"
          ? (profile.board_style as Record<string, any>)
          : {};
      const remote = Array.isArray(style.boardDrops) ? style.boardDrops : [];
      const remoteIds = new Set(remote.map((drop: any) => String(drop?.id ?? "")));
      const missing = localDrops.filter((drop) => !remoteIds.has(String(drop.id)));
      if (!missing.length) return;

      const { error } = await sb
        .from("profiles")
        .update({
          board_style: {
            ...style,
            boardDrops: mergeCollectionPreservingProjectDrops(
              [...missing, ...remote],
              remote
            ).slice(0, 120),
          },
        })
        .eq("id", userId);
      if (error) {
        console.error("[BoardCloudSync] Board Drop upload failed", error);
      }
    }

    void getCurrentUserId().then((userId) => {
      if (userId) void sync(userId);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        void sync(session?.user?.id ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return null;
}
