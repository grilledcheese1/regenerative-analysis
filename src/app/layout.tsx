import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "Regentic",
  description: "Vehicle ownership decisions from your driving, contract and budget.",
};

// Next Move's look (theme.css is scoped under .nm).
const sans = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-nm", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={`nm ${sans.variable}`}>{children}</div>
      </body>
    </html>
  );
}
