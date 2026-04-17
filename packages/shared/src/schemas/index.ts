import { z } from 'zod'

// ========== Auth Schemas ==========

export const LoginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

// ========== Resume Schemas ==========

export const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, 'Nama depan wajib diisi'),
  lastName: z.string().min(1, 'Nama belakang wajib diisi'),
  email: z.string().email('Email tidak valid'),
  phone: z.string().min(8, 'Nomor telepon tidak valid'),
  location: z.string().min(1, 'Lokasi wajib diisi'),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  summary: z.string().optional(),
})

export const WorkExperienceSchema = z.object({
  id: z.string().optional(),
  company: z.string().min(1, 'Nama perusahaan wajib diisi'),
  title: z.string().min(1, 'Jabatan wajib diisi'),
  location: z.string().optional(),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'),
  endDate: z.string().optional(),
  isCurrent: z.boolean().default(false),
  bullets: z.array(z.string()).min(1, 'Minimal 1 deskripsi'),
})

export const EducationSchema = z.object({
  id: z.string().optional(),
  institution: z.string().min(1, 'Nama institusi wajib diisi'),
  degree: z.string().min(1, 'Gelar wajib diisi'),
  field: z.string().min(1, 'Bidang studi wajib diisi'),
  startDate: z.string().min(1, 'Tahun mulai wajib diisi'),
  endDate: z.string().optional(),
  gpa: z.string().optional(),
})

export const ProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nama proyek wajib diisi'),
  description: z.string().min(1, 'Deskripsi wajib diisi'),
  url: z.string().url().optional().or(z.literal('')),
  technologies: z.array(z.string()),
  bullets: z.array(z.string()),
})

export const CertificationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nama sertifikasi wajib diisi'),
  issuer: z.string().min(1, 'Penerbit wajib diisi'),
  issueDate: z.string().min(1, 'Tanggal terbit wajib diisi'),
  expiryDate: z.string().optional(),
  credentialUrl: z.string().url().optional().or(z.literal('')),
})

export const CreateResumeSchema = z.object({
  title: z.string().min(1, 'Judul resume wajib diisi'),
  isDefault: z.boolean().default(false),
  content: z.object({
    personalInfo: PersonalInfoSchema,
    experience: z.array(WorkExperienceSchema),
    education: z.array(EducationSchema),
    skills: z.array(z.string()),
    projects: z.array(ProjectSchema),
    certifications: z.array(CertificationSchema),
  }),
})

// ========== Job Schemas ==========

export const JobFilterSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  isRemote: z.boolean().optional(),
  source: z
    .enum(['linkedin', 'indeed', 'glassdoor', 'jobstreet', 'kalibrr', 'techinasia', 'manual'])
    .optional(),
  industry: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(20),
})

// ========== Application Schemas ==========

export const CreateApplicationSchema = z.object({
  jobId: z.string().cuid(),
  resumeId: z.string().cuid().optional(),
  coverLetterId: z.string().cuid().optional(),
})

export const UpdateApplicationStatusSchema = z.object({
  status: z.enum(['saved', 'auto_applying', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']),
  notes: z.string().optional(),
})

// ========== Skill Schemas ==========

export const CreateSkillSchema = z.object({
  name: z.string().min(1, 'Nama keahlian wajib diisi'),
  category: z.enum(['programming', 'framework', 'tool', 'soft']),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
})

// ========== Cover Letter Schemas ==========

export const CreateCoverLetterSchema = z.object({
  title: z.string().min(1, 'Judul template wajib diisi'),
  body: z.string().min(10, 'Isi surat minimal 10 karakter'),
  isDefault: z.boolean().default(false),
})

// ========== Scraper Schemas ==========

export const ScrapeRequestSchema = z.object({
  sources: z
    .array(z.enum(['jobstreet', 'linkedin', 'indeed']))
    .min(1)
    .default(['jobstreet', 'linkedin', 'indeed']),
  keywords: z.array(z.string().min(1)).min(1).max(10),
  location: z.string().default('Jakarta'),
  pages: z.number().min(1).max(10).default(3),
})
