export const APPLICATION_STATUSES = [
  'saved',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  saved: 'Disimpan',
  auto_applying: 'Auto-apply',
  applied: 'Dilamar',
  screening: 'Screening',
  interview: 'Wawancara',
  offer: 'Penawaran',
  rejected: 'Ditolak',
  withdrawn: 'Ditarik',
}

export const JOB_SOURCES = [
  'linkedin',
  'indeed',
  'glassdoor',
  'jobstreet',
  'kalibrr',
  'techinasia',
  'manual',
] as const

export const SKILL_CATEGORIES = ['programming', 'framework', 'tool', 'soft'] as const

export const SKILL_CATEGORY_LABELS: Record<string, string> = {
  programming: 'Bahasa Pemrograman',
  framework: 'Framework',
  tool: 'Tools',
  soft: 'Soft Skills',
}

export const SKILL_PROFICIENCY_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const

export const SKILL_PROFICIENCY_LABELS: Record<string, string> = {
  beginner: 'Pemula',
  intermediate: 'Menengah',
  advanced: 'Mahir',
  expert: 'Pakar',
}

export const PLANS = ['free', 'pro', 'team'] as const

export const PLAN_LIMITS = {
  free: {
    applicationsPerMonth: 20,
    aiCallsPerMonth: 50,
    savedSearches: 3,
    resumeVersions: 2,
  },
  pro: {
    applicationsPerMonth: Infinity,
    aiCallsPerMonth: 500,
    savedSearches: Infinity,
    resumeVersions: Infinity,
  },
  team: {
    applicationsPerMonth: Infinity,
    aiCallsPerMonth: 2000,
    savedSearches: Infinity,
    resumeVersions: Infinity,
  },
} as const

export const DEFAULT_CURRENCY = 'IDR'

export const MAX_FILE_SIZE_MB = 10
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const FOLLOW_UP_DEFAULT_DAYS = 7

export const BATCH_APPLY_MAX_PER_HOUR = 10
export const APPLY_MIN_DELAY_MS = 3000
export const APPLY_MAX_DELAY_MS = 15000
