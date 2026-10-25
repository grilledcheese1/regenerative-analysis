import styles from "./ImportDrive.module.css";

const W = 320;
const H = 180;
const PAD = 12;

/**
 * The trip's own geometry, no map tiles: an equirectangular projection fitted to the bounding box.
 * Each segment is its own polyline, so a recording gap shows as a break, never a bridged line.
 */
export default function TripPreview({ geometry, segmentBreaks, label }: { geometry: [number, number][]; segmentBreaks: number[]; label: string }) {
  if (geometry.length < 2) return null;
  const lons = geometry.map((g) => g[0]);
  const lats = geometry.map((g) => g[1]);
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const project = ([lon, lat]: [number, number]) => [offX + (lon - minLon) * kx * scale, H - offY - (lat - minLat) * scale] as const;

  const bounds = [0, ...segmentBreaks, geometry.length];
  const segments = bounds.slice(1).map((end, i) => geometry.slice(bounds[i], end));
  const [sx, sy] = project(geometry[0]);
  const [ex, ey] = project(geometry[geometry.length - 1]);

  return (
    <svg className={styles.preview} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {segments.map((seg, i) => (
        <polyline key={i} className={styles.track} points={seg.map((g) => project(g).map((v) => v.toFixed(1)).join(",")).join(" ")} />
      ))}
      <circle className={styles.start} cx={sx} cy={sy} r={5} />
      <circle className={styles.end} cx={ex} cy={ey} r={5} />
    </svg>
  );
}
