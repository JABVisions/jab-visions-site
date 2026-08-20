import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function isPublicBoardRoute(pathname: string) {
  if (
    pathname === "/board" ||
    pathname === "/board/login" ||
    pathname === "/board/forgot-password" ||
    pathname === "/board/signup" ||
    pathname === "/board/reset-password" ||
    pathname === "/board/reset-password/confirm" ||
    pathname === "/board/onboarding" ||
    pathname === "/board/preview"
  ) {
    return true;
  }

  return /^\/board\/profile\/[^/]+$/.test(pathname);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Keep UI-only local development usable until a Supabase project is linked.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  if (isPublicBoardRoute(request.nextUrl.pathname)) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/board/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/board/:path*"],
};
