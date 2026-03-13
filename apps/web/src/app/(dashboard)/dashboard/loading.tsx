import { StatsSkeleton } from '@/components/dashboard/stats-skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-4 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <StatsSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-white shadow-sm border border-gray-100" />
        ))}
      </div>
    </div>
  )
}
