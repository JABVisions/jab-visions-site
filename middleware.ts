// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Public /board routes (always accessible without login)
 * - Keep /board and /board/login reachable so you can enter while Board is locked.
 * - We will conditionally block /board/signup when locked.
 */
const PUBLIC_BOARD_ROUTES = new Set([
  "/board",
  "/board/login",
  "/board/signup",
  "/board/auth/callback",
]);

function parseAllowedEmails(raw?: string | null) {
  return new Set(
    (raw || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Only guard /board/*
  if (!pathname.startsWith("/board")) return NextResponse.next();

  const locked =
    (process.env.BOARD_LOCKED || "").toLowerCase() === "1" ||
    (process.env.BOARD_LOCKED || "").toLowerCase() === "true";

  // While locked: block signup so new users can’t create accounts.
  if (locked && pathname === "/board/signup") {
    const url = req.nextUrl.clone();
    url.pathname = "/board";
    url.searchParams.set("locked", "1");
    return NextResponse.redirect(url);
  }

  // Allow public pages
  if (PUBLIC_BOARD_ROUTES.has(pathname)) return NextResponse.next();

  // Create the response we will return (and mutate cookies onto if needed)
  const res = NextResponse.next();

  // Supabase server client (cookie-based session)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error) {
    console.error("[middleware] supabase.auth.getUser error:", error);
  }

  // If user is not authenticated, redirect to login
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/board/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // ✅ Lock gate: only allow whitelisted emails when BOARD_LOCKED=1
  if (locked) {
    const allowed = parseAllowedEmails(process.env.BOARD_ALLOWED_EMAILS);
    const email = (user.email || "").toLowerCase();

    if (!email || !allowed.has(email)) {
      const url = req.nextUrl.clone();
      url.pathname = "/board";
      url.searchParams.set("locked", "1");
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/board/:path*"],
};
