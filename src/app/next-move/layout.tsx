import { Nunito_Sans } from "next/font/google";
import "./theme.css";

// Next Move's own look, scoped to this page so the Regen Coach dashboard at / keeps its style.
const sans = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-nm", display: "swap" });

export default function NextMoveLayout({ children }: { children: React.ReactNode }) {
  return <div className={`nm ${sans.variable}`}>{children}</div>;
}
