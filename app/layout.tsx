// File: /app/layout.tsx
import "./globals.css";
import Navbar from "./components/Navbar";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Those Ryderz",
  description: "The official website for Those Ryderz. A JAB Visions production.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap"
          rel="stylesheet"
        />

        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="UTF-8" />

        {/* Google Analytics (GA4) */}
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
        {/* Global Navbar */}
        <Navbar />

        {/* Offset for fixed navbar */}
        <div className="pt-20">{children}</div>

        {/* Vercel Analytics */}
        <Analytics />
      </body>
    </html>
  );
}
