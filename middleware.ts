import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  applyAuthCookies,
  isBoardAuthRoute,
  isPublicBoardRoute,
  requestHasAuthSessionCookie,
  safeBoardNext,
} from "@/lib/supabase/authCookies";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabasePublicConfig();

  // Keep UI-only local development usable until a Supabase project is linked.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const pathname = request.nextUrl.pathname;

  // Logged-out visits have no session cookie. Skip the Supabase round trip
  // that otherwise blocks first byte on every Board navigation.
  if (!requestHasAuthSessionCookie(request)) {
    if (isPublicBoardRoute(pathname)) return response;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/board/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      safeBoardNext(`${pathname}${request.nextUrl.search}`, "/board/feed")
    );
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        applyAuthCookies(response, cookiesToSet, request);
      },
    },
  });

  // Refresh the session before any redirect logic so Board can read the
  // cookies that login/callback just wrote.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isBoardAuthRoute(pathname) && !pathname.startsWith("/board/reset-password")) {
    const next = safeBoardNext(request.nextUrl.searchParams.get("next"));
    return copyCookies(
      response,
      NextResponse.redirect(new URL(next, request.nextUrl.origin))
    );
  }

  if (!user && !isPublicBoardRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/board/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      safeBoardNext(`${pathname}${request.nextUrl.search}`, "/board/feed")
    );
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  return response;
}

export const config = {
  matcher: ["/board", "/board/:path*"],
};
