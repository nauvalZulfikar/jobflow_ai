export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-8 w-12 rounded bg-gray-200" />
            </div>
            <div className="h-12 w-12 rounded-xl bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  )
}
