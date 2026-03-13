'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
      <h2 className="text-lg font-semibold text-gray-900">Terjadi Kesalahan</h2>
      <p className="mt-1 text-sm text-gray-500">
        {error.message || 'Sesuatu tidak berjalan dengan baik.'}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Coba Lagi
      </button>
    </div>
  )
}
