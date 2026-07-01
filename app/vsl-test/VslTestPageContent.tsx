"use client";

import { VslPlayer } from "@/components/VslPlayer";

// Bunny.net HLS URL for the current test VSL.
const VIDEO_LIBRARY = "vz-bb034030-b38";
const VIDEO_UUID = "16fe29ff-4dbe-4846-b536-618d8a8bc3de";
const TEST_VIDEO_URL = `https://${VIDEO_LIBRARY}.b-cdn.net/${VIDEO_UUID}/playlist.m3u8`;
const POSTER_URL = `https://${VIDEO_LIBRARY}.b-cdn.net/${VIDEO_UUID}/thumbnail.jpg`;

// Cloudflare Worker analytics endpoint
const ANALYTICS_URL = "https://vsl-analytics.dndv.workers.dev";

export function VslTestPageContent() {
  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      {/* NAV */}
      <nav style={{ borderBottom: "1px solid #e4ebf3", background: "#fff" }}>
        <div
          style={{
            maxWidth: 940,
            margin: "0 auto",
            padding: "16px 30px",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          VSL Player Test
        </div>
      </nav>

      {/* HEADLINE */}
      <div
        style={{
          maxWidth: 600,
          margin: "24px auto 16px",
          padding: "0 20px",
          textAlign: "center",
        }}
      >
        <h3>VSL Player Test Page</h3>
        <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
          Self-hosted VSL player.
        </p>
      </div>

      {/* VIDEO */}
      <section style={{ padding: "0 16px 24px" }}>
        <div className="video-container">
          <VslPlayer
            src={TEST_VIDEO_URL}
            videoId={VIDEO_UUID}
            analyticsUrl={ANALYTICS_URL || undefined}
            poster={POSTER_URL}
          />
        </div>
      </section>

      {/* INFO */}
      <section style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px" }}>
        <h4 style={{ marginBottom: 12 }}>Player Features</h4>
        <ul style={{ fontSize: 14, lineHeight: 2, color: "#333" }}>
          <li>Smart autoplay (muted) with tap-to-unmute banner</li>
          <li>No seeking — progress bar is view-only</li>
          <li>No speed controls or right-click menu</li>
          <li>Resume playback — close and reopen to test</li>
          <li>Auto-pause when you switch tabs</li>
          <li>Watch % analytics sent on page close</li>
        </ul>
      </section>
    </div>
  );
}
