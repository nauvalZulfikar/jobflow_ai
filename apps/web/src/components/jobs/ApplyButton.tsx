'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export function ApplyButton({ jobId }: { jobId: string }) {
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, status: 'saved' }),
      })
      if (res.status === 409) {
        setSaved(true)
        toast('Sudah tersimpan sebelumnya', { icon: '📌' })
        return
      }
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Gagal menyimpan')
      }
      setSaved(true)
      toast.success('Lowongan disimpan!')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSave}
      disabled={saved || loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
    >
      {saved ? <Check className="h-4 w-4 text-green-500" /> : <Bookmark className="h-4 w-4" />}
      {saved ? 'Tersimpan' : 'Simpan Lowongan'}
    </button>
  )
}
