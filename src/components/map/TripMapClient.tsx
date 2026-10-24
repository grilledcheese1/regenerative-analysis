"use client";

import dynamic from "next/dynamic";

/** Client-only entry point: Mapbox GL needs `window`, so it never renders on the server. */
const TripMapClient = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="trip-map" aria-busy="true" />,
});

export default TripMapClient;
