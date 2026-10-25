"use client";

import { useSyncExternalStore } from "react";
import { useCaseStudyId } from "@/components/auth/caseStudy";
import { persona } from "@/fixtures/personas";
import NextMoveApp from "../next-move/NextMoveApp";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** /home: the tabbed screens. `?as=<id>` picks the person; otherwise the signed-in person, otherwise the first. */
export default function DetailsEntry({ as }: { as?: string }) {
  const cookieId = useCaseStudyId();
  const hydrated = useHydrated();
  const id = [as, cookieId].find((x) => x && persona(x)) ?? null;

  if (!hydrated) return null;
  return <NextMoveApp key={id ?? "none"} {...(id ? { initialPersonaId: id } : {})} />;
}
