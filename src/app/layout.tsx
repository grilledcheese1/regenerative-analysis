import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regen Coach",
  description: "Replay simulated hybrid drives, score regenerative braking, and get coaching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
