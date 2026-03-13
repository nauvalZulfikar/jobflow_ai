export default function CoverLettersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-8 w-40 rounded-lg bg-gray-200" />
          <div className="h-4 w-56 rounded-lg bg-gray-100" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 space-y-3">
            <div className="h-5 w-36 rounded bg-gray-200" />
            <div className="space-y-1.5">
              <div className="h-3 w-full rounded bg-gray-100" />
              <div className="h-3 w-4/5 rounded bg-gray-100" />
              <div className="h-3 w-3/5 rounded bg-gray-100" />
            </div>
            <div className="flex gap-2 pt-2">
              <div className="h-8 flex-1 rounded-lg bg-gray-100" />
              <div className="h-8 w-10 rounded-lg bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
