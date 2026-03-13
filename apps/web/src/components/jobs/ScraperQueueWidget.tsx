'use client'

import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'

interface QueueStatus {
  waiting: number
  active: number
  completed: number
  failed: number
}

export function ScraperQueueWidget() {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [error, setError] = useState(false)

  async function fetchStatus() {
    try {
      const res = await fetch('/api/jobs/sync')
      if (res.ok) { setStatus(await res.json()); setError(false) }
      else setError(true)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 10_000)
    return () => clearInterval(id)
  }, [])

  if (error) return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <p className="text-sm text-gray-400 text-center">Status antrian tidak tersedia</p>
    </div>
  )
  if (!status) return null

  const isActive = status.active > 0 || status.waiting > 0

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <div className="mb-4 flex items-center gap-2">
        <Activity className={`h-5 w-5 ${isActive ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} />
        <h2 className="text-lg font-semibold text-gray-900">Antrian Scraper</h2>
        {isActive && (
          <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            Berjalan
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Menunggu', value: status.waiting, color: 'text-yellow-600' },
          { label: 'Aktif', value: status.active, color: 'text-blue-600' },
          { label: 'Selesai', value: status.completed, color: 'text-green-600' },
          { label: 'Gagal', value: status.failed, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-gray-50 p-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
