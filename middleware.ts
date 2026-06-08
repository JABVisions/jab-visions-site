import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function isPublicBoardRoute(pathname: string) {
  if (pathname === "/board") return true;
  if (
    pathname === "/board/login" ||
    pathname === "/board/preview" ||
    pathname === "/board/signup" ||
    pathname === "/board/reset-password"
  ) {
    return true;
  }

  // Public, view-only profile boards stay shareable.
  return /^\/board\/profile\/[^/]+$/.test(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicBoardRoute(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  if (user) {
    return response;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/board/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/board/:path*"],
};
