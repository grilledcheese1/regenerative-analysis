"use client";

import dynamic from "next/dynamic";

/** Client-only: MapLibre needs `window`. Shows a dark panel of the same size while it loads. */
const HomeHeroClient = dynamic(() => import("./HomeHero"), {
  ssr: false,
  loading: () => <section className="nm-hero" aria-busy="true" />,
});

export default HomeHeroClient;
