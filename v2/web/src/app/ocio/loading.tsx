export default function OcioLoading() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-light py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 h-3 w-24 rounded bg-bg-secondary animate-pulse" />
          <div className="mb-4 h-12 w-80 max-w-full rounded-xl bg-bg-secondary animate-pulse" />
          <div className="h-5 w-96 max-w-full rounded-lg bg-bg-secondary animate-pulse" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <div className="mb-6 space-y-4">
          <div className="flex gap-3">
            <div className="h-10 flex-1 bg-bg-secondary rounded-xl animate-pulse" />
            <div className="h-10 w-44 bg-bg-secondary rounded-xl animate-pulse" />
            <div className="h-10 w-28 bg-bg-secondary rounded-xl animate-pulse" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-32 bg-bg-secondary rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-border bg-bg-primary shadow-card">
              <div className="h-44 bg-bg-secondary animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 bg-bg-secondary rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-bg-secondary rounded animate-pulse" />
                <div className="h-3 w-full bg-bg-secondary rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
