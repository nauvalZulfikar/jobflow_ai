'use client'

import { Plus, Trash2, GripVertical } from 'lucide-react'
import type { WorkExperience } from '@jobflow/shared'

interface StepExperienceProps {
  items: WorkExperience[]
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<WorkExperience>) => void
  onRemove: (id: string) => void
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition'

export function StepExperience({ items, onAdd, onUpdate, onRemove }: StepExperienceProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pengalaman Kerja</h2>
          <p className="mt-0.5 text-sm text-gray-500">Urutkan dari yang terbaru</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tambah
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">
            Belum ada pengalaman kerja.{' '}
            <button
              type="button"
              onClick={onAdd}
              className="text-blue-600 underline underline-offset-2"
            >
              Tambah sekarang
            </button>
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((exp, idx) => (
          <ExperienceCard
            key={exp.id}
            exp={exp}
            index={idx}
            onUpdate={(updates) => onUpdate(exp.id, updates)}
            onRemove={() => onRemove(exp.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ExperienceCard({
  exp,
  index,
  onUpdate,
  onRemove,
}: {
  exp: WorkExperience
  index: number
  onUpdate: (updates: Partial<WorkExperience>) => void
  onRemove: () => void
}) {
  function updateBullet(i: number, value: string) {
    const bullets = [...exp.bullets]
    bullets[i] = value
    onUpdate({ bullets })
  }

  function addBullet() {
    onUpdate({ bullets: [...exp.bullets, ''] })
  }

  function removeBullet(i: number) {
    onUpdate({ bullets: exp.bullets.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
          <GripVertical className="h-4 w-4 text-gray-300" />
          Pengalaman {index + 1}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Jabatan <span className="text-red-500">*</span>
          </label>
          <input
            className={inputCls}
            value={exp.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Senior Software Engineer"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Perusahaan <span className="text-red-500">*</span>
          </label>
          <input
            className={inputCls}
            value={exp.company}
            onChange={(e) => onUpdate({ company: e.target.value })}
            placeholder="PT. Contoh Indonesia"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Lokasi</label>
          <input
            className={inputCls}
            value={exp.location ?? ''}
            onChange={(e) => onUpdate({ location: e.target.value })}
            placeholder="Jakarta, Indonesia"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Mulai <span className="text-red-500">*</span>
            </label>
            <input
              className={inputCls}
              value={exp.startDate}
              onChange={(e) => onUpdate({ startDate: e.target.value })}
              placeholder="01/2022"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Selesai</label>
            <input
              className={inputCls}
              value={exp.endDate ?? ''}
              onChange={(e) => onUpdate({ endDate: e.target.value })}
              placeholder="12/2024"
              disabled={exp.isCurrent}
            />
          </div>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={exp.isCurrent}
          onChange={(e) => onUpdate({ isCurrent: e.target.checked, endDate: '' })}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Masih bekerja di sini
      </label>

      {/* Bullets */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600">
            Deskripsi Tanggung Jawab / Pencapaian
          </label>
          <button
            type="button"
            onClick={addBullet}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </button>
        </div>
        <div className="space-y-2">
          {exp.bullets.map((bullet, i) => (
            <div key={i} className="flex gap-2">
              <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-gray-400" />
              <input
                className={`${inputCls} flex-1`}
                value={bullet}
                onChange={(e) => updateBullet(i, e.target.value)}
                placeholder="Memimpin tim 5 engineer untuk mengembangkan fitur X yang meningkatkan retention 20%"
              />
              {exp.bullets.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBullet(i)}
                  className="mt-1 rounded p-1.5 text-gray-300 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {exp.bullets.length === 0 && (
            <button
              type="button"
              onClick={addBullet}
              className="w-full rounded-lg border border-dashed border-gray-200 py-2 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500"
            >
              + Tambah deskripsi
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
