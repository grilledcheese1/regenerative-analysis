import TripView from "@/components/map/TripView";
import sample from "../../../data/trips/sample.json";
import type { Trip } from "@/lib/trip/types";

export const metadata = { title: "Trip replay · Regen Coach" };

export default function TripPage() {
  return (
    <main>
      <span className="label">01 · Map</span>
      <h1>Trip replay</h1>
      <TripView trip={sample as Trip} />
    </main>
  );
}
