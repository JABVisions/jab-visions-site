"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function AuthFragmentRedirect() {
  useEffect(() => {
    if (!window.location.hash) return;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const authError = params.get("error_description") || params.get("error");
    const authType = params.get("type") || "";
    const destination = authType === "recovery"
      ? "/board/reset-password"
      : "/board/signup";

    if (authError) {
      const target = new URL(destination, window.location.origin);
      target.searchParams.set(
        "error",
        params.get("error_code") === "otp_expired"
          ? "This email confirmation link has expired or was already used. Create the account again or request a new confirmation email."
          : authError.replace(/\+/g, " ")
      );
      window.location.replace(target.toString());
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    void supabaseBrowser().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }).then(({ error }) => {
      const target = new URL(
        authType === "recovery" ? "/board/reset-password" : "/board/profile",
        window.location.origin
      );
      if (error) {
        target.pathname = authType === "recovery"
          ? "/board/reset-password"
          : "/board/signup";
        target.searchParams.set(
          "error",
          "This confirmation link could not be verified. Request a new email and open the newest link."
        );
      }
      window.location.replace(target.toString());
    });
  }, []);

  return null;
}
