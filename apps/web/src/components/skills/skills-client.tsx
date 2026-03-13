'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Trash2, Pencil, Check, X, Download } from 'lucide-react'
import { SKILL_CATEGORY_LABELS, SKILL_PROFICIENCY_LABELS } from '@jobflow/shared'
import type { UserSkill } from '@jobflow/shared'

type GroupedCategory = {
  category: string
  label: string
  skills: UserSkill[]
}

const PROFICIENCY_COLORS: Record<string, string> = {
  beginner: 'bg-gray-100 text-gray-600',
  intermediate: 'bg-blue-50 text-blue-700',
  advanced: 'bg-green-50 text-green-700',
  expert: 'bg-purple-50 text-purple-700',
}

export function SkillsClient({ initialGrouped }: { initialGrouped: GroupedCategory[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', category: 'programming', proficiency: 'intermediate' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ proficiency: '' })
  const [loading, setLoading] = useState(false)

  async function handleAdd() {
    if (!newSkill.name.trim()) { toast.error('Nama keahlian wajib diisi'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSkill),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) { toast.error(json.error?.message ?? 'Gagal menambah'); return }
      toast.success('Keahlian ditambahkan!')
      setAdding(false)
      setNewSkill({ name: '', category: 'programming', proficiency: 'intermediate' })
      router.refresh()
    } catch { toast.error('Terjadi kesalahan') } finally { setLoading(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus keahlian ini?')) return
    const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' })
    const json = await res.json() as { success: boolean }
    if (json.success) { toast.success('Dihapus'); router.refresh() }
    else toast.error('Gagal menghapus')
  }

  async function handleImportFromResume() {
    setLoading(true)
    try {
      // Get list of resumes, find default
      const listRes = await fetch('/api/resume')
      const listJson = await listRes.json() as { success: boolean; data?: { id: string; isDefault: boolean }[] }
      const resumes = listJson.data ?? []
      const defaultResume = resumes.find((r) => r.isDefault) ?? resumes[0]
      if (!defaultResume) { toast.error('Tidak ada resume tersimpan'); return }

      // Get full resume content
      const resumeRes = await fetch(`/api/resume/${defaultResume.id}`)
      const resumeJson = await resumeRes.json() as { success: boolean; data?: { content?: { skills?: string[] } } }
      const skills = resumeJson.data?.content?.skills ?? []
      if (skills.length === 0) { toast.error('Tidak ada keahlian ditemukan di resume'); return }

      // Bulk import
      const bulkRes = await fetch('/api/skills/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills }),
      })
      const bulkJson = await bulkRes.json() as { success: boolean; data?: { imported: number } }
      if (!bulkRes.ok || !bulkJson.success) { toast.error('Gagal mengimpor keahlian'); return }
      toast.success(`${bulkJson.data?.imported ?? 0} keahlian berhasil diimpor!`)
      router.refresh()
    } catch { toast.error('Terjadi kesalahan') } finally { setLoading(false) }
  }

  async function handleEdit(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/skills/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proficiency: editData.proficiency }),
      })
      const json = await res.json() as { success: boolean }
      if (json.success) { toast.success('Diperbarui'); setEditId(null); router.refresh() }
      else toast.error('Gagal memperbarui')
    } catch { toast.error('Terjadi kesalahan') } finally { setLoading(false) }
  }

  const selectCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500'

  return (
    <div className="space-y-6">
      {/* Add button */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleImportFromResume}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Import dari Resume
        </button>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tambah Keahlian
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="rounded-xl bg-white p-5 shadow-sm border border-blue-200">
          <h3 className="mb-4 font-medium text-gray-900">Tambah Keahlian Baru</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nama Keahlian *</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500"
                value={newSkill.name}
                onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="TypeScript"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Kategori</label>
              <select
                className={`w-full ${selectCls}`}
                value={newSkill.category}
                onChange={(e) => setNewSkill((p) => ({ ...p, category: e.target.value }))}
              >
                {Object.entries(SKILL_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tingkat Kemahiran</label>
              <select
                className={`w-full ${selectCls}`}
                value={newSkill.proficiency}
                onChange={(e) => setNewSkill((p) => ({ ...p, proficiency: e.target.value }))}
              >
                {Object.entries(SKILL_PROFICIENCY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Simpan
            </button>
            <button
              onClick={() => { setAdding(false); setNewSkill({ name: '', category: 'programming', proficiency: 'intermediate' }) }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Grouped skills */}
      {initialGrouped.map(({ category, label, skills }) => (
        <div key={category} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h2 className="mb-4 font-semibold text-gray-800">
            {label}
            <span className="ml-2 text-sm font-normal text-gray-400">({skills.length})</span>
          </h2>

          {skills.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada keahlian di kategori ini</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className={`flex items-center gap-1.5 rounded-full border pl-3 pr-1 py-1.5 ${
                    editId === skill.id
                      ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {editId === skill.id ? (
                    <>
                      <span className="text-sm font-medium text-gray-700">{skill.name}</span>
                      <select
                        className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs"
                        value={editData.proficiency || skill.proficiency}
                        onChange={(e) => setEditData({ proficiency: e.target.value })}
                      >
                        {Object.entries(SKILL_PROFICIENCY_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <button onClick={() => handleEdit(skill.id)} disabled={loading} className="rounded-full p-0.5 text-green-500 hover:bg-green-100">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditId(null)} className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-700">{skill.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROFICIENCY_COLORS[skill.proficiency] ?? ''}`}>
                        {SKILL_PROFICIENCY_LABELS[skill.proficiency] ?? skill.proficiency}
                      </span>
                      <button
                        onClick={() => { setEditId(skill.id); setEditData({ proficiency: skill.proficiency }) }}
                        className="rounded-full p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-500"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(skill.id)}
                        className="rounded-full p-1 text-gray-300 hover:bg-red-100 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
