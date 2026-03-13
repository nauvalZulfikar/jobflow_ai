export default function ApplicationsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-gray-200" />
      {/* Column toggles skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-gray-200" />
        ))}
      </div>
      {/* Kanban columns skeleton */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minWidth: '1680px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-64 flex-none space-y-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-5 w-6 rounded-full bg-gray-200" />
            </div>
            <div className="min-h-[80px] rounded-xl bg-gray-50/60 p-2 space-y-2">
              {Array.from({ length: i < 2 ? 2 : 1 }).map((_, j) => (
                <div key={j} className="h-24 rounded-lg bg-white border border-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
