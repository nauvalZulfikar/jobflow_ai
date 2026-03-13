export default function ResumeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-8 w-48 rounded-lg bg-gray-200" />
          <div className="h-4 w-64 rounded-lg bg-gray-100" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-8 flex-1 rounded-lg bg-gray-100" />
              <div className="h-8 w-10 rounded-lg bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
