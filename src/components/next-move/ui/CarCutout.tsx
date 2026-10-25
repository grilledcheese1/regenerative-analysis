"use client";

import { useState } from "react";

/**
 * The customer's car as a background-free side view with a soft ground shadow underneath. Pictures are
 * saved to public/cars/<imageKey>.png by scripts/fetch-car-images.mjs; with no file the card is simply absent.
 */
export default function CarCutout({ imageKey, label }: { imageKey: string; label: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <figure className="car-stage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/cars/${imageKey}.png`} alt={label} loading="lazy" onError={() => setMissing(true)} />
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
