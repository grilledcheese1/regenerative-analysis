import RouteMap from "@/components/RouteMap";

export default function Home() {
  return (
    <main>
      <span className="label">01 · Map</span>
      <h1>Regen Coach</h1>
      <p>Regenerative braking analysis and coaching.</p>
      <RouteMap />
    </main>
  );
}
