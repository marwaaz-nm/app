import type { Survey } from '@/types';

export type SurveyDisplayStatus = 'Draft' | 'Completed';

// Mirrors MapExplorer's coordinate parsing — a valid parcel needs at least 3 points.
function countPolygonPoints(polyString: string | undefined): number {
  if (!polyString || polyString === 'N/A' || polyString.trim() === '') return 0;
  return polyString
    .split(';')
    .map((coord) => coord.trim())
    .filter((coord) => coord.length > 0).length;
}

// The records table uses a simple data-completeness status. Workflow states stored in
// the database are separate: every required table value earns Completed; any gap is Draft.
type CompletenessFields = Pick<
  Survey,
  | 'owner_name'
  | 'neighborhood'
  | 'branch'
  | 'land_type'
  | 'boundary_w_val'
  | 'boundary_b_val'
  | 'boundary_k_val'
  | 'boundary_g_val'
  | 'gps_location'
  | 'polygon_boundary'
>;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && value.trim() !== 'N/A');
}

export function isSurveyComplete(survey: CompletenessFields): boolean {
  return Boolean(
    hasText(survey.owner_name) &&
    hasText(survey.neighborhood) &&
    hasText(survey.branch) &&
    hasText(survey.land_type) &&
    hasText(survey.boundary_w_val) &&
    hasText(survey.boundary_b_val) &&
    hasText(survey.boundary_k_val) &&
    hasText(survey.boundary_g_val) &&
    hasText(survey.gps_location) &&
    survey.gps_location?.trim() !== '0.0, 0.0' &&
    countPolygonPoints(survey.polygon_boundary) >= 3,
  );
}

export function displayStatus(survey: CompletenessFields): SurveyDisplayStatus {
  return isSurveyComplete(survey) ? 'Completed' : 'Draft';
}
