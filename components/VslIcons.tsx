/**
 * Inlined SVG icons for the VSL player.
 *
 * Replaces `lucide-react` (which added ~15KB gzipped and delayed startup
 * on Slow 3G). Each icon is ~200-500 bytes minified. Total < 3KB.
 *
 * API mirrors the lucide-react props we actually used: `size`, `color`,
 * `fill`, `strokeWidth`. Anything else is passed straight through.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function baseProps({ size = 24, color = "currentColor", strokeWidth = 2, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function Play(p: IconProps) {
  const { color = "currentColor", fill } = p;
  return (
    <svg {...baseProps(p)} fill={fill || "none"} stroke={color}>
      <polygon points="6 3 20 12 6 21 6 3" fill={fill || "none"} />
    </svg>
  );
}

export function Pause(p: IconProps) {
  const { color = "currentColor", fill } = p;
  return (
    <svg {...baseProps(p)} fill={fill || "none"} stroke={color}>
      <rect x="6" y="4" width="4" height="16" fill={fill || "none"} />
      <rect x="14" y="4" width="4" height="16" fill={fill || "none"} />
    </svg>
  );
}

export function RotateCcw(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function Volume2(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function VolumeX(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}

export function Settings(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Maximize(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function Minimize(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function SlidersHorizontal(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </svg>
  );
}

export function FastForward(p: IconProps) {
  const { fill } = p;
  return (
    <svg {...baseProps(p)}>
      <polygon points="13 19 22 12 13 5 13 19" fill={fill || "none"} />
      <polygon points="2 19 11 12 2 5 2 19" fill={fill || "none"} />
    </svg>
  );
}

export function ChevronRight(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronLeft(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function Check(p: IconProps) {
  return (
    <svg {...baseProps(p)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
