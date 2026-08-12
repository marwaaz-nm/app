import type { Survey, SurveyStatus } from '@/types';

// Mirrors MapExplorer's coordinate parsing — a valid parcel needs at least 3 points.
function countPolygonPoints(polyString: string | undefined): number {
  if (!polyString || polyString === 'N/A' || polyString.trim() === '') return 0;
  return polyString
    .split(';')
    .map((coord) => coord.trim())
    .filter((coord) => coord.length > 0).length;
}

// A survey can end up with its stored workflow status (Pending Review/Approved/etc.)
// while missing the data that actually makes it a usable record — most commonly the
// polygon, if it was cleared out after the status advanced. The displayed status should
// reflect that incompleteness rather than a stored status the record no longer earns.
export function isSurveyComplete(survey: Pick<Survey, 'owner_name' | 'neighborhood' | 'branch' | 'land_type' | 'polygon_boundary'>): boolean {
  return Boolean(
    survey.owner_name?.trim() &&
    survey.neighborhood?.trim() &&
    survey.branch?.trim() &&
    survey.land_type?.trim() &&
    countPolygonPoints(survey.polygon_boundary) >= 3,
  );
}

export function displayStatus(survey: Pick<Survey, 'owner_name' | 'neighborhood' | 'branch' | 'land_type' | 'polygon_boundary' | 'status'>): SurveyStatus {
  if (!isSurveyComplete(survey)) return 'Draft';
  return survey.status || 'Draft';
}
