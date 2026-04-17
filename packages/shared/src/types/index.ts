// ========== API Response Types ==========

export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiError = {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ========== User Types ==========

export type UserRole = 'user' | 'admin'

export type User = {
  id: string
  email: string
  name: string | null
  image: string | null
  role: UserRole
  createdAt: Date
}

// ========== Resume Types ==========

export type PersonalInfo = {
  firstName: string
  lastName: string
  email: string
  phone: string
  location: string
  linkedinUrl?: string
  githubUrl?: string
  portfolioUrl?: string
  summary?: string
}

export type WorkExperience = {
  id: string
  company: string
  title: string
  location?: string
  startDate: string
  endDate?: string
  isCurrent: boolean
  bullets: string[]
}

export type Education = {
  id: string
  institution: string
  degree: string
  field: string
  startDate: string
  endDate?: string
  gpa?: string
}

export type Project = {
  id: string
  name: string
  description: string
  url?: string
  technologies: string[]
  bullets: string[]
}

export type Certification = {
  id: string
  name: string
  issuer: string
  issueDate: string
  expiryDate?: string
  credentialUrl?: string
}

export type ResumeContent = {
  personalInfo: PersonalInfo
  experience: WorkExperience[]
  education: Education[]
  skills: string[]
  projects: Project[]
  certifications: Certification[]
}

export type Resume = {
  id: string
  userId: string
  title: string
  isDefault: boolean
  content: ResumeContent
  rawText: string | null
  createdAt: Date
  updatedAt: Date
}

// ========== Job Types ==========

export type JobSource =
  | 'linkedin'
  | 'indeed'
  | 'glassdoor'
  | 'jobstreet'
  | 'kalibrr'
  | 'techinasia'
  | 'manual'

export type JobType = 'remote' | 'hybrid' | 'onsite'

export type Job = {
  id: string
  externalId: string | null
  source: JobSource
  title: string
  company: string
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  currency: string
  isRemote: boolean
  jobType: JobType | null
  description: string
  requirements: string | null
  applyUrl: string
  postedAt: Date | null
  closingDate: Date | null
  industry: string | null
  companySize: string | null
  createdAt: Date
}

// ========== Application Types ==========

export type ApplicationStatus =
  | 'saved'
  | 'auto_applying'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export type JobApplication = {
  id: string
  userId: string
  jobId: string
  resumeId: string | null
  coverLetterId: string | null
  status: ApplicationStatus
  appliedAt: Date | null
  followUpDate: Date | null
  recruiterName: string | null
  recruiterEmail: string | null
  recruiterPhone: string | null
  notes: string | null
  matchScore: number | null
  salary: number | null
  createdAt: Date
  updatedAt: Date
}

// ========== Skill Types ==========

export type SkillCategory = 'programming' | 'framework' | 'tool' | 'soft'
export type SkillProficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export type UserSkill = {
  id: string
  userId: string
  name: string
  category: SkillCategory
  proficiency: SkillProficiency
}

// ========== AI Types ==========

export type MatchScoreResult = {
  score: number
  summary: string
  strengths: string[]
  gaps: string[]
  missingKeywords: string[]
}

export type KeywordGapResult = {
  present: string[]
  missing: string[]
  recommendations: string[]
}

// ========== Auto-Apply Types ==========

export type FormFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'file'

export type DetectedField = {
  name: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
  maxLength?: number
}

export type FormAnswer = {
  fieldName: string
  label: string
  value: string
  aiGenerated: boolean
  editedByUser?: boolean
}

export type AutoApplyStatus =
  | 'detecting'
  | 'pending_approval'
  | 'approved'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'skipped'

export type AutoApplyJobData = {
  sessionId: string
  applicationId: string
  userId: string
  jobId: string
  siteUrl: string
  source: 'linkedin' | 'indeed' | 'jobstreet'
  answers: FormAnswer[]
  resumeFileUrl?: string
}

// ========== Scraper Types ==========

export type ScrapeSource = 'jobstreet' | 'linkedin' | 'indeed' | 'glints'

export type ScrapeJobData = {
  source: ScrapeSource
  keyword: string
  location: string
  pages: number
  triggeredBy: 'manual' | 'scheduled'
}

export type ScrapedJob = {
  externalId: string
  source: ScrapeSource
  title: string
  company: string
  location: string | null
  description: string
  requirements: string | null
  salaryMin: number | null
  salaryMax: number | null
  currency: string
  isRemote: boolean
  jobType: 'remote' | 'hybrid' | 'onsite' | null
  applyUrl: string
  postedAt: Date | null
}
