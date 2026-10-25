"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useCaseStudyId } from "@/components/auth/caseStudy";
import { useMyProfile } from "@/components/onboarding/useMyProfile";
import { PEOPLE, persona } from "@/fixtures/personas";
import NextMoveApp from "../next-move/NextMoveApp";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * /home: the tabbed screens. An open case study (or `?as=<id>`) wins; otherwise the signed-in
 * user's own profile (no profile yet → onboarding); signed out → the case studies.
 */
export default function DetailsEntry({ as }: { as?: string }) {
  const router = useRouter();
  const caseStudyId = useCaseStudyId();
  const hydrated = useHydrated();
  const mine = useMyProfile();
  const caseId = [as, caseStudyId].find((x) => x && persona(x)) ?? null;

  useEffect(() => {
    if (hydrated && !caseId && mine.status === "none") router.replace("/onboarding");
  }, [hydrated, caseId, mine.status, router]);

  if (!hydrated) return null;
  if (caseId) return <NextMoveApp key={caseId} people={PEOPLE} initialPersonaId={caseId} />;
  if (mine.status === "ready" && mine.persona) return <NextMoveApp key={mine.persona.id} people={[mine.persona]} userBanking={mine.profile!.banking} />;
  if (mine.status === "signed_out") return <NextMoveApp key="none" people={PEOPLE} />;
  return null;
}
