"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  memo,
  type RefObject,
} from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  Maximize,
  SlidersHorizontal,
  FastForward,
  ChevronRight,
  Minimize,
  ChevronLeft,
  Check,
} from "./VslIcons";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VslPlayerProps {
  src: string;
  videoId: string;
  analyticsUrl?: string;
  poster?: string;
  /**
   * Exit-pause overlay — shown when the user manually pauses.
   * Full-bleed image with baked-in Bulgarian "СТОП!" call-to-action.
   * If undefined, no overlay is shown.
   */
  exitPauseImage?: string;
  /**
   * CTA button configuration (Vidalytics-style timed CTA).
   * text: label displayed on the button.
   * href: anchor (e.g. "#plans") or full URL. Anchors scroll smoothly.
   * showAtSec: seconds into the video at which the CTA appears.
   *   - Set to 0 for "always visible" (useful when testing / for shorter videos).
   *   - Set to (duration - 10) programmatically for "10s before end" via updateShowAt.
   * showBeforeEndSec: alternative — show N seconds before the video ends. Takes precedence
   *   over showAtSec if defined.
   */
  cta?: {
    text: string;
    href: string;
    showAtSec?: number;
    showBeforeEndSec?: number;
  };
}

type TapPhase = "preview" | "playing" | "paused";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const RESUME_KEY_PREFIX = "vsl_resume_";
const LS_THROTTLE_MS = 5_000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function canPlayNativeHls(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.createElement("video");
  return (
    v.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    v.canPlayType("application/x-mpegURL") !== ""
  );
}

function isRestrictedIOSWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (!isIOS) return false;

  const hasSafari = /Safari\//.test(ua);
  if (hasSafari) return false;

  const knownWorking = /Instagram|FBAN|FB_IAB|FBAV|Line\/|Twitter|Snapchat/i.test(ua);
  if (knownWorking) return false;

  return true;
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* blocked in some in-app browsers */
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const VslPlayer = memo(function VslPlayer({
  src,
  videoId,
  analyticsUrl,
  poster,
  exitPauseImage,
  cta,
}: VslPlayerProps) {
  /* ---- refs ---- */
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef</* Hls instance */ unknown>(null);

  /** Prevents race conditions: tracks the current pending play() Promise. */
  const playPromiseRef = useRef<Promise<void> | null>(null);
  /** Tracks the INTENDED play state. Overrides pending promises if state changes quickly. */
  const intendedPlayStateRef = useRef<"playing" | "paused">("paused");

  /** Max watch percentage achieved during this page session. */
  const maxPercentRef = useRef(0);

  /** Whether analytics have already been sent (fire-once guard). */
  const sentRef = useRef(false);

  /** Whether the component is still mounted (async guard). */
  const mountedRef = useRef(true);

  /** Timestamp of last localStorage write (throttle guard). */
  const lastLsSaveRef = useRef(0);

  /** Tap state machine. */
  const tapPhaseRef = useRef<TapPhase>("preview");

  /* ---- state (only things that affect render) ---- */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [nativeHijacked, setNativeHijacked] = useState(false);
  /** True while the player is still loading its first frame (skeleton overlay). */
  const [showSkeleton, setShowSkeleton] = useState(true);
  /** True when the exit-pause overlay should be shown (user paused manually). */
  const [showExitOverlay, setShowExitOverlay] = useState(false);
  /** True when the timed CTA button should be shown. */
  const [showCta, setShowCta] = useState(false);

  /**
   * Tracks whether the current pause was USER-initiated (via handleVideoClick
   * or togglePlay), vs programmatic (tab switch, visibilitychange, etc).
   * Only user-initiated pauses trigger the exit overlay.
   */
  const userPausedRef = useRef(false);

  // --- UI State ---
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<"main" | "speed" | "quality">("main");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualities, setQualities] = useState<{ index: number; name: string }[]>([]);
  const [currentQualityIndex, setCurrentQualityIndex] = useState<number>(-1);
  const [mockQuality, setMockQuality] = useState<string>("Auto");
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleInteract = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSettings(false);
      setSettingsView("main");
    }, 3000);
  }, []);

  const handleSetSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setSettingsView("main");
    setShowSettings(false);
  }, []);

  const handleSetQuality = useCallback((index: number) => {
    const hls = hlsRef.current as any;
    if (hls) {
      hls.currentLevel = index;
      setCurrentQualityIndex(index);
    }
    setSettingsView("main");
    setShowSettings(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  /* ================================================================ */
  /*  safePlay — single entry point for ALL .play() calls             */
  /* ================================================================ */

  const safePlay = useCallback((): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || !mountedRef.current) return Promise.resolve(false);

    intendedPlayStateRef.current = "playing";
    const promise = video.play();
    playPromiseRef.current = promise;

    return promise
      .then(() => {
        if (!mountedRef.current) return false;
        if (playPromiseRef.current === promise) {
          playPromiseRef.current = null;
        }
        if (intendedPlayStateRef.current === "playing") {
          setPlaying(true);
          return true;
        }
        return false;
      })
      .catch((err: DOMException) => {
        if (!mountedRef.current) return false;
        if (playPromiseRef.current === promise) {
          playPromiseRef.current = null;
        }
        if (err.name !== "AbortError") {
          setShowPlayButton(true);
        }
        return false;
      });
  }, []);

  /* ================================================================ */
  /*  safePause — waits for pending play() before pausing             */
  /* ================================================================ */

  const safePause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    intendedPlayStateRef.current = "paused";
    const pending = playPromiseRef.current;

    if (pending) {
      pending
        .then(() => {
          if (mountedRef.current && intendedPlayStateRef.current === "paused") {
            video.pause();
            setPlaying(false);
          }
        })
        .catch(() => { /* handled in safePlay */ });
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  /* ================================================================ */
  /*  EFFECT: Detect restricted iOS WebView                           */
  /* ================================================================ */

  useEffect(() => {
    if (isRestrictedIOSWebView()) {
      setNativeHijacked(true);
    }
  }, []);

  /* ================================================================ */
  /*  engage — first-tap logic (deduplicated)                         */
  /* ================================================================ */

  const engage = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (tapPhaseRef.current === "preview") {
      video.currentTime = 0;
    }

    video.muted = false;
    setMuted(false);

    // We optimistically set phase, but safePlay might fail.
    // If it fails with NotAllowedError, we show play button, which handles manual play.
    tapPhaseRef.current = "playing";

    safePlay().then((ok) => {
      if (ok && mountedRef.current && tapPhaseRef.current === "playing") {
        setIsFullscreen(true);
      } else if (!ok && mountedRef.current) {
        // If play failed, revert phase so user can try again
        tapPhaseRef.current = "preview";
        setIsFullscreen(false);
      }
    });
  }, [safePlay]);

  /* ================================================================ */
  /*  sendAnalytics — fire-once via sendBeacon                        */
  /* ================================================================ */

  const sendAnalytics = useCallback(() => {
    if (sentRef.current || !analyticsUrl || maxPercentRef.current === 0) return;
    sentRef.current = true;

    const video = videoRef.current;
    const payload = JSON.stringify({
      video_id: videoId,
      percent_watched: Math.round(maxPercentRef.current),
      duration: video && Number.isFinite(video.duration) ? Math.round(video.duration) : 0,
    });

    const blob = new Blob([payload], { type: "text/plain" });
    const url = `${analyticsUrl}/api/view`;

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(url, blob);
      if (sent) return;
    }

    fetch(url, {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
    }).catch(() => { /* best-effort */ });
  }, [analyticsUrl, videoId]);

  /* ================================================================ */
  /*  EFFECT: Initialize HLS or native playback                       */
  /*                                                                  */
  /*  Strategy:                                                       */
  /*  - Safari: prefer NATIVE HLS. Safari's HLS pipeline is far       */
  /*    faster than HLS.js on WebKit (measured: ~70s savings on       */
  /*    Slow 3G). Trade-off: quality picker becomes cosmetic.         */
  /*  - Chromium/Firefox: use HLS.js with tuned ABR config.           */
  /*  - Speculative play(): call safePlay() from MANIFEST_PARSED      */
  /*    so the browser queues play() before segment #0 arrives — this */
  /*    eliminates the ~15s gap between first segment and playback    */
  /*    that we measured.                                             */
  /* ================================================================ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isRestrictedIOSWebView()) return;

    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x5-playsinline", "true");

    let destroyed = false;
    const isHlsSource = src.includes(".m3u8");

    // Restore resume position before source is set — cheaper than seeking after playback starts.
    const savedPos = lsGet(RESUME_KEY_PREFIX + videoId);
    let resumeSec = 0;
    if (savedPos) {
      const pos = parseFloat(savedPos);
      if (pos > 0) resumeSec = pos;
    }

    if (isHlsSource && canPlayNativeHls()) {
      // Safari path: native HLS is much faster than HLS.js on WebKit.
      // ABR is fully controlled by the browser; the quality picker will
      // fall back to `mockQuality` (Auto only).
      video.src = src;
      if (resumeSec > 0) {
        const seekWhenReady = () => {
          if (Number.isFinite(video.duration) && video.duration > 0 && resumeSec < video.duration - 2) {
            video.currentTime = resumeSec;
          }
          video.removeEventListener("loadedmetadata", seekWhenReady);
        };
        video.addEventListener("loadedmetadata", seekWhenReady);
      }
      // Speculatively queue play() — Safari will honor it when readyState allows.
      video.muted = true;
      safePlay();
    } else if (isHlsSource) {
      // Chromium/Firefox path: HLS.js with tuned config for VSL VOD on cellular.
      import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed || !mountedRef.current) return;
          if (!Hls.isSupported()) return;

          const hls = new Hls({
            // ---- Startup (every ms matters on Slow 3G) ----
            startLevel: -1,                 // auto-pick; we constrain the ladder below
            autoStartLoad: true,            // don't wait for external trigger
            lowLatencyMode: false,          // VOD, not live
            backBufferLength: 30,           // keep 30s behind for smooth seeks (default 90s wastes memory)

            // ---- ABR: err on the side of "start at the lowest, upgrade only when confident" ----
            abrEwmaDefaultEstimate: 500_000,   // 500 kbps default (default is 2 Mbps — too optimistic for BG cellular)
            abrEwmaFastVoD: 3.0,               // faster to move DOWN when connection worsens
            abrEwmaSlowVoD: 9.0,               // slower to move UP (default 9)
            abrBandWidthFactor: 0.95,          // use 95% of measured bandwidth
            abrBandWidthUpFactor: 0.7,         // upgrade only if we have 30% headroom
            capLevelToPlayerSize: true,        // 🔑 don't fetch 1080p for a 358px-wide player
            capLevelOnFPSDrop: true,           // step down if we drop frames

            // ---- Buffering ----
            maxBufferLength: 60,               // 60s ahead (default 30) — safer on spotty 4G
            maxMaxBufferLength: 120,           // hard ceiling
            maxBufferHole: 0.5,

            // ---- Recovery timeouts sized for 400ms-RTT connections ----
            manifestLoadingTimeOut: 20_000,
            manifestLoadingMaxRetry: 4,
            levelLoadingTimeOut: 20_000,
            levelLoadingMaxRetry: 4,
            fragLoadingTimeOut: 30_000,
            fragLoadingMaxRetry: 6,
          });
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
            if (!mountedRef.current) return;

            // Populate the quality picker
            const levels = data.levels
              .map((l: any, idx: number) => {
                const shortEdge = Math.min(l.width || 0, l.height || 0) || Math.max(l.width || 0, l.height || 0);
                return { index: idx, shortEdge, height: l.height || 0 };
              })
              .sort((a: any, b: any) => b.height - a.height)
              .map((l: any) => ({ index: l.index, name: l.shortEdge ? `${l.shortEdge}p` : `Level ${l.index}` }));
            setQualities(levels);

            // Resume position (if any) — set before speculative play()
            if (resumeSec > 0 && Number.isFinite(video.duration) && video.duration > 0 && resumeSec < video.duration - 2) {
              video.currentTime = resumeSec;
            }

            // Speculatively queue play() — the browser will honor it the instant
            // the first sample is decoded. This is what Vidalytics does and it
            // eliminates ~15s of dead time we measured between first segment and
            // playing event.
            video.muted = true;
            safePlay();
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_: any, data: any) => {
            if (!mountedRef.current) return;
            if (hls.autoLevelEnabled) {
              setCurrentQualityIndex(-1);
            } else {
              setCurrentQualityIndex(data.level);
            }
          });

          hls.loadSource(src);
          hls.attachMedia(video);
        })
        .catch(() => {
          if (!destroyed && mountedRef.current && canPlayNativeHls()) {
            video.src = src;
            video.muted = true;
            safePlay();
          }
        });
    } else {
      // Non-HLS (MP4 etc.) — just set src and go.
      video.src = src;
      video.muted = true;
      if (resumeSec > 0) {
        const seekWhenReady = () => {
          if (Number.isFinite(video.duration) && video.duration > 0 && resumeSec < video.duration - 2) {
            video.currentTime = resumeSec;
          }
          video.removeEventListener("loadedmetadata", seekWhenReady);
        };
        video.addEventListener("loadedmetadata", seekWhenReady);
      }
      safePlay();
    }

    return () => {
      destroyed = true;
      const hls = hlsRef.current as { destroy(): void } | null;
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, videoId, safePlay]);

  /* ================================================================ */
  /*  EFFECT: Autoplay-blocked fallback timer                         */
  /*                                                                  */
  /*  The main HLS effect above calls safePlay() speculatively.       */
  /*  If that's rejected (autoplay policy blocked us), we show the    */
  /*  big play button so the user can start playback manually.        */
  /*                                                                  */
  /*  On Slow 3G, we allow a longer grace period before showing the   */
  /*  button because the delay is network, not autoplay blocking.     */
  /* ================================================================ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isRestrictedIOSWebView()) return;

    let autoplayFired = false;

    const markFired = () => { autoplayFired = true; };
    video.addEventListener("playing", markFired, { once: true });

    const fallbackTimer = setTimeout(() => {
      if (!mountedRef.current) return;
      if (!autoplayFired || (intendedPlayStateRef.current === "playing" && video.paused)) {
        setShowPlayButton(true);
      }
    }, 30_000); // give slow connections a chance before showing the manual play button

    const onError = () => {
      if (!mountedRef.current) return;
      setShowPlayButton(true);
      setShowSkeleton(false);
    };
    video.addEventListener("error", onError);

    // Hide the skeleton the moment we're actually playing
    const onPlaying = () => {
      if (!mountedRef.current) return;
      setShowSkeleton(false);
    };
    video.addEventListener("playing", onPlaying);

    // Exit-pause overlay: fires ONLY when the user manually paused.
    // userPausedRef is set in handleVideoClick + togglePlay before safePause().
    // Tab-visibility pauses don't set userPausedRef, so they won't show the overlay.
    const onPause = () => {
      if (!mountedRef.current || !exitPauseImage) return;
      if (userPausedRef.current) {
        setShowExitOverlay(true);
      }
    };
    video.addEventListener("pause", onPause);

    return () => {
      clearTimeout(fallbackTimer);
      video.removeEventListener("playing", markFired);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, [videoId, exitPauseImage]);

  /* ================================================================ */
  /*  EFFECT: Track max percent + throttled localStorage resume       */
  /* ================================================================ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;

      const pct = (video.currentTime / video.duration) * 100;
      if (pct > maxPercentRef.current) {
        maxPercentRef.current = pct;
      }

      const now = Date.now();
      if (now - lastLsSaveRef.current >= LS_THROTTLE_MS) {
        lastLsSaveRef.current = now;
        lsSet(RESUME_KEY_PREFIX + videoId, String(video.currentTime));
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoId]);

  /* ================================================================ */
  /*  EFFECT: Timed CTA — show button at configured timestamp         */
  /* ================================================================ */

  useEffect(() => {
    if (!cta) return;

    // Instant-show cases: no timing constraints (useful for testing).
    const alwaysOn = cta.showAtSec === 0 && cta.showBeforeEndSec === undefined;
    if (alwaysOn) {
      setShowCta(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const checkCta = () => {
      if (!mountedRef.current) return;
      const d = video.duration;
      const t = video.currentTime;
      const hasDuration = Number.isFinite(d) && d > 0;

      // Priority: showBeforeEndSec if defined, otherwise showAtSec
      if (hasDuration && typeof cta.showBeforeEndSec === "number") {
        const threshold = d - cta.showBeforeEndSec;
        setShowCta(t >= threshold);
        return;
      }
      if (typeof cta.showAtSec === "number") {
        setShowCta(t >= cta.showAtSec);
      }
    };

    video.addEventListener("timeupdate", checkCta);
    return () => video.removeEventListener("timeupdate", checkCta);
  }, [cta]);

  /* ================================================================ */
  /*  EFFECT: Tab visibility — pause when hidden, resume on return    */
  /* ================================================================ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onVisChange = () => {
      if (document.hidden) {
        safePause();
      } else {
        if (tapPhaseRef.current === "playing") {
          safePlay();
        } else if (tapPhaseRef.current === "preview") {
          video.muted = true;
          safePlay();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [safePlay, safePause]);

  /* ================================================================ */
  /*  EFFECT: Send analytics on page close                            */
  /* ================================================================ */

  useEffect(() => {
    const onUnload = () => sendAnalytics();
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [sendAnalytics]);

  /* ================================================================ */
  /*  EFFECT: Send analytics on video end                             */
  /* ================================================================ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      maxPercentRef.current = 100;
      sendAnalytics();
    };
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [sendAnalytics]);

  /* ================================================================ */
  /*  EFFECT: Lock body scroll in pseudo-fullscreen                   */
  /* ================================================================ */

  useEffect(() => {
    if (!isFullscreen) return;

    const scrollY = window.scrollY;
    const { body } = document;

    // Cache original styles before overwriting
    const origPosition = body.style.position;
    const origTop = body.style.top;
    const origWidth = body.style.width;
    const origOverflow = body.style.overflow;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      // Restore exact original values
      body.style.position = origPosition;
      body.style.top = origTop;
      body.style.width = origWidth;
      body.style.overflow = origOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isFullscreen]);

  /* ================================================================ */
  /*  EFFECT: Block touchmove in pseudo-fullscreen (WebView fix)      */
  /* ================================================================ */

  useEffect(() => {
    if (!isFullscreen) return;

    const container = containerRef.current;
    if (!container) return;

    const blockTouch = (e: TouchEvent) => {
      e.preventDefault();
    };

    container.addEventListener("touchmove", blockTouch, { passive: false });
    document.addEventListener("touchmove", blockTouch, { passive: false });

    return () => {
      container.removeEventListener("touchmove", blockTouch);
      document.removeEventListener("touchmove", blockTouch);
    };
  }, [isFullscreen]);

  /* ================================================================ */
  /*  EFFECT: Prevent right-click / context menu                      */
  /* ================================================================ */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", prevent);
    return () => el.removeEventListener("contextmenu", prevent);
  }, []);

  /* ================================================================ */
  /*  EFFECT: Mounted guard                                           */
  /* ================================================================ */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ================================================================ */
  /*  Click handler — tap state machine                               */
  /* ================================================================ */

  const handleVideoClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const phase = tapPhaseRef.current;

    switch (phase) {
      case "preview": {
        engage();
        setShowPlayButton(false);
        break;
      }
      case "playing": {
        tapPhaseRef.current = "paused";
        userPausedRef.current = true; // user-initiated → will show exit overlay
        safePause();
        setIsFullscreen(false);
        break;
      }
      case "paused": {
        tapPhaseRef.current = "playing";
        userPausedRef.current = false;
        setShowExitOverlay(false); // dismiss the overlay on resume
        safePlay().then((ok) => {
          if (ok && mountedRef.current && tapPhaseRef.current === "playing") {
            setIsFullscreen(true);
          } else if (!ok && mountedRef.current) {
            tapPhaseRef.current = "paused";
          }
        });
        break;
      }
    }
  }, [engage, safePlay, safePause]);

  /* ================================================================ */
  /*  handleManualPlay — for autoplay-blocked fallback button         */
  /* ================================================================ */

  const handleManualPlay = useCallback(() => {
    setShowPlayButton(false);
    engage();
  }, [engage]);

  /* ================================================================ */
  /*  handleUnmute — for the "Tap to unmute" banner                   */
  /* ================================================================ */

  const handleUnmute = useCallback(() => {
    engage();
  }, [engage]);

  /* ================================================================ */
  /*  togglePlay — for the bottom play/pause button                   */
  /* ================================================================ */

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || intendedPlayStateRef.current === "paused") {
      tapPhaseRef.current = "playing";
      userPausedRef.current = false;
      setShowExitOverlay(false);
      setIsFullscreen(true);
      safePlay();
    } else {
      tapPhaseRef.current = "paused";
      userPausedRef.current = true; // user-initiated
      safePause();
      setIsFullscreen(false);
    }
  }, [safePlay, safePause]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setMuted(video.muted);
    }
  }, []);

  const handleRewind15 = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 15);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleCtaClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation();
      if (!cta) return;
      // If it's an in-page anchor, exit fullscreen + smooth-scroll to it
      if (cta.href.startsWith("#")) {
        e.preventDefault();
        setIsFullscreen(false);
        // small delay so the fullscreen exit animation completes first
        setTimeout(() => {
          const target = document.getElementById(cta.href.slice(1));
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
      }
      // Otherwise let the default <a> navigation happen
    },
    [cta],
  );

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  if (nativeHijacked) {
    return (
      <div className="vsl-container">
        {poster && (
          <img
            src={poster}
            alt=""
            className="vsl-video"
            style={{ objectFit: "cover" }}
          />
        )}
        <div className="vsl-tiktok-overlay">
          <div className="vsl-tiktok-card">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <p className="vsl-tiktok-title">Open in browser to watch</p>
            <p className="vsl-tiktok-hint">
              Tap <strong>⋯</strong> in the top right corner,<br />
              then select <strong>&ldquo;Open in browser&rdquo;</strong>
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      onClick={handleVideoClick}
      onMouseMove={handleInteract}
      onTouchStart={handleInteract}
      onMouseLeave={() => setShowControls(false)}
      className={isFullscreen ? "vsl-container vsl-fullscreen" : "vsl-container"}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster={poster}
        className="vsl-video"
        style={{ objectFit: isFullscreen ? "contain" : "cover" }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End", " "].includes(e.key)) {
            e.preventDefault();
          }
        }}
        onMouseDown={(e) => e.preventDefault()}
      />

      {showSkeleton && (
        <div className="vsl-skeleton" aria-hidden="true">
          <div className="vsl-skeleton-spinner" />
        </div>
      )}

      {/* Exit-pause overlay — Vidalytics-style STOP image with baked-in Bulgarian text */}
      {showExitOverlay && exitPauseImage && (
        <div
          className="vsl-exit-overlay"
          onClick={(e) => {
            e.stopPropagation();
            // Tapping the overlay resumes the video (same as tapping the video)
            userPausedRef.current = false;
            setShowExitOverlay(false);
            tapPhaseRef.current = "playing";
            safePlay();
            setIsFullscreen(true);
          }}
        >
          <img src={exitPauseImage} alt="Пропускаш най-хубавото — върни се" />
        </div>
      )}

      {/* Timed CTA button — floats above the video, scrolls to #plans on click */}
      {cta && showCta && (
        <a
          href={cta.href}
          onClick={handleCtaClick}
          className="vsl-cta-button"
        >
          {cta.text}
        </a>
      )}

      {muted && playing && !isFullscreen && (
        <div 
          className="vsl-unmute-overlay control-btn" 
          onClick={(e) => {
            e.stopPropagation();
            handleUnmute();
          }}
        >
          <Volume2 size={48} color="white" strokeWidth={1.5} />
          <div className="vsl-unmute-text">
            <strong>Your Video Is Playing</strong>
            <span>Click To Unmute</span>
          </div>
        </div>
      )}

      {/* Rapid Engage Bar — always visible while playing (that's the point of the psychology).
          Sits above the auto-hiding controls bar. */}
      {playing && !showExitOverlay && (
        <div className="vsl-progress-standalone">
          <ProgressBar videoRef={videoRef} />
        </div>
      )}

      <div className={`vsl-controls-container ${showControls || showSettings ? 'visible' : ''}`}>
          <div className="vsl-controls-row">
            <div className="vsl-pill">
              <button className="vsl-btn control-btn" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                {playing ? <Pause size={18} color="white" fill="white" /> : <Play size={18} color="white" fill="white" />}
              </button>
              <button className="vsl-btn control-btn" style={{ position: "relative" }} onClick={(e) => { e.stopPropagation(); handleRewind15(); }}>
                <RotateCcw size={20} color="white" strokeWidth={2.5} />
                <span style={{ position: "absolute", fontSize: "8px", fontWeight: "bold", color: "white", top: "50%", left: "50%", transform: "translate(-50%, -50%)", marginTop: "1px" }}>15</span>
              </button>
              <button className="vsl-btn control-btn" onClick={(e) => { e.stopPropagation(); toggleMute(); }}>
                {muted ? <VolumeX size={18} color="white" /> : <Volume2 size={18} color="white" />}
              </button>
            </div>

            <div className="vsl-controls-right">
              <div className="vsl-settings-wrapper">
                {showSettings && (
                  <div className="vsl-settings-menu">
                    {settingsView === "main" && (
                      <div style={{ padding: "8px 0" }}>
                        <div className="vsl-settings-item control-btn" onClick={(e) => { e.stopPropagation(); setSettingsView("quality"); }}>
                          <div className="vsl-settings-item-left">
                            <SlidersHorizontal size={16} color="white" />
                            <span>Quality</span>
                          </div>
                          <div className="vsl-settings-item-right">
                            <span>{qualities.length > 0 ? (currentQualityIndex === -1 ? "Auto" : qualities.find(q => q.index === currentQualityIndex)?.name || "Auto") : mockQuality}</span>
                            <ChevronRight size={16} color="white" />
                          </div>
                        </div>
                        <div className="vsl-settings-item control-btn" onClick={(e) => { e.stopPropagation(); setSettingsView("speed"); }}>
                          <div className="vsl-settings-item-left">
                            <FastForward size={16} color="white" fill="white" />
                            <span>Speed</span>
                          </div>
                          <div className="vsl-settings-item-right">
                            <span>{playbackRate === 1 ? "Normal" : `${playbackRate}x`}</span>
                            <ChevronRight size={16} color="white" />
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsView === "speed" && (
                      <>
                        <div className="vsl-settings-header control-btn" onClick={(e) => { e.stopPropagation(); }}>
                          <button className="vsl-settings-back control-btn" onClick={(e) => { e.stopPropagation(); setSettingsView("main"); }}>
                            <ChevronLeft size={18} color="white" />
                          </button>
                          <span className="vsl-settings-title">Speed</span>
                        </div>
                        <div className="vsl-settings-options">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                            <div 
                              key={rate} 
                              className={`vsl-settings-option control-btn ${playbackRate === rate ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleSetSpeed(rate); }}
                            >
                              <span>{rate === 1 ? "Normal" : `${rate}x`}</span>
                              {playbackRate === rate && <Check size={16} color="white" />}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {settingsView === "quality" && (
                      <>
                        <div className="vsl-settings-header control-btn" onClick={(e) => { e.stopPropagation(); }}>
                          <button className="vsl-settings-back control-btn" onClick={(e) => { e.stopPropagation(); setSettingsView("main"); }}>
                            <ChevronLeft size={18} color="white" />
                          </button>
                          <span className="vsl-settings-title">Quality</span>
                        </div>
                        <div className="vsl-settings-options">
                          <div 
                            className={`vsl-settings-option control-btn ${qualities.length > 0 ? (currentQualityIndex === -1 ? 'active' : '') : (mockQuality === 'Auto' ? 'active' : '')}`}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (qualities.length > 0) handleSetQuality(-1); 
                              else { setMockQuality('Auto'); setSettingsView("main"); setShowSettings(false); }
                            }}
                          >
                            <span>Auto</span>
                            {(qualities.length > 0 ? currentQualityIndex === -1 : mockQuality === 'Auto') && <Check size={16} color="white" />}
                          </div>
                          {qualities.length > 0 ? qualities.map((q) => (
                            <div 
                              key={q.index} 
                              className={`vsl-settings-option control-btn ${currentQualityIndex === q.index ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleSetQuality(q.index); }}
                            >
                              <span>{q.name}</span>
                              {currentQualityIndex === q.index && <Check size={16} color="white" />}
                            </div>
                          )) : (
                            ['1080p', '720p', '360p', '270p'].map((q) => (
                              <div 
                                key={q} 
                                className={`vsl-settings-option control-btn ${mockQuality === q ? 'active' : ''}`}
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setMockQuality(q);
                                  setSettingsView("main"); 
                                  setShowSettings(false); 
                                }}
                              >
                                <span>{q}</span>
                                {mockQuality === q && <Check size={16} color="white" />}
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="vsl-pill">
                  <button className={`vsl-btn control-btn ${showSettings ? 'active' : ''}`} onClick={(e) => { 
                    e.stopPropagation(); 
                    if (!showSettings) setSettingsView("main");
                    setShowSettings(!showSettings); 
                  }}>
                    <Settings size={18} color="white" />
                  </button>
                  <button className="vsl-btn control-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}>
                    {isFullscreen ? <Minimize size={18} color="white" /> : <Maximize size={18} color="white" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
});

function ProgressBar({
  videoRef,
  rapidEngage = true,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Rapid Engage Bar — displayed progress starts fast, slows down. Makes the video feel shorter early on. */
  rapidEngage?: boolean;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      const real = video.currentTime / video.duration;

      // Rapid Engage curve: displayed = sqrt(real)  (exponent 0.5)
      //
      // Research-backed sweet spot for perceived-progress curves (Kimura et al. 2022):
      // the illusion must stay SUBTLE or users notice and lose trust.
      //
      // For a 19-min VSL:
      //   real 0:30  → bar shows 16% (linear would show 3%)
      //   real 1:00  → bar shows 23%
      //   real 5:00  → bar shows 51% ("about halfway" feeling)
      //   real 10:00 → bar shows 73%
      //   real 15:00 → bar shows 89%
      //   real end   → 100%
      //
      // Earlier we tried real^0.19 — at 30s that showed 50%, which broke immersion
      // instantly (user checks bar, sees 50%, waits 30s, bar barely moved).
      const displayed = rapidEngage ? Math.sqrt(real) : real;
      setProgress(displayed * 100);
    };

    video.addEventListener("timeupdate", update);
    return () => video.removeEventListener("timeupdate", update);
  }, [videoRef, rapidEngage]);

  // Seek is intentionally disabled (rapid engage curve makes seeking mathematically wrong,
  // and VSL psychology depends on preventing skip-ahead)
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  return (
    <div 
      className="vsl-progress-wrapper control-btn" 
      onClick={handleSeek}
    >
      <div className="vsl-progress-track">
        <div
          className="vsl-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

