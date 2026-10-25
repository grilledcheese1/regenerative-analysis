"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import AuthDialog, { type AuthDialogHandle } from "@/components/auth/AuthDialog";
import CaseStudyPicker from "@/components/auth/CaseStudyPicker";
import IdentityControl from "@/components/auth/IdentityControl";
import { useCaseStudyId } from "@/components/auth/caseStudy";
import { useAccount } from "@/components/auth/useAccount";
import { useMyProfile } from "@/components/onboarding/useMyProfile";
import { PEOPLE, persona } from "@/fixtures/personas";
import { StaggerItem, StaggerList, MotionProvider } from "./motion";
import Story from "./Story";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * /: create an account, sign in, or explore a case study; then the scroll story. An open case study
 * (or `?as=<id>`) wins; a signed-in user sees their own story, or onboarding if they have no profile.
 */
export default function NextMoveEntry({ as }: { as?: string }) {
  const caseStudyId = useCaseStudyId();
  const { account } = useAccount();
  const hydrated = useHydrated();
  const auth = useRef<AuthDialogHandle>(null);
  const router = useRouter();
  const mine = useMyProfile();
  const caseId = [as, caseStudyId].find((x) => x && persona(x)) ?? null;
  const shown = caseId ? persona(caseId)! : mine.status === "ready" ? mine.persona : null;
  const id = shown?.id ?? null;

  useEffect(() => {
    if (hydrated && !caseId && mine.status === "none") router.replace("/onboarding");
  }, [hydrated, caseId, mine.status, router]);
  // Carry an open case study to /home, which otherwise only knows the cookie.
  const homeHref = caseId ? `/home?as=${encodeURIComponent(caseId)}` : id ? "/home" : "/";

  return (
    <>
      <header className="header">
        <Link href={homeHref} className="wordmark" aria-label="Regentic home" style={{ color: "inherit", textDecoration: "none" }}>
          <Image src="/regentic-logo.png" alt="" width={310} height={286} className="wordmark__logo" priority />
          <span>Regen<em>tic</em></span>
        </Link>
        <nav className="story-nav" aria-label="Views">
          {id && !account && <Link href={homeHref} className="linkish">Details view</Link>}
          <IdentityControl />
        </nav>
      </header>
      <main className={id ? "story-page" : undefined}>
        {!hydrated || (account && !caseId && mine.status !== "ready") ? null : id ? (
          <Story key={id} persona={shown!} initialBankingMode={caseId ? "fixture" : (mine.profile?.banking.mode ?? "fixture")} />
        ) : (
          <MotionProvider>
            <StaggerList className="home">
              <StaggerItem><p className="story__kicker">Simulated demo</p></StaggerItem>
              <StaggerItem><h1 className="home__title">What is the smartest move for you and your car?</h1></StaggerItem>
              <StaggerItem>
                <p className="story__lede">
                  Create an account to get your own plan, or explore one of {PEOPLE.length} simulated case studies. Every number is an estimate.
                </p>
              </StaggerItem>
              <StaggerItem>
                <div className="home__actions">
                  {account ? (
                    <Link href="/onboarding" className="m-btn m-btn--primary">Set up my profile</Link>
                  ) : (
                    <>
                      <button type="button" className="m-btn m-btn--primary" onClick={() => auth.current?.open("signup")}>Create an account</button>
                      <button type="button" className="m-btn m-btn--ghost" onClick={() => auth.current?.open("signin")}>Sign in</button>
                    </>
                  )}
                  <CaseStudyPicker trigger={{ label: "Explore a case study", variant: "ghost" }} />
                </div>
              </StaggerItem>
              <StaggerItem>
                <ol className="home__how" aria-label="How it works">
                  <li><strong>Tell us about your car</strong><span>Lease, loan or paid off, and how much you drive.</span></li>
                  <li><strong>Connect your bank</strong><span>Through the Capital One Nessie sandbox. Your budget and a loan pre-qualification appear instantly.</span></li>
                  <li><strong>See your next move</strong><span>Every option compared over the same three years, with the reasons behind the pick.</span></li>
                </ol>
              </StaggerItem>
            </StaggerList>
          </MotionProvider>
        )}
      </main>
      <AuthDialog ref={auth} />
    </>
  );
}
