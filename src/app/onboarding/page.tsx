import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Set up · Regentic" };

// Placeholder until the onboarding wizard lands.
export default function OnboardingPage() {
  return (
    <main className="home">
      <h1 className="home__title">Let&rsquo;s set up your profile</h1>
      <p className="story__lede">Onboarding is coming in the next step.</p>
      <Link href="/home" className="linkish">Go to the details view</Link>
    </main>
  );
}
