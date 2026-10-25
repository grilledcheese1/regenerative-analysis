"use client";

import dynamic from "next/dynamic";
import { FREE_MAP_CONFIG } from "./config";

/** Client-only entry point: MapLibre GL needs `window`, so it never renders on the server. */
const FreeTripMapClient = dynamic(() => import("./FreeTripMap"), {
  ssr: false,
  loading: () => <div aria-busy="true" style={{ height: FREE_MAP_CONFIG.height }} />,
});

export default FreeTripMapClient;
