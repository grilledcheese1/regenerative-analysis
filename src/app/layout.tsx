import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Move",
  description: "Vehicle ownership decisions from your driving, contract and budget.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
