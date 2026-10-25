import type { Metadata } from "next";
import NextMoveEntry from "@/components/story/NextMoveEntry";

export const metadata: Metadata = {
  title: "Next Move",
  description: "Vehicle ownership decisions from your driving, contract and budget.",
};

export default async function NextMovePage({ searchParams }: { searchParams: Promise<{ view?: string; as?: string }> }) {
  const { view, as } = await searchParams;
  return <NextMoveEntry view={view} as={as} />;
}
