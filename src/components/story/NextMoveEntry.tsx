"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
import AuthDialog, { type AuthDialogHandle } from "@/components/auth/AuthDialog";
import CaseStudyPicker from "@/components/auth/CaseStudyPicker";
import IdentityControl from "@/components/auth/IdentityControl";
import { useCaseStudyId } from "@/components/auth/caseStudy";
import { useAccount } from "@/components/auth/useAccount";
import { PEOPLE, persona } from "@/fixtures/personas";
import { StaggerItem, StaggerList, MotionProvider } from "./motion";
import Story from "./Story";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** /: create an account, sign in, or explore a case study; then the scroll story. `?as=<id>` opens a case study directly. */
export default function NextMoveEntry({ as }: { as?: string }) {
  const caseStudyId = useCaseStudyId();
  const { account } = useAccount();
  const hydrated = useHydrated();
  const auth = useRef<AuthDialogHandle>(null);
  const id = [as, caseStudyId].find((x) => x && persona(x)) ?? null;

  return (
    <>
      <header className="header">
        <div className="wordmark">
          <Image src="/regentic-logo.png" alt="" width={310} height={286} className="wordmark__logo" priority />
          <span>Regen<em>tic</em></span>
        </div>
        <nav className="story-nav" aria-label="Views">
          {id && !account && <Link href="/home" className="linkish">Details view</Link>}
          <IdentityControl />
        </nav>
      </header>
      <main className={id ? "story-page" : undefined}>
        {!hydrated ? null : id ? (
          <Story key={id} personaId={id} />
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
            </StaggerList>
          </MotionProvider>
        )}
      </main>
      <AuthDialog ref={auth} />
    </>
  );
}
