// File: /app/layout.tsx
import "./globals.css";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import SiteShell from "./components/SiteShell";
import AuthFragmentRedirect from "./components/AuthFragmentRedirect";

export const metadata = {
  title: "JAB Visions™ | Where Imagination Meets Reality",
  description:
    "Where Imagination Meets Reality. The official website for JAB Visions™.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="UTF-8" />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-E2204ZVTRQ"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-E2204ZVTRQ');
          `}
        </Script>
      </head>
      <body className="bg-neutral-900 text-white">
        <AuthFragmentRedirect />
        <SiteShell>{children}</SiteShell>
        <Analytics />
      </body>
    </html>
  );
}
