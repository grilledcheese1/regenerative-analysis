// Drive import thresholds. Every value here is a prototype setting chosen for the demo,
// not a validated threshold from recorded-drive studies.

export const GAP_BREAK_S = 30; // prototype: a longer gap between points starts a new segment
export const SPARSE_MEDIAN_S = 2; // prototype (spec): median interval above two seconds restricts event analysis
export const ACCURACY_MAX_M = 25; // prototype: points less accurate than this are excluded from speed derivatives
export const MIN_POINTS = 10; // prototype: fewer usable points than this and the route isn't drawable
export const CITY_SPEED_MPS = 20.1; // prototype: 45 mph; distance driven below this counts as city
export const SHARP_DECEL_MPS2 = 3.0; // prototype: sustained ≥ 2 s counts as one sharp deceleration observed
export const SHARP_DECEL_MIN_S = 2; // prototype: how long the deceleration must last
export const SHARP_DECEL_MERGE_S = 3; // prototype: runs closer together than this are one event
export const MOVING_SPEED_MPS = 0.5; // prototype: slower than this counts as stopped
export const DUPLICATE_SAME_PLACE_M = 2; // prototype: same-time points within this distance are one point
export const SPEED_COVERAGE_MIN = 0.8; // prototype: share of distance that needs a speed for speedAvailable
export const MAX_TRACK_POINTS = 200_000; // prototype: upload cap on points
export const MAX_XML_DEPTH = 12; // prototype: GPX needs about 7 levels
export const PREVIEW_POINTS = 500; // prototype: decimated geometry size returned by the API

export const METERS_PER_MILE = 1609.344;
export const DEFAULT_WEEKS_PER_YEAR = 48; // spec: vacation weeks excluded
