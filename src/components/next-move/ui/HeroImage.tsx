"use client";

import { useState } from "react";

const EXTENSIONS = ["jpg", "png", "webp"];

/**
 * The car picture on Home. Drop `<catalogId>.jpg` (or .png/.webp) into public/cars/ and it appears;
 * until then the hero is just the sky gradient. Decorative, so the image has no alt text.
 */
export default function HeroImage({ catalogId }: { catalogId: string }) {
  const [attempt, setAttempt] = useState(0);
  if (attempt >= EXTENSIONS.length) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${catalogId}-${attempt}`}
      className="nm-hero__img"
      src={`/cars/${catalogId}.${EXTENSIONS[attempt]}`}
      alt=""
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}
