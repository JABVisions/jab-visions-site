"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function RecoveryLinkHandler() {
  const [status, setStatus] = useState("");

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const error = params.get("error_description") || params.get("error");

    if (error) {
      const url = new URL(window.location.href);
      url.hash = "";
      url.searchParams.set(
        "error",
        params.get("error_code") === "otp_expired"
          ? "This password reset link has expired or was already used. Request a new link below and open the newest email."
          : error.replace(/\+/g, " ")
      );
      window.location.replace(url.toString());
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    setStatus("Verifying your password reset link…");
    void supabaseBrowser()
      .auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error: sessionError }) => {
        const url = new URL(window.location.href);
        url.hash = "";
        url.searchParams.delete("error");

        if (sessionError) {
          url.searchParams.set(
            "error",
            "This password reset link could not be verified. Request a new link below."
          );
        }

        window.location.replace(url.toString());
      });
  }, []);

  return status ? (
    <div className="mb-4 rounded-2xl border border-white/15 bg-black/40 p-4 text-sm">
      {status}
    </div>
  ) : null;
}
