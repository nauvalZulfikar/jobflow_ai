export default function SkillsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1">
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="h-4 w-64 rounded-lg bg-gray-100" />
      </div>
      <div className="flex justify-end gap-2">
        <div className="h-10 w-36 rounded-lg bg-gray-200" />
        <div className="h-10 w-36 rounded-lg bg-gray-200" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="h-5 w-32 rounded bg-gray-200" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 + i }).map((_, j) => (
              <div key={j} className="h-8 w-24 rounded-full bg-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
