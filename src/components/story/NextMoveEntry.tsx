"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import SignIn from "@/components/auth/SignIn";
import { useSignedInId } from "@/components/auth/auth";
import { PEOPLE, persona } from "@/fixtures/personas";
import { StaggerItem, StaggerList, MotionProvider } from "./motion";
import Story from "./Story";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** /next-move: sign in, then the scroll story. the tabbed screens live at /home; `?as=<id>` skips sign-in. */
export default function NextMoveEntry({ as }: { as?: string }) {
  const cookieId = useSignedInId();
  const hydrated = useHydrated();
  const id = [as, cookieId].find((x) => x && persona(x)) ?? null;

  return (
    <>
      <header className="header">
        <div className="wordmark">
          <Image src="/regentic-logo.png" alt="" width={310} height={286} className="wordmark__logo" priority />
          <span>Regen<em>tic</em></span>
        </div>
        <nav className="story-nav" aria-label="Views">
          {id && <Link href="/home" className="linkish">Details view</Link>}
          {id && <SignIn variant="ghost" />}
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
                  Sign in as one of {PEOPLE.length} simulated people. Each has their own contract, bank history and commute.
                  Everything here is simulated and every number is an estimate. There are no real accounts.
                </p>
              </StaggerItem>
              <StaggerItem><SignIn label="Sign in to see your move" variant="primary" /></StaggerItem>
              <StaggerItem>
                <Link href="/home" className="linkish">Or open the detailed screens without signing in</Link>
              </StaggerItem>
            </StaggerList>
          </MotionProvider>
        )}
      </main>
    </>
  );
}
