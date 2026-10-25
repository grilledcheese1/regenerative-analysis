"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import SignIn from "@/components/auth/SignIn";
import { useSignedInId } from "@/components/auth/auth";
import { PEOPLE, persona } from "@/fixtures/personas";
import NextMoveApp from "../next-move/NextMoveApp";
import { StaggerItem, StaggerList, MotionProvider } from "./motion";
import Story from "./Story";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** /next-move: sign in, then the scroll story. `?view=details` opens the tabbed screens; `?as=<id>` skips sign-in. */
export default function NextMoveEntry({ view, as }: { view?: string; as?: string }) {
  const cookieId = useSignedInId();
  const hydrated = useHydrated();
  const id = [as, cookieId].find((x) => x && persona(x)) ?? null;
  const details = view === "details";

  if (hydrated && details) return <NextMoveApp key={id ?? "none"} {...(id ? { initialPersonaId: id } : {})} />;

  return (
    <>
      <header className="header">
        <div className="wordmark">
          <span className="dot" />
          Next<em>Move</em>
        </div>
        <nav className="story-nav" aria-label="Views">
          {id && <Link href="/next-move?view=details" className="linkish">Details view</Link>}
          <Link href="/" className="linkish">Regen Coach</Link>
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
                <Link href="/next-move?view=details" className="linkish">Or open the detailed screens without signing in</Link>
              </StaggerItem>
            </StaggerList>
          </MotionProvider>
        )}
      </main>
    </>
  );
}
