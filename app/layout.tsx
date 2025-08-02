// File: /app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'Those Ryderz',
  description: 'The official website for Those Ryderz. A JAB Visions production.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts for Chrome Title and Tagline */}
        <link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="UTF-8" />
      </head>
      <body className="bg-neutral-900 text-white">
        {children}
      </body>
    </html>
  );
}
