'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2, Star } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  resumeId: string
  isDefault: boolean
}

export function ResumeCardMenu({ resumeId, isDefault }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleDelete() {
    if (!confirm('Hapus resume ini? Tindakan tidak bisa dibatalkan.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/resume/${resumeId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Gagal menghapus')
      toast.success('Resume dihapus')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  async function handleSetDefault() {
    setLoading(true)
    try {
      const res = await fetch(`/api/resume/${resumeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Gagal mengubah')
      toast.success('Resume diset sebagai default')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah')
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
          <a
            href={`/resume/${resumeId}`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
            Edit Resume
          </a>
          {!isDefault && (
            <button
              onClick={handleSetDefault}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Star className="h-3.5 w-3.5 text-gray-400" />
              Set sebagai Default
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus
          </button>
        </div>
      )}
    </div>
  )
}
