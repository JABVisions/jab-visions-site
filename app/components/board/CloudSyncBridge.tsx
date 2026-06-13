"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { hydrateCloudDrops } from "@/lib/board/cloudSync";
import { deferClientWork } from "@/lib/board/deferClientWork";

/**
 * Pulls cloud copies of the user's drops (universal + Pay Drops) into
 * localStorage on load and whenever the user signs in, so Board data follows
 * the user across devices. Renders nothing.
 */
export default function CloudSyncBridge() {
  useEffect(() => {
    const cancelDeferred = deferClientWork(() => hydrateCloudDrops(), 5000);

    const supabase = supabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        deferClientWork(() => hydrateCloudDrops(), 2000);
      }
    });

    return () => {
      cancelDeferred();
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
