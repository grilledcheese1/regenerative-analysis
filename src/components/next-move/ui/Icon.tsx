import type { ReactNode } from "react";

// Small line-icon set drawn for this app (24×24, stroke follows currentColor). Decorative: always aria-hidden.
const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  car: <><path d="M4 16v-3.2L6 8.5A2 2 0 0 1 7.8 7.3h8.4a2 2 0 0 1 1.8 1.2l2 4.3V16" /><path d="M3.5 16h17" /><circle cx="7.5" cy="16.5" r="1.7" /><circle cx="16.5" cy="16.5" r="1.7" /><path d="M6.5 12.5h11" /></>,
  money: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M12 12.7v4.6M13.8 13.8c-.5-.6-3.6-.9-3.6.5 0 1.6 3.6.6 3.6 2.200 0 1.300-3 1.100-3.700.4" /></>,
  bars: <><path d="M5 20v-6M12 20V6M19 20v-9" /></>,
  pointer: <><path d="M9 11V5.500a1.500 1.500 0 0 1 3 0V11" /><path d="M12 10.500a1.500 1.500 0 0 1 3 0V12a1.500 1.500 0 0 1 3 0v3.500c0 3-2 5-5 5h-1.500c-2 0-3-.8-4.300-2.500L5 14.500a1.500 1.500 0 0 1 2.300-1.900L9 14" /><path d="M5 4.500 3.500 3M8 2.800 7.500 1.500" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.800v2.400M12 18.800v2.400M21.200 12h-2.400M5.200 12H2.800M18.500 5.500l-1.700 1.700M7.200 16.800l-1.700 1.700M18.500 18.500l-1.700-1.700M7.200 7.200 5.500 5.500" /><circle cx="12" cy="12" r="6.800" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2.500" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.500" /><circle cx="12" cy="12" r="1" /></>,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 15.500h5" /></>,
  fuel: <><path d="M5 20V5.500A1.500 1.500 0 0 1 6.500 4h6A1.500 1.500 0 0 1 14 5.500V20" /><path d="M4 20h11M5 10h9" /><path d="M14 8.500h1.800a1.700 1.700 0 0 1 1.700 1.700v5a1.300 1.300 0 0 0 2.600 0V9.200L18 7" /></>,
  pie: <><path d="M12 4a8 8 0 1 0 8 8h-8z" /><path d="M15 3.500A8 8 0 0 1 20.500 9H15z" /></>,
  gauge: <><path d="M4.500 17A8.500 8.500 0 1 1 19.500 17" /><path d="M12 13.500 15.500 9" /><circle cx="12" cy="13.500" r="1" /></>,
  dollar: <><circle cx="12" cy="12" r="8.500" /><path d="M14.800 9.500c-.5-1-1.500-1.500-2.800-1.500-1.600 0-2.700.8-2.700 2 0 3 5.600 1.200 5.600 4.200 0 1.200-1.200 2-2.900 2-1.400 0-2.500-.6-3-1.700M12 6.500V8M12 16v1.500" /></>,
  clock: <><circle cx="12" cy="12" r="8.500" /><path d="M12 7.500V12l3 2" /></>,
  coins: <><ellipse cx="12" cy="6.500" rx="6.500" ry="2.500" /><path d="M5.500 6.500v5c0 1.400 2.900 2.500 6.500 2.500s6.500-1.100 6.500-2.500v-5" /><path d="M5.500 11.500v5c0 1.400 2.900 2.500 6.500 2.500s6.500-1.100 6.500-2.500v-5" /></>,
  house: <><path d="M3 11.500 12 4l9 7.500" /><path d="M5.500 10v9.500h13V10" /><path d="M10 19.500v-5h4v5" /></>,
  shield: <><path d="M12 3 5 5.800v5.700c0 4.200 2.800 7.500 7 9.500 4.200-2 7-5.300 7-9.500V5.800z" /><path d="m9 12 2.200 2.200L15.500 10" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1-1" /></>,
  bank: <><path d="M3.500 9.500 12 4l8.500 5.500z" /><path d="M5.500 10v7.500M9.800 10v7.500M14.200 10v7.500M18.500 10v7.500M4 20h16" /></>,
  piggy: <><path d="M5 11.500c0-3 2.800-5 6.500-5 1.500 0 2.800.3 3.800.9L19 6l-.5 3c1 .8 1.500 1.700 1.500 2.800 0 1-.4 1.800-1 2.500V17h-3v-1.500h-5V17h-3v-2.200C6 14 5 12.900 5 11.500z" /><circle cx="15.800" cy="11" r=".6" /><path d="M3.500 11.500H5" /></>,
  card: <><rect x="3.500" y="6" width="17" height="12" rx="2.500" /><path d="M3.500 10h17M7 14.500h3" /></>,
  bulb: <><path d="M9 17.500h6M10 20.500h4" /><path d="M12 3.500a5.500 5.500 0 0 0-3.300 9.900c.5.500.8 1.100.8 1.800V16h5v-.8c0-.7.3-1.300.8-1.800A5.500 5.500 0 0 0 12 3.500z" /></>,
  trash: <><path d="M5 7h14M10 7V4.500h4V7M7 7l.8 12.500h8.400L17 7" /><path d="M10.500 11v5.500M13.500 11v5.500" /></>,
  info: <><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5.500M12 7.800v.2" /></>,
  chevron: <path d="m6 9.500 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  alert: <><circle cx="12" cy="12" r="8.500" /><path d="M12 7.500v5.500M12 16.200v.1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M18.400 5.600 17 7M7 17l-1.400 1.400" /></>,
  moon: <path d="M19.500 14.500A8 8 0 0 1 9.500 4.500a8 8 0 1 0 10 10z" />,
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
