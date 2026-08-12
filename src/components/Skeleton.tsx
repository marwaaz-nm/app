// Shared skeleton placeholders — mirrors the pulsing-block loading style used on the
// Dashboard page, so every list/table page loads the same way instead of a spinner.

export function SkeletonRow({ withIcon = true }: { withIcon?: boolean }) {
  return (
    <div className="flex animate-pulse items-center gap-3 px-4 py-3.5 sm:px-5">
      {withIcon && <div className="h-9 w-9 shrink-0 rounded-xl bg-slate-100" />}
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 rounded bg-slate-100" />
        <div className="h-2.5 w-1/2 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function ListLoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.02)] divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function CardLoadingSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="h-[132px] animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
          <div className="h-9 w-9 rounded-xl bg-slate-100" />
          <div className="mt-4 h-5 w-24 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-32 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
