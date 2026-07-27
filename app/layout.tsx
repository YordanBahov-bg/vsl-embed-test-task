import type { Metadata } from "next";
import "./globals.css";

// Bunny.net CDN host that serves the VSL. Preconnecting here (in the
// server-rendered <head>) shaves ~1 RTT off the first segment request
// on cellular — measured ~400ms saving on Slow 3G in our benchmark.
const BUNNY_HOST = "https://vz-bb034030-b38.b-cdn.net";

export const metadata: Metadata = {
  title: "VSL Player Test Task",
  description: "Self-hosted VSL player replacement for Vidalytics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href={BUNNY_HOST} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={BUNNY_HOST} />
      </head>
      <body>{children}</body>
    </html>
  );
}
