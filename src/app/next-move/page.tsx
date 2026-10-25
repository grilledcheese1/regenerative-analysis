import type { Metadata } from "next";
import NextMoveApp from "@/components/next-move/NextMoveApp";

export const metadata: Metadata = {
  title: "Next Move",
  description: "Vehicle ownership decisions from your driving, contract and budget.",
};

export default function NextMovePage() {
  return <NextMoveApp />;
}
