'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, Loader2, Clock } from 'lucide-react'
import { APPLICATION_STATUS_LABELS } from '@jobflow/shared'
import toast from 'react-hot-toast'
import type { ApplicationCard } from './KanbanCard'

const STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']
const STATUS_RANK: Record<string, number> = {
  saved: 0, applied: 1, screening: 2, interview: 3, offer: 4, rejected: -1, withdrawn: -1,
}

interface Log {
  id: string
  action: string
  detail: string | null
  createdAt: string
}

interface Props {
  app: ApplicationCard
  onClose: () => void
  onStatusChange: (appId: string, newStatus: string) => void
}

export function ApplicationDetailModal({ app, onClose, onStatusChange }: Props) {
  const [status, setStatus] = useState(app.status)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/applications/${app.id}/logs`)
      .then((r) => r.json())
      .then((d) => setLogs(d.data ?? []))
      .catch(() => {})
      .finally(() => setLogsLoading(false))
  }, [app.id])

  async function handleStatusChange(newStatus: string) {
    const isDowngrade =
      STATUS_RANK[newStatus] !== undefined &&
      STATUS_RANK[status] !== undefined &&
      STATUS_RANK[newStatus] < STATUS_RANK[status] &&
      STATUS_RANK[newStatus] >= 0
    if (isDowngrade && !confirm(`Turunkan status dari "${APPLICATION_STATUS_LABELS[status]}" ke "${APPLICATION_STATUS_LABELS[newStatus]}"?`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Gagal update status')
      setStatus(newStatus)
      onStatusChange(app.id, newStatus)
      toast.success('Status diperbarui')
    } catch {
      toast.error('Gagal update status')
    } finally {
      setSaving(false)
    }
  }

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const data = await res.json()
      setNote('')
      if (data.data) setLogs((prev) => [data.data, ...prev])
      toast.success('Catatan ditambahkan')
    } catch {
      toast.error('Gagal menambah catatan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 className="font-semibold text-gray-900">{app.job.title}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{app.job.company}</p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Status selector */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Status Lamaran</label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={saving}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    status === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {APPLICATION_STATUS_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>

          {/* Match score */}
          {app.matchScore !== null && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <div className="text-2xl font-bold text-gray-900">{app.matchScore}%</div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Skor Kecocokan</p>
                <div className="mt-1 h-2 rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      app.matchScore >= 70 ? 'bg-green-500' : app.matchScore >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${app.matchScore}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Add note */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tambah Catatan</label>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
                placeholder="Catat aktivitas..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                onClick={addNote}
                disabled={saving || !note.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </div>

          {/* Log history */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Riwayat Aktivitas</p>
            {logsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="text-xs text-gray-400">Belum ada aktivitas tercatat</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700">{log.detail ?? log.action}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <a
            href={`/jobs/${app.job.id}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" />
            Lihat Detail Lowongan
          </a>
        </div>
      </div>
    </div>
  )
}
