import type { CSSProperties } from "react";

type Body = "sedan" | "suv";
// Drawn silhouettes in one flat style. The shape follows the model's body; the color is a quiet per-model tint.
const BODY: Record<string, { body: Body; color: string }> = {
  camry_hybrid_le_2024: { body: "sedan", color: "#8c97a3" },
  camry_hev_le_2025: { body: "sedan", color: "#a93a46" },
  corolla_hybrid_2025: { body: "sedan", color: "#5d7ea8" },
  corolla_2016: { body: "sedan", color: "#aeb4bb" },
  rav4_awd_2021: { body: "suv", color: "#6b7a68" },
  rav4_hybrid_awd_2025: { body: "suv", color: "#34495e" },
};

const SEDAN = "M30 150 C30 134 44 128 74 124 L132 106 C160 88 196 78 248 78 L338 78 C384 78 418 94 446 116 L500 124 C532 128 552 136 552 152 L552 166 L30 166 Z";
const SUV = "M30 152 C30 134 42 130 68 126 L112 108 C124 74 148 52 190 50 L404 50 C440 50 462 72 478 106 L508 120 C536 128 552 138 552 154 L552 168 L30 168 Z";

/** Decorative vehicle illustration (aria-hidden). Pass the catalog id; unknown ids get a neutral sedan. */
export default function CarArt({ catalogId, className, style }: { catalogId: string; className?: string; style?: CSSProperties }) {
  const { body, color } = BODY[catalogId] ?? { body: "sedan" as Body, color: "#8c97a3" };
  const suv = body === "suv";
  return (
    <svg className={className} style={style} viewBox="0 0 580 220" role="presentation" aria-hidden="true" focusable="false">
      <ellipse cx="292" cy="186" rx="262" ry="12" fill="rgb(0 0 0 / 0.14)" />
      <path d={suv ? SUV : SEDAN} fill={color} />
      <path d={suv ? SUV : SEDAN} fill="url(#nm-car-shade)" />
      {suv ? (
        <path d="M146 104 C156 80 170 62 196 60 L296 60 L296 106 L134 106 Z M306 60 L396 60 C420 60 436 76 448 106 L306 106 Z" fill="#dfe8ef" opacity="0.9" />
      ) : (
        <path d="M150 112 C176 90 206 86 248 86 L318 86 L318 116 L140 116 Z M328 86 L360 86 C394 86 414 100 432 116 L328 116 Z" fill="#dfe8ef" opacity="0.9" />
      )}
      <rect x="40" y="152" width="40" height="8" rx="4" fill="#fff6d6" opacity="0.9" />
      <rect x="500" y="148" width="44" height="8" rx="4" fill="#ff5a5f" opacity="0.8" />
      <g>
        <circle cx="140" cy="166" r="29" fill="#1a1d22" />
        <circle cx="140" cy="166" r="15" fill="#cfd5da" />
        <circle cx="140" cy="166" r="6" fill="#8a929a" />
        <circle cx="450" cy="166" r="29" fill="#1a1d22" />
        <circle cx="450" cy="166" r="15" fill="#cfd5da" />
        <circle cx="450" cy="166" r="6" fill="#8a929a" />
      </g>
      <defs>
        <linearGradient id="nm-car-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
    </svg>
  );
}
