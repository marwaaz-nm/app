export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 6 && digits.length <= 12 ? digits : null;
}

export function documentContainsPhone(text: unknown, requestedPhone: string): boolean {
  if (typeof text !== 'string') return false;
  const candidates = new Set<string>();
  for (const match of text.matchAll(/\d{6,15}/g)) {
    const normalized = normalizePhone(match[0]);
    if (normalized) candidates.add(normalized);
  }
  for (const match of text.matchAll(/\+?\d(?:[\d ()-]{4,18}\d)/g)) {
    const normalized = normalizePhone(match[0]);
    if (normalized) candidates.add(normalized);
  }
  return candidates.has(requestedPhone);
}
