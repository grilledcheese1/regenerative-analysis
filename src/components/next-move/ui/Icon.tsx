import type { ReactNode } from "react";

// Line icons drawn for this app: 24×24 grid, stroke follows currentColor. Decorative, so always aria-hidden.
const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  car: <><path d="M4 16v-3.2L6 8.5a2 2 0 0 1 1.8-1.2h8.4A2 2 0 0 1 18 8.5l2 4.3V16" /><path d="M3.5 16h17" /><circle cx="7.5" cy="16.5" r="1.7" /><circle cx="16.5" cy="16.5" r="1.7" /><path d="M6.5 12.5h11" /></>,
  money: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M12 12.5v5M14 14c-.4-.7-1.1-1-2-1-1.1 0-1.9.5-1.9 1.3 0 1.8 4 .8 4 2.6 0 .8-.9 1.3-2.1 1.3-.9 0-1.6-.3-2-1" /></>,
  bars: <path d="M5 20v-6M12 20V6M19 20v-9" />,
  pointer: <><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M12 10.5a1.5 1.5 0 0 1 3 0V12a1.5 1.5 0 0 1 3 0v3.5c0 3-2 5-5 5h-1.5c-2 0-3-.8-4.3-2.5L5 14.5a1.5 1.5 0 0 1 2.3-1.9L9 14" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" /><path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3 17 7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 15.5h5" /></>,
  fuel: <><path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20" /><path d="M4 20h11M5 10h9" /><path d="M14 8.5h1.8a1.7 1.7 0 0 1 1.7 1.7v5a1.3 1.3 0 0 0 2.6 0V9.2L18 7" /></>,
  pie: <><path d="M12 4a8 8 0 1 0 8 8h-8z" /><path d="M15 3.5A8 8 0 0 1 20.5 9H15z" /></>,
  gauge: <><path d="M4.5 17A8.5 8.5 0 1 1 19.5 17" /><path d="m12 13.5 3.5-4.5" /><circle cx="12" cy="13.5" r="1" /></>,
  dollar: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.5c-.5-1-1.5-1.5-2.8-1.5-1.6 0-2.7.8-2.7 2 0 3 5.6 1.2 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.5-.6-3-1.7M12 6.5V8M12 16v1.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  coins: <><ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" /><path d="M5.5 6.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5M5.5 11.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" /></>,
  house: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  shield: <><path d="M12 3 5 5.8v5.7c0 4.2 2.8 7.5 7 9.5 4.2-2 7-5.3 7-9.5V5.8z" /><path d="m9 12 2.2 2.2 4.3-4.2" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  bank: <><path d="M3.5 9.5 12 4l8.5 5.5z" /><path d="M5.5 10v7.5M9.8 10v7.5M14.2 10v7.5M18.5 10v7.5M4 20h16" /></>,
  piggy: <><path d="M5 11.5c0-3 2.8-5 6.5-5 1.5 0 2.8.3 3.8.9L19 6l-.5 3c1 .8 1.5 1.7 1.5 2.8 0 1-.4 1.8-1 2.5V17h-3v-1.5h-5V17h-3v-2.2C6 14 5 12.9 5 11.5z" /><circle cx="15.8" cy="11" r=".6" /></>,
  card: <><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10h17M7 14.5h3" /></>,
  bulb: <><path d="M9 17.5h6M10 20.5h4" /><path d="M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.5.8 1.1.8 1.8V16h5v-.8c0-.7.3-1.3.8-1.8A5.5 5.5 0 0 0 12 3.5z" /></>,
  trash: <><path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7" /><path d="M10.5 11v5.5M13.5 11v5.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></>,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2v.1" /></>,
  chevron: <path d="m6 9.5 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
