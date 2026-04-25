'use server'

import { auth } from '@/auth'
import { prisma } from '@jobflow/db'

type FilterInput = {
  titleInclude?: string[]
  titleExclude?: string[]
  allowRemote?: boolean
  countryWhitelist?: string[]
  countryBlacklist?: string[]
  jobTypesAllowed?: string[]
  experienceAllowed?: string[]
  salaryMin?: number | null
  salaryCurrency?: string
  skipIfSalaryRequired?: boolean
  companyBlacklist?: string[]
  maxPerDay?: number
  maxPerCompanyPerWeek?: number
  easyApplyOnly?: boolean
  activeHourStart?: number
  activeHourEnd?: number
  activeDays?: string[]
  skipIfCoverLetter?: boolean
  skipIfEssay?: boolean
}

export async function saveAutoApplyFilter(input: FilterInput): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'Not authenticated' }

  const data: any = {}
  const arrayKeys = ['titleInclude','titleExclude','countryWhitelist','countryBlacklist','jobTypesAllowed','experienceAllowed','companyBlacklist','activeDays'] as const
  for (const k of arrayKeys) {
    const v = (input as any)[k]
    if (Array.isArray(v)) data[k] = v.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 100)
  }
  if (typeof input.allowRemote === 'boolean') data.allowRemote = input.allowRemote
  if (typeof input.skipIfSalaryRequired === 'boolean') data.skipIfSalaryRequired = input.skipIfSalaryRequired
  if (typeof input.easyApplyOnly === 'boolean') data.easyApplyOnly = input.easyApplyOnly
  if (typeof input.skipIfCoverLetter === 'boolean') data.skipIfCoverLetter = input.skipIfCoverLetter
  if (typeof input.skipIfEssay === 'boolean') data.skipIfEssay = input.skipIfEssay
  if (typeof input.salaryMin === 'number') data.salaryMin = input.salaryMin
  if (input.salaryMin === null) data.salaryMin = null
  if (typeof input.salaryCurrency === 'string') data.salaryCurrency = input.salaryCurrency.slice(0, 8)
  if (typeof input.maxPerDay === 'number') data.maxPerDay = Math.max(1, Math.min(100, input.maxPerDay))
  if (typeof input.maxPerCompanyPerWeek === 'number') data.maxPerCompanyPerWeek = Math.max(1, Math.min(50, input.maxPerCompanyPerWeek))
  if (typeof input.activeHourStart === 'number') data.activeHourStart = Math.max(0, Math.min(23, input.activeHourStart))
  if (typeof input.activeHourEnd === 'number') data.activeHourEnd = Math.max(0, Math.min(23, input.activeHourEnd))

  try {
    await prisma.userAutoApplyFilter.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        titleInclude: [], titleExclude: [], allowRemote: true,
        countryWhitelist: [], countryBlacklist: [],
        jobTypesAllowed: ['full-time','contract'], experienceAllowed: [],
        salaryMin: null, salaryCurrency: 'IDR', skipIfSalaryRequired: false,
        companyBlacklist: [],
        maxPerDay: 5, maxPerCompanyPerWeek: 2,
        easyApplyOnly: false,
        activeHourStart: 0, activeHourEnd: 23, activeDays: [],
        skipIfCoverLetter: false, skipIfEssay: false,
        ...data,
      },
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Save failed' }
  }
}
