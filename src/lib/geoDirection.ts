// Shared compass-direction helpers used wherever a land polygon's boundaries are
// labeled as Waqooyi/Bari/Koonfur/Galbeed (North/East/South/West) — the satellite map
// and sketch in DetailsModal, and the interactive draw/edit map in MiniMap.
//
// Direction is computed as the true compass bearing from the polygon's centroid to a
// boundary segment's midpoint (i.e. "which side of the plot is this"), not the
// direction the segment itself runs in. A previous version of this logic in
// DetailsModal.tsx compared raw lat/lng differences without a longitude correction,
// which is only roughly right near the equator and drifts at higher latitudes.

export type CompassDirection = 'N' | 'E' | 'S' | 'W';

export const DIRECTION_LABELS: Record<CompassDirection, string> = {
  N: 'Waqooyi',
  E: 'Bari',
  S: 'Koonfur',
  W: 'Galbeed',
};

// True compass bearing (0-360, 0 = north) from one lat/lng point to another. The
// longitude delta is scaled by cos(latitude) because a degree of longitude covers less
// ground the further you are from the equator — without that correction, bearings
// computed away from the equator skew east/west.
export function getCompassBearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const dLat = toLat - fromLat;
  const dLng = (toLng - fromLng) * Math.cos((fromLat * Math.PI) / 180);
  let bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return bearing;
}

// Buckets a bearing into one of the 4 cardinal directions, each covering a 90° quadrant
// centered on its cardinal point (e.g. North = 315°-45°).
export function bearingToDirection(bearing: number): CompassDirection {
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 315 || normalized < 45) return 'N';
  if (normalized >= 45 && normalized < 135) return 'E';
  if (normalized >= 135 && normalized < 225) return 'S';
  return 'W';
}

// Convenience: which cardinal side of (centerLat, centerLng) does (pointLat, pointLng)
// fall on.
export function getDirectionFromCenter(centerLat: number, centerLng: number, pointLat: number, pointLng: number): CompassDirection {
  return bearingToDirection(getCompassBearing(centerLat, centerLng, pointLat, pointLng));
}

export type BoundarySide = { val?: string | null; neighbor?: string | null };
export type BoundaryInfo = Partial<Record<CompassDirection, BoundarySide>>;

// Builds the label text for a boundary side, e.g. "Waqooyi — 25m — Axmed". Falls back
// to just the direction name when the survey record has no measurement/neighbor typed
// in for that side yet, rather than showing blank or fabricated values. The technical
// sketch already carries its own per-edge length numbers, so its direction labels pass
// `includeMeasurement: false` to drop the redundant "25m" and keep just the direction
// (plus neighbor, which isn't a measurement).
export function buildDirectionLabel(
  direction: CompassDirection,
  side?: BoundarySide,
  options?: { includeMeasurement?: boolean },
): string {
  const parts = [DIRECTION_LABELS[direction]];
  if (options?.includeMeasurement !== false && side?.val) parts.push(`${side.val}m`);
  if (side?.neighbor) parts.push(side.neighbor);
  return parts.join(' — ');
}

// Serialization for manually-placed direction labels (a surveyor clicks a direction
// button, then clicks the map to drop that label there) — stored as
// "N:lat,lng,rotation;E:lat,lng,rotation;..." in `surveys.boundary_label_positions`.
// `rotation` is degrees, 0 = upright text. Only directions the user has actually placed
// are included, so a record with none stored falls back to the automatic bearing
// calculation elsewhere.
export type LatLngPoint = { lat: number; lng: number; rotation?: number };
export type DirectionPositions = Partial<Record<CompassDirection, LatLngPoint>>;

export function serializeDirectionPositions(positions: DirectionPositions): string {
  return (Object.keys(positions) as CompassDirection[])
    .filter((dir) => positions[dir])
    .map((dir) => `${dir}:${positions[dir]!.lat.toFixed(6)},${positions[dir]!.lng.toFixed(6)},${Math.round(positions[dir]!.rotation ?? 0)}`)
    .join(';');
}

export function parseDirectionPositions(raw: string | null | undefined): DirectionPositions {
  const result: DirectionPositions = {};
  if (!raw || !raw.trim()) return result;
  for (const entry of raw.split(';')) {
    const [dirRaw, coordRaw] = entry.split(':');
    const dir = dirRaw?.trim().toUpperCase() as CompassDirection;
    if (!coordRaw || !['N', 'E', 'S', 'W'].includes(dir)) continue;
    const [latStr, lngStr, rotStr] = coordRaw.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const rotation = rotStr !== undefined ? parseFloat(rotStr) : 0;
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) result[dir] = { lat, lng, rotation: Number.isNaN(rotation) ? 0 : rotation };
  }
  return result;
}
