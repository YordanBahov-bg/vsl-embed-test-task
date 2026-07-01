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
        <h3>Self-Hosted VSL Player</h3>
        <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
          Rapid Engage Bar + exit overlay + timed CTA. Try pausing the video, or wait 10 seconds — the CTA is set to appear immediately for testing.
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
            exitPauseImage="/images/exit-overlay.png"
            cta={{
              text: "Започни трансформацията си сега",
              href: "#plans",
              // showAtSec: 0 → visible immediately for testing.
              // For production: set showBeforeEndSec: 10 to show 10s before the video ends.
              showAtSec: 0,
            }}
          />
        </div>
      </section>

      {/* MOCK #plans SECTION — where the CTA anchor scrolls to */}
      <section
        id="plans"
        style={{
          maxWidth: 940,
          margin: "0 auto",
          padding: "40px 20px",
          borderTop: "1px solid #e4ebf3",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 24 }}>Твоят план</h2>
        <p style={{ textAlign: "center", color: "#666", marginBottom: 32 }}>
          Това е placeholder секция &mdash; тук ще бъдат ценовите планове.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            maxWidth: 600,
            margin: "0 auto",
          }}
        >
          {[
            { title: "4 седмичен план", price: "€49", desc: "Стартов пакет" },
            { title: "12 седмичен план", price: "€98", desc: "Най-добра стойност" },
          ].map((plan) => (
            <div
              key={plan.title}
              style={{
                border: "1px solid #e4ebf3",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
                {plan.title}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#e85500" }}>
                {plan.price}
              </div>
              <div style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
                {plan.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* INFO */}
      <section style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px" }}>
        <h4 style={{ marginBottom: 12 }}>Features enabled</h4>
        <ul style={{ fontSize: 14, lineHeight: 2, color: "#333" }}>
          <li><strong>Rapid Engage Bar</strong> — progress bar starts fast, slows down. Video feels shorter early on.</li>
          <li><strong>Exit-pause overlay</strong> — pause the video → Bulgarian STOP image appears. Tap to resume.</li>
          <li><strong>Timed CTA</strong> — the orange button anchor-scrolls to the #plans section above. Currently set to show immediately for testing.</li>
        </ul>
      </section>
    </div>
  );
}
