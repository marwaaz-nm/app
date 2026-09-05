/** Random UUIDv4 capability issued to the document holder. Never derive it from an ID. */
export function isPublicReferenceCode(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeSheetReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = /^NM\/(\d{1,8})\/(\d{2}|\d{4})$/.exec(compact);
  if (!match) return null;
  return `NM/${match[1]}/${match[2].length === 4 ? match[2].slice(-2) : match[2]}`;
}
