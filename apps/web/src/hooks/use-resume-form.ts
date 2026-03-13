'use client'

import { useState, useCallback } from 'react'
import type { ResumeContent, WorkExperience, Education, Project, Certification } from '@jobflow/shared'

export type ResumeStep = 'personal' | 'experience' | 'education' | 'skills' | 'projects'

export const RESUME_STEPS: { id: ResumeStep; label: string }[] = [
  { id: 'personal', label: 'Data Pribadi' },
  { id: 'experience', label: 'Pengalaman Kerja' },
  { id: 'education', label: 'Pendidikan' },
  { id: 'skills', label: 'Keahlian' },
  { id: 'projects', label: 'Proyek & Sertifikasi' },
]

const emptyResume: ResumeContent = {
  personalInfo: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    summary: '',
  },
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
}

export function useResumeForm(initial?: Partial<ResumeContent>) {
  const [content, setContent] = useState<ResumeContent>({
    ...emptyResume,
    ...initial,
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [title, setTitle] = useState('Resume Baru')
  const [isDefault, setIsDefault] = useState(false)

  const currentStepId = RESUME_STEPS[currentStep]?.id ?? 'personal'
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === RESUME_STEPS.length - 1

  const updatePersonalInfo = useCallback(
    (updates: Partial<ResumeContent['personalInfo']>) => {
      setContent((prev) => ({
        ...prev,
        personalInfo: { ...prev.personalInfo, ...updates },
      }))
    },
    []
  )

  const addExperience = useCallback(() => {
    const id = `exp-${Date.now()}`
    setContent((prev) => ({
      ...prev,
      experience: [
        ...prev.experience,
        {
          id,
          company: '',
          title: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrent: false,
          bullets: [''],
        } satisfies WorkExperience,
      ],
    }))
    return id
  }, [])

  const updateExperience = useCallback((id: string, updates: Partial<WorkExperience>) => {
    setContent((prev) => ({
      ...prev,
      experience: prev.experience.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }, [])

  const removeExperience = useCallback((id: string) => {
    setContent((prev) => ({
      ...prev,
      experience: prev.experience.filter((e) => e.id !== id),
    }))
  }, [])

  const addEducation = useCallback(() => {
    const id = `edu-${Date.now()}`
    setContent((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          id,
          institution: '',
          degree: '',
          field: '',
          startDate: '',
          endDate: '',
          gpa: '',
        } satisfies Education,
      ],
    }))
    return id
  }, [])

  const updateEducation = useCallback((id: string, updates: Partial<Education>) => {
    setContent((prev) => ({
      ...prev,
      education: prev.education.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }, [])

  const removeEducation = useCallback((id: string) => {
    setContent((prev) => ({
      ...prev,
      education: prev.education.filter((e) => e.id !== id),
    }))
  }, [])

  const updateSkills = useCallback((skills: string[]) => {
    setContent((prev) => ({ ...prev, skills }))
  }, [])

  const addProject = useCallback(() => {
    const id = `proj-${Date.now()}`
    setContent((prev) => ({
      ...prev,
      projects: [
        ...prev.projects,
        {
          id,
          name: '',
          description: '',
          url: '',
          technologies: [],
          bullets: [],
        } satisfies Project,
      ],
    }))
    return id
  }, [])

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setContent((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }))
  }, [])

  const removeProject = useCallback((id: string) => {
    setContent((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }))
  }, [])

  const addCertification = useCallback(() => {
    const id = `cert-${Date.now()}`
    setContent((prev) => ({
      ...prev,
      certifications: [
        ...prev.certifications,
        {
          id,
          name: '',
          issuer: '',
          issueDate: '',
          expiryDate: '',
          credentialUrl: '',
        } satisfies Certification,
      ],
    }))
    return id
  }, [])

  const updateCertification = useCallback((id: string, updates: Partial<Certification>) => {
    setContent((prev) => ({
      ...prev,
      certifications: prev.certifications.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }))
  }, [])

  const removeCertification = useCallback((id: string) => {
    setContent((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((c) => c.id !== id),
    }))
  }, [])

  const goNext = useCallback(() => {
    if (!isLastStep) setCurrentStep((s) => s + 1)
  }, [isLastStep])

  const goPrev = useCallback(() => {
    if (!isFirstStep) setCurrentStep((s) => s - 1)
  }, [isFirstStep])

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < RESUME_STEPS.length) setCurrentStep(step)
  }, [])

  const setFullContent = useCallback((newContent: ResumeContent) => {
    setContent(newContent)
  }, [])

  return {
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
    setFullContent,
  }
}
