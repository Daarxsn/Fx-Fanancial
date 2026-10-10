import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "overview" | "invoice" | "quote" | "users" | "box" | "wallet"
  | "chart" | "shield" | "settings" | "chevron-right" | "chevron-down"
  | "menu" | "close" | "sun" | "moon" | "arrow-up-right" | "plus"
  | "search" | "clock" | "check" | "alert" | "file" | "building"
  | "sparkles" | "calendar" | "activity" | "lock" | "mail" | "credit-card" | "eye" | "eye-off";

const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/></>,
  invoice: <><path d="M7 3.75h7l4 4v12.5a1.75 1.75 0 0 1-1.75 1.75h-7.5A1.75 1.75 0 0 1 7 20.25z"/><path d="M14 3.75v4h4M10 13h5M10 16.5h5"/></>,
  quote: <><path d="M6 4h12a2 2 0 0 1 2 2v13l-4-2-4 2-4-2-2 2V6a2 2 0 0 1 2-2Z"/><path d="M9 9h6M9 12h6"/></>,
  users: <><path d="M16 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 20v-1.7a3.3 3.3 0 0 0-2.4-3.18M16 4.2a3.5 3.5 0 0 1 0 6.6"/></>,
  box: <><path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="m4 7.2 8 4.3 8-4.3M12 11.5V21"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18M16 14h2"/><path d="M6 5V3h12"/></>,
  chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1 1.9-2 3.4-2.2-.5a8 8 0 0 1-2 .9l-.7 2.2h-4l-.7-2.2a8 8 0 0 1-2-.9L4.8 20l-2-3.4L4 14.7A8 8 0 0 1 4 12l-1.2-1.6 2-3.4 2.2.5a8 8 0 0 1 2-.9L9.7 4h4l.7 2.6a8 8 0 0 1 2 .9l2.2-.5 2 3.4-1.1 1.6a8 8 0 0 1-.1 3Z" transform="translate(0 -1) scale(.95)"/></>,
  "chevron-right": <path d="m9 18 6-6-6-6"/>,
  "chevron-down": <path d="m6 9 6 6 6-6"/>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  moon: <path d="M20.8 14.1A8.5 8.5 0 0 1 9.9 3.2 8.7 8.7 0 1 0 20.8 14.1Z"/>,
  "arrow-up-right": <><path d="M7 17 17 7M7 7h10v10"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4.2 4.2L19 6.5"/>,
  alert: <><path d="M12 3 22 20H2z"/><path d="M12 9v4m0 3h.01"/></>,
  file: <><path d="M6 3.75h8l4 4v12.5H6z"/><path d="M14 3.75v4h4M9 13h6M9 16h4"/></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M11 21v-3h2v3"/></>,
  sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
  activity: <><path d="M3 12h4l3-7 4 14 3-7h4"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  "credit-card": <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  "eye-off": <><path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.2 6.4C3.5 8.1 2 12 2 12s3.5 6 10 6a10 10 0 0 0 2.4-.3"/><path d="M9.8 9.8a3.1 3.1 0 0 0 4.4 4.4"/></>,
};

export function Icon({ name, size = 20, strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
