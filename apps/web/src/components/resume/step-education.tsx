'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { Education } from '@jobflow/shared'

interface StepEducationProps {
  items: Education[]
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<Education>) => void
  onRemove: (id: string) => void
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition'

export function StepEducation({ items, onAdd, onUpdate, onRemove }: StepEducationProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pendidikan</h2>
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
            Belum ada pendidikan.{' '}
            <button type="button" onClick={onAdd} className="text-blue-600 underline underline-offset-2">
              Tambah sekarang
            </button>
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((edu, idx) => (
          <div key={edu.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Pendidikan {idx + 1}</span>
              <button
                type="button"
                onClick={() => onRemove(edu.id)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Nama Institusi <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={edu.institution}
                  onChange={(e) => onUpdate(edu.id, { institution: e.target.value })}
                  placeholder="Universitas Indonesia"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Gelar <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={edu.degree}
                  onChange={(e) => onUpdate(edu.id, { degree: e.target.value })}
                  placeholder="S1 / Bachelor"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Bidang Studi <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={edu.field}
                  onChange={(e) => onUpdate(edu.id, { field: e.target.value })}
                  placeholder="Teknik Informatika"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Tahun Mulai <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={edu.startDate}
                  onChange={(e) => onUpdate(edu.id, { startDate: e.target.value })}
                  placeholder="2018"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tahun Selesai</label>
                <input
                  className={inputCls}
                  value={edu.endDate ?? ''}
                  onChange={(e) => onUpdate(edu.id, { endDate: e.target.value })}
                  placeholder="2022"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">IPK</label>
                <input
                  className={inputCls}
                  value={edu.gpa ?? ''}
                  onChange={(e) => onUpdate(edu.id, { gpa: e.target.value })}
                  placeholder="3.75"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
