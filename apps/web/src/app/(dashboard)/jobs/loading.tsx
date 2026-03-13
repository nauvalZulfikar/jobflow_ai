export default function JobsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-8 w-40 rounded-lg bg-gray-200" />
          <div className="h-4 w-56 rounded-lg bg-gray-100" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-gray-200" />
      </div>
      {/* Search bar skeleton */}
      <div className="h-12 w-full rounded-xl bg-white border border-gray-100 shadow-sm" />
      {/* Job cards */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-5 w-48 rounded bg-gray-200" />
                <div className="h-4 w-32 rounded bg-gray-100" />
              </div>
              <div className="h-8 w-20 rounded-full bg-gray-100" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-24 rounded-full bg-gray-100" />
              <div className="h-6 w-20 rounded-full bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
