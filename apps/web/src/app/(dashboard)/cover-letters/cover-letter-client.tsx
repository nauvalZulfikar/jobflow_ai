'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Trash2, Pencil, Star, Eye, X, Check, Loader2 } from 'lucide-react'
import { replaceTemplateVariables } from '@jobflow/shared'

type CoverLetterTemplate = {
  id: string
  title: string
  body: string
  isDefault: boolean
}

const PREVIEW_VARS = {
  nama_perusahaan: 'PT. Contoh Indonesia',
  posisi: 'Software Engineer',
  nama_pengguna: 'Budi Santoso',
  tanggal: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
}

const DEFAULT_BODY = `Kepada Yth.
Tim Rekrutmen {{nama_perusahaan}},

Dengan hormat,

Saya {{nama_pengguna}}, ingin mengajukan lamaran untuk posisi {{posisi}} di {{nama_perusahaan}}.

[Paragraf 2: Ceritakan pengalaman & keahlian yang relevan]

[Paragraf 3: Tunjukkan antusias dan value yang bisa kamu bawa]

Saya sangat berharap dapat berkontribusi dan bergabung dengan tim {{nama_perusahaan}}. Terima kasih atas waktu dan perhatiannya.

Hormat saya,
{{nama_pengguna}}
{{tanggal}}`

export function CoverLetterClient({
  initialTemplates,
}: {
  initialTemplates: CoverLetterTemplate[]
}) {
  const router = useRouter()
  const [templates, setTemplates] = useState(initialTemplates)
  const [editId, setEditId] = useState<string | 'new' | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', body: DEFAULT_BODY, isDefault: false })
  const [saving, setSaving] = useState(false)

  function openNew() {
    setForm({ title: '', body: DEFAULT_BODY, isDefault: false })
    setEditId('new')
    setPreviewId(null)
  }

  function openEdit(t: CoverLetterTemplate) {
    setForm({ title: t.title, body: t.body, isDefault: t.isDefault })
    setEditId(t.id)
    setPreviewId(null)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Judul wajib diisi'); return }
    if (!form.body.trim()) { toast.error('Isi surat wajib diisi'); return }
    setSaving(true)
    try {
      const isNew = editId === 'new'
      const url = isNew ? '/api/cover-letters' : `/api/cover-letters/${editId}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json() as { success: boolean; data?: CoverLetterTemplate; error?: { message: string } }
      if (!res.ok || !json.success) { toast.error(json.error?.message ?? 'Gagal menyimpan'); return }

      toast.success(isNew ? 'Template dibuat!' : 'Template diperbarui!')
      setEditId(null)
      router.refresh()

      // optimistic update
      if (isNew && json.data) {
        setTemplates((prev) => [json.data!, ...prev])
      } else {
        setTemplates((prev) => prev.map((t) => (t.id === editId ? { ...t, ...form } : t)))
      }
    } catch { toast.error('Terjadi kesalahan') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus template ini?')) return
    const res = await fetch(`/api/cover-letters/${id}`, { method: 'DELETE' })
    const json = await res.json() as { success: boolean }
    if (json.success) {
      toast.success('Template dihapus')
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } else {
      toast.error('Gagal menghapus')
    }
  }

  async function handleSetDefault(id: string) {
    const res = await fetch(`/api/cover-letters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    })
    const json = await res.json() as { success: boolean }
    if (json.success) {
      toast.success('Set sebagai default')
      setTemplates((prev) => prev.map((t) => ({ ...t, isDefault: t.id === id })))
    }
  }

  const previewTemplate = previewId ? templates.find((t) => t.id === previewId) : null

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Template Baru
        </button>
      </div>

      {/* Edit / New form */}
      {editId && (
        <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              {editId === 'new' ? 'Template Baru' : 'Edit Template'}
            </h3>
            <button onClick={() => setEditId(null)} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Judul Template *</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Template Umum, Template Senior Dev, dll."
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Isi Surat *</label>
                <span className="text-xs text-gray-400">
                  Gunakan: {`{{nama_perusahaan}}`}, {`{{posisi}}`}, {`{{nama_pengguna}}`}, {`{{tanggal}}`}
                </span>
              </div>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 font-mono"
                rows={14}
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Set sebagai template default
            </label>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Simpan
              </button>
              <button
                onClick={() => setEditId(null)}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 && !editId && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-400">Belum ada template. Buat yang pertama!</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {templates.map((tmpl) => (
          <div key={tmpl.id} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:border-gray-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{tmpl.title}</h3>
                  {tmpl.isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-600">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-400">
                  {tmpl.body.split('\n').filter(Boolean)[0]}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setPreviewId(previewId === tmpl.id ? null : tmpl.id)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={() => openEdit(tmpl)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              {!tmpl.isDefault && (
                <button
                  onClick={() => handleSetDefault(tmpl.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-yellow-50 hover:text-yellow-600"
                >
                  <Star className="h-3.5 w-3.5" />
                  Set Default
                </button>
              )}
              <button
                onClick={() => handleDelete(tmpl.id)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus
              </button>
            </div>

            {/* Preview panel */}
            {previewId === tmpl.id && (
              <div className="mt-4 rounded-lg bg-gray-50 p-4">
                <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview dengan data contoh</p>
                <pre className="whitespace-pre-wrap text-xs text-gray-700 font-sans leading-relaxed">
                  {replaceTemplateVariables(tmpl.body, PREVIEW_VARS)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
