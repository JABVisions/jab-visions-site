"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { hydrateCloudDrops } from "@/lib/board/cloudSync";

/**
 * Pulls cloud copies of the user's drops (universal + Pay Drops) into
 * localStorage on load and whenever the user signs in, so Board data follows
 * the user across devices. Renders nothing.
 */
export default function CloudSyncBridge() {
  useEffect(() => {
    void hydrateCloudDrops();

    const supabase = supabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void hydrateCloudDrops();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
