export default function InterviewLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1">
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="h-4 w-64 rounded-lg bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-gray-200" />
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-10 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
