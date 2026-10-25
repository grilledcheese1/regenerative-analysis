import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NextMoveEntry from "@/components/story/NextMoveEntry";

export const metadata: Metadata = {
  title: "Regentic",
  description: "Vehicle ownership decisions from your driving, contract and budget.",
};

export default async function NextMovePage({ searchParams }: { searchParams: Promise<{ view?: string; as?: string }> }) {
  const { view, as } = await searchParams;
  if (view === "details") redirect(as ? `/home?as=${encodeURIComponent(as)}` : "/home"); // old link
  return <NextMoveEntry as={as} />;
}
