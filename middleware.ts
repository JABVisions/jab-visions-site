// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /board routes
  if (!pathname.startsWith("/board")) {
    return NextResponse.next();
  }

  // Allow public board routes
  const isPublicBoardRoute =
    pathname === "/board/login" ||
    pathname === "/board/signup" ||
    pathname.startsWith("/board/welcome");

  // Prepare a response we can attach updated cookies to
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If they are logged in, allow everything
  if (user) return res;

  // If not logged in, allow only the public board routes
  if (isPublicBoardRoute) return res;

  // Otherwise redirect to login
  const url = req.nextUrl.clone();
  url.pathname = "/board/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Only run middleware on /board/*
export const config = {
  matcher: ["/board/:path*"],
};
