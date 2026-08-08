/**
 * Helper to format reference, survey, receipt, and expense numbers based on user settings.
 */

export type ReferenceNumberFormat =
  | 'PREFIX-YYYY-SEQ'
  | 'PREFIX/SEQ/YY'
  | 'PREFIX/SEQ/YYYY'
  | 'PREFIX-SEQ'
  | 'PREFIX/YYYY/SEQ';

export interface NumberingOptions {
  prefix: string;
  formatPattern?: ReferenceNumberFormat | string;
  seq?: number;
  digits?: number;
  date?: Date;
}

export function formatReferenceNumber({
  prefix,
  formatPattern = 'PREFIX-YYYY-SEQ',
  seq = 1,
  digits = 3,
  date = new Date(),
}: NumberingOptions): string {
  const cleanPrefix = (prefix || 'REF').trim();
  const year4 = date.getFullYear().toString();
  const year2 = year4.slice(-2);
  const paddedSeq = String(seq || 1).padStart(digits || 3, '0');

  switch (formatPattern) {
    case 'PREFIX/SEQ/YY':
      return `${cleanPrefix}/${paddedSeq}/${year2}`;
    case 'PREFIX/SEQ/YYYY':
      return `${cleanPrefix}/${paddedSeq}/${year4}`;
    case 'PREFIX-SEQ':
      return `${cleanPrefix}-${paddedSeq}`;
    case 'PREFIX/YYYY/SEQ':
      return `${cleanPrefix}/${year4}/${paddedSeq}`;
    case 'PREFIX-YYYY-SEQ':
    default:
      return `${cleanPrefix}-${year4}-${paddedSeq}`;
  }
}
