'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

import { useResumeForm, RESUME_STEPS } from '@/hooks/use-resume-form'
import { StepIndicator } from './step-indicator'
import { StepPersonal } from './step-personal'
import { StepExperience } from './step-experience'
import { StepEducation } from './step-education'
import { StepSkills } from './step-skills'
import { StepProjects } from './step-projects'
import type { ResumeContent } from '@jobflow/shared'

interface ResumeBuilderClientProps {
  initialContent?: ResumeContent
  initialTitle?: string
  resumeId?: string // if editing
}

export function ResumeBuilderClient({
  initialContent,
  initialTitle,
  resumeId,
}: ResumeBuilderClientProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const {
    content,
    title,
    setTitle,
    isDefault,
    setIsDefault,
    currentStep,
    currentStepId,
    isFirstStep,
    isLastStep,
    goNext,
    goPrev,
    goToStep,
    updatePersonalInfo,
    addExperience,
    updateExperience,
    removeExperience,
    addEducation,
    updateEducation,
    removeEducation,
    updateSkills,
    addProject,
    updateProject,
    removeProject,
    addCertification,
    updateCertification,
    removeCertification,
  } = useResumeForm(initialContent ? { ...initialContent } : undefined)

  // Override title from prop
  const autoSaveKey = `resume-draft-${resumeId ?? 'new'}`
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formTitle, setFormTitle] = useState(() => {
    if (!resumeId && typeof window !== 'undefined') {
      try {
        const draft = localStorage.getItem(`resume-draft-new`)
        if (draft) {
          const parsed = JSON.parse(draft)
          if (parsed.title) return parsed.title
        }
      } catch {}
    }
    return initialTitle ?? 'Resume Baru'
  })

  // Auto-save on change (debounced 3s)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(autoSaveKey, JSON.stringify({ title: formTitle, content }))
      } catch {}
    }, 3000)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [content, formTitle])

  function validateBeforeSave(): boolean {
    if (!formTitle.trim()) {
      toast.error('Judul resume wajib diisi')
      return false
    }
    if (formTitle.trim().length > 100) {
      toast.error('Judul resume maksimal 100 karakter')
      return false
    }
    const p = content.personalInfo
    if (!p.firstName.trim()) { toast.error('Nama depan wajib diisi (langkah Data Pribadi)'); return false }
    if (!p.lastName.trim()) { toast.error('Nama belakang wajib diisi (langkah Data Pribadi)'); return false }
    if (!p.email.trim()) { toast.error('Email wajib diisi (langkah Data Pribadi)'); return false }
    if (!p.phone.trim()) { toast.error('Nomor telepon wajib diisi (langkah Data Pribadi)'); return false }
    if (!p.location.trim()) { toast.error('Lokasi wajib diisi (langkah Data Pribadi)'); return false }
    return true
  }

  async function handleSave() {
    if (!validateBeforeSave()) return
    setSaving(true)
    try {
      const url = resumeId ? `/api/resume/${resumeId}` : '/api/resume'
      const method = resumeId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, isDefault, content }),
      })

      const json = await res.json() as { success: boolean; error?: { message: string } }

      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Gagal menyimpan resume')
        return
      }

      toast.success(resumeId ? 'Resume berhasil diperbarui!' : 'Resume berhasil dibuat!')
      try { localStorage.removeItem(autoSaveKey) } catch {}
      router.push('/resume')
      router.refresh()
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full rounded-lg border-0 bg-transparent text-2xl font-bold text-gray-900 outline-none focus:bg-white focus:border focus:border-gray-300 focus:px-3 focus:py-1 transition-all"
            placeholder="Nama Resume (contoh: Resume Backend Engineer)"
          />
          <p className="mt-0.5 text-sm text-gray-500">
            Langkah {currentStep + 1} dari {RESUME_STEPS.length} —{' '}
            {RESUME_STEPS[currentStep]?.label}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Set sebagai default
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="rounded-xl bg-white px-6 pt-6 pb-10 shadow-sm border border-gray-100">
        <StepIndicator currentStep={currentStep} onStepClick={goToStep} />
      </div>

      {/* Step content */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        {currentStepId === 'personal' && (
          <StepPersonal data={content.personalInfo} onChange={updatePersonalInfo} />
        )}
        {currentStepId === 'experience' && (
          <StepExperience
            items={content.experience}
            onAdd={addExperience}
            onUpdate={updateExperience}
            onRemove={removeExperience}
          />
        )}
        {currentStepId === 'education' && (
          <StepEducation
            items={content.education}
            onAdd={addEducation}
            onUpdate={updateEducation}
            onRemove={removeEducation}
          />
        )}
        {currentStepId === 'skills' && (
          <StepSkills skills={content.skills} onChange={updateSkills} />
        )}
        {currentStepId === 'projects' && (
          <StepProjects
            projects={content.projects}
            certifications={content.certifications}
            onAddProject={addProject}
            onUpdateProject={updateProject}
            onRemoveProject={removeProject}
            onAddCert={addCertification}
            onUpdateCert={updateCertification}
            onRemoveCert={removeCertification}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={goPrev}
          disabled={isFirstStep}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Sebelumnya
        </button>

        {isLastStep ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Resume
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Berikutnya
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
