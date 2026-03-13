'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Project, Certification } from '@jobflow/shared'

interface StepProjectsProps {
  projects: Project[]
  certifications: Certification[]
  onAddProject: () => void
  onUpdateProject: (id: string, u: Partial<Project>) => void
  onRemoveProject: (id: string) => void
  onAddCert: () => void
  onUpdateCert: (id: string, u: Partial<Certification>) => void
  onRemoveCert: (id: string) => void
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition'

export function StepProjects({
  projects,
  certifications,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onAddCert,
  onUpdateCert,
  onRemoveCert,
}: StepProjectsProps) {
  return (
    <div className="space-y-8">
      {/* Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Proyek</h2>
            <p className="mt-0.5 text-sm text-gray-500">Proyek yang relevan dengan posisi yang dilamar</p>
          </div>
          <button
            type="button"
            onClick={onAddProject}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">Opsional — tambah proyek jika relevan</p>
          </div>
        ) : (
          projects.map((proj, idx) => (
            <ProjectCard
              key={proj.id}
              proj={proj}
              index={idx}
              onUpdate={(u) => onUpdateProject(proj.id, u)}
              onRemove={() => onRemoveProject(proj.id)}
            />
          ))
        )}
      </div>

      {/* Certifications */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Sertifikasi</h2>
            <p className="mt-0.5 text-sm text-gray-500">AWS, Google Cloud, dll.</p>
          </div>
          <button
            type="button"
            onClick={onAddCert}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>

        {certifications.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">Opsional — tambah sertifikasi jika ada</p>
          </div>
        ) : (
          certifications.map((cert, idx) => (
            <CertCard
              key={cert.id}
              cert={cert}
              index={idx}
              onUpdate={(u) => onUpdateCert(cert.id, u)}
              onRemove={() => onRemoveCert(cert.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ProjectCard({
  proj,
  index,
  onUpdate,
  onRemove,
}: {
  proj: Project
  index: number
  onUpdate: (u: Partial<Project>) => void
  onRemove: () => void
}) {
  const [techInput, setTechInput] = useState('')

  function addTech() {
    const t = techInput.trim()
    if (t && !proj.technologies.includes(t)) {
      onUpdate({ technologies: [...proj.technologies, t] })
      setTechInput('')
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">Proyek {index + 1}</span>
        <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nama Proyek *</label>
          <input className={inputCls} value={proj.name} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="JobFlow AI" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">URL / Link</label>
          <input type="url" className={inputCls} value={proj.url ?? ''} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://github.com/..." />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Deskripsi *</label>
          <textarea className={`${inputCls} min-h-[70px] resize-y`} value={proj.description} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Platform otomasi lamaran kerja berbasis AI..." rows={2} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Teknologi</label>
          <div className="flex gap-2">
            <input
              className={`${inputCls} flex-1`}
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTech() } }}
              placeholder="React, TypeScript..."
            />
            <button type="button" onClick={addTech} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Tambah</button>
          </div>
          {proj.technologies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {proj.technologies.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                  {t}
                  <button type="button" onClick={() => onUpdate({ technologies: proj.technologies.filter((x) => x !== t) })}>
                    <Plus className="h-3 w-3 rotate-45" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CertCard({
  cert,
  index,
  onUpdate,
  onRemove,
}: {
  cert: Certification
  index: number
  onUpdate: (u: Partial<Certification>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">Sertifikasi {index + 1}</span>
        <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nama Sertifikasi *</label>
          <input className={inputCls} value={cert.name} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="AWS Certified Developer" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Penerbit *</label>
          <input className={inputCls} value={cert.issuer} onChange={(e) => onUpdate({ issuer: e.target.value })} placeholder="Amazon Web Services" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tanggal Terbit *</label>
          <input className={inputCls} value={cert.issueDate} onChange={(e) => onUpdate({ issueDate: e.target.value })} placeholder="06/2023" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kadaluarsa</label>
          <input className={inputCls} value={cert.expiryDate ?? ''} onChange={(e) => onUpdate({ expiryDate: e.target.value })} placeholder="06/2026" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">URL Credential</label>
          <input type="url" className={inputCls} value={cert.credentialUrl ?? ''} onChange={(e) => onUpdate({ credentialUrl: e.target.value })} placeholder="https://credly.com/..." />
        </div>
      </div>
    </div>
  )
}
