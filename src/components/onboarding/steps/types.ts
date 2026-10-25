import type { OnboardingAnswers } from "@/contracts";

export interface StepProps {
  a: OnboardingAnswers;
  set: (update: (a: OnboardingAnswers) => OnboardingAnswers) => void;
  errors: Record<string, string>;
}
