import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { TripPoint } from "@/contracts";
import { MAX_TRACK_POINTS, MAX_XML_DEPTH } from "./constants";
import { fail, num, point, validLatLon, type ParsedPoints, type ParseFailure } from "./types";

type Node = Record<string, unknown>;

const ARRAY_TAGS = new Set(["trk", "trkseg", "trkpt"]);

// Option names verified against fast-xml-parser 5.11.2 (src/xmlparser/OptionsBuilder.js).
const parser = new XMLParser({
  processEntities: false, // no entity expansion at all; DOCTYPE/ENTITY are also refused before parsing
  htmlEntities: false,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false, // keep strings; we parse numbers ourselves
  parseAttributeValue: false,
  removeNSPrefix: true, // gpxtpx:speed → speed
  maxNestedTags: MAX_XML_DEPTH + 1,
  isArray: (tagName, _jPath, _isLeaf, isAttribute) => !isAttribute && ARRAY_TAGS.has(tagName),
});

/** Max element nesting depth, counted from tags without building a tree. */
export function xmlDepth(text: string): number {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  let depth = 0;
  let max = 0;
  for (const m of stripped.matchAll(/<(\/?)[A-Za-z_][^>]*?(\/?)>/g)) {
    if (m[1]) depth--;
    else if (!m[2]) max = Math.max(max, ++depth);
    else max = Math.max(max, depth + 1);
  }
  return max;
}

/** Refusals checked on the raw text, before any XML parser sees it. */
export function precheckGpx(text: string): ParseFailure | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    return fail(400, "unsupported_xml_feature", "GPX files with a DOCTYPE or entity declarations aren't accepted.");
  }
  const enc = text.match(/^\s*<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i)?.[1];
  if (enc && !/^utf-?8$/i.test(enc)) {
    return fail(400, "unsupported_encoding", `This file says it is ${enc}. Only UTF-8 GPX files are accepted.`);
  }
  if (text.startsWith("PK\x03\x04") || text.startsWith("\x1f\x8b")) {
    return fail(400, "archive_not_supported", "Compressed files aren't supported. Upload the .gpx file itself.");
  }
  if (xmlDepth(text) > MAX_XML_DEPTH) {
    return fail(400, "xml_too_deep", "This file is nested more deeply than any GPX track needs.");
  }
  const trkpts = text.match(/<trkpt[\s>/]/g)?.length ?? 0;
  if (trkpts > MAX_TRACK_POINTS) {
    return fail(413, "too_many_points", `This track has ${trkpts.toLocaleString()} points; the limit is ${MAX_TRACK_POINTS.toLocaleString()}.`);
  }
  return null;
}

const arr = (v: unknown): Node[] => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []) as Node[];
const text = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as Node)["#text"] === "string" ? ((v as Node)["#text"] as string) : null;

function isoTime(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const ms = Date.parse(s.trim());
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Speed only from the two extensions whose unit is defined as m/s; anything else is ignored. */
function extensionSpeed(ext: unknown): number | null {
  const e = arr(ext)[0];
  if (!e) return null;
  const plain = num(text(e.speed)); // GPX extensions/speed (m/s)
  if (plain !== null) return plain >= 0 ? plain : null;
  const garmin = num(text(arr(e.TrackPointExtension)[0]?.speed)); // Garmin TrackPointExtension v2 speed (m/s)
  return garmin !== null && garmin >= 0 ? garmin : null;
}

export function parseGpx(input: string): ParsedPoints | ParseFailure {
  const refused = precheckGpx(input);
  if (refused) return refused;
  if (XMLValidator.validate(input) !== true) return fail(400, "gpx_malformed", "This GPX file isn't well-formed XML.");

  let doc: Node;
  try {
    doc = parser.parse(input) as Node;
  } catch {
    return fail(400, "gpx_malformed", "This GPX file couldn't be read.");
  }
  const gpx = arr(doc.gpx)[0];
  if (!gpx) return fail(400, "unsupported_format", "This file has no <gpx> element.");

  const trks = arr(gpx.trk);
  if (!trks.length) {
    if (gpx.rte || gpx.wpt) return fail(422, "gpx_route_not_track", "This file has a planned route, not a recorded drive.");
    return fail(422, "gpx_no_track_points", "This GPX file has no track points.");
  }

  let originalCount = 0;
  let droppedCount = 0;
  const tracks: TripPoint[][][] = [];
  for (const trk of trks) {
    const segments: TripPoint[][] = [];
    for (const seg of arr(trk.trkseg)) {
      const pts: TripPoint[] = [];
      for (const p of arr(seg.trkpt)) {
        originalCount++;
        const lat = num(p.lat);
        const lon = num(p.lon);
        if (lat === null || lon === null || !validLatLon(lat, lon)) {
          droppedCount++;
          continue;
        }
        // hdop is a dilution factor, not meters, so it is not used for accuracyM.
        pts.push(point(lat, lon, { t: isoTime(p.time), altitudeM: num(text(p.ele)), observedSpeedMps: extensionSpeed(p.extensions) }));
      }
      if (pts.length) segments.push(pts);
    }
    if (segments.length) tracks.push(segments);
  }
  if (!tracks.length) return fail(422, "gpx_no_track_points", "This GPX file has no usable track points.");
  return { ok: true, tracks, originalCount, droppedCount };
}
