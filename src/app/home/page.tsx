import type { Metadata } from "next";
import DetailsEntry from "@/components/story/DetailsEntry";

export const metadata: Metadata = {
  title: "Home · Regentic",
  description: "Vehicle ownership decisions from your driving, contract and budget.",
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  return <DetailsEntry as={as} />;
}
