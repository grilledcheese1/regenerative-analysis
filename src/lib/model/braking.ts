export interface BrakingSplit {
  mechanicalRegenKw: number; // braking taken by the motor at the wheels
  capturedKw: number; // what reaches the battery
  frictionKw: number; // friction brake heat
  conversionLossKw: number; // motor and battery losses, not brake heat
  limit: "demand" | "motor" | "grip" | "battery";
}

/**
 * Split braking demand between regen and friction. Limits sit on the mechanical side of
 * the path, so battery acceptance is divided by capture efficiency. Demand always equals
 * captured + friction + conversion loss.
 */
export function splitBraking(
  brakingKw: number,
  motorMechanicalLimitKw: number,
  drivenWheelGripLimitKw: number,
  batteryAcceptanceKw: number,
  captureEfficiency: number,
): BrakingSplit {
  if (!(captureEfficiency > 0 && captureEfficiency <= 1)) throw new Error("capture efficiency must be in (0, 1]");
  const caps = [
    ["demand", brakingKw],
    ["motor", motorMechanicalLimitKw],
    ["grip", drivenWheelGripLimitKw],
    ["battery", batteryAcceptanceKw / captureEfficiency],
  ] as const;
  const [limit, mechanicalRegenKw] = caps.reduce((lo, c) => (c[1] < lo[1] ? c : lo));
  const capturedKw = captureEfficiency * mechanicalRegenKw;
  return {
    mechanicalRegenKw,
    capturedKw,
    frictionKw: brakingKw - mechanicalRegenKw,
    conversionLossKw: mechanicalRegenKw - capturedKw,
    limit,
  };
}
