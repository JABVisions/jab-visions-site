// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Public /board routes (always accessible without login)
 * Add to this list as needed.
 */
const PUBLIC_BOARD_ROUTES = new Set([
  "/board",
  "/board/login",
  "/board/signup",
  "/board/auth/callback", // keep if you use OAuth / magic link callbacks
]);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Only guard /board/*
  if (!pathname.startsWith("/board")) return NextResponse.next();

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
        // @supabase/ssr expects getAll/setAll for best compatibility
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

  // Prefer getUser() for auth checks in middleware
  // (more direct than session and avoids some edge cases)
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error) {
    // If something goes wrong, treat as unauthenticated and redirect safely
    console.error("[middleware] supabase.auth.getUser error:", error);
  }

  // If user is not authenticated, redirect to login
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/board/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/board/:path*"],
};
