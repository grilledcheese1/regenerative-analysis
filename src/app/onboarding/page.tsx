import type { Metadata } from "next";
import Onboarding from "@/components/onboarding/Onboarding";

export const metadata: Metadata = { title: "Set up · Regentic" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  return <Onboarding edit={edit === "1"} />;
}
