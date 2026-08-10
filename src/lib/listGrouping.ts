export type ListGroup<T> = { key: string; label: string; items: T[] };

// Groups items by a derived key, preserving the order the keys were first seen in —
// so if the caller sorts `items` first, the groups come out in that same order too.
export function groupItems<T>(items: T[], getKey: (item: T) => string): ListGroup<T>[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }

  return order.map((key) => ({ key, label: key, items: buckets.get(key)! }));
}

const dateLabelFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

// A stable "day" key for grouping by date (e.g. "2026-08-05"), plus a display label.
export function dateGroupKey(value?: string | null): { key: string; label: string } {
  if (!value) return { key: '9999-99-99', label: 'No date' };
  const date = new Date(value);
  if (isNaN(date.getTime())) return { key: '9999-99-99', label: 'No date' };
  return { key: date.toISOString().slice(0, 10), label: dateLabelFormatter.format(date) };
}
