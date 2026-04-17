'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

interface StatusData {
  status: string
  count: number
}

interface TimelineData {
  month: string
  applications: number
  interviews: number
}

interface SourceData {
  source: string
  count: number
}

interface Props {
  statusData: StatusData[]
  timelineData: TimelineData[]
  sourceData: SourceData[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

export function AnalyticsCharts({ statusData, timelineData, sourceData }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Timeline chart */}
      <div className="col-span-full rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Aktivitas per Bulan</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="applications" stroke="#3b82f6" name="Lamaran" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="interviews" stroke="#10b981" name="Interview" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Status bar chart */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Status Lamaran</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statusData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
            <YAxis type="category" dataKey="status" tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Jumlah" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Source pie chart */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Sumber Lowongan</h3>
        {sourceData.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">Belum ada data</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sourceData} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {sourceData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
