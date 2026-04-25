import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { redirect } from 'next/navigation'
import { FilterForm } from './filter-form'

export const metadata = { title: 'Auto-Apply Filters' }
export const dynamic = 'force-dynamic'

export default async function AutoApplyFiltersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  let filter = await prisma.userAutoApplyFilter.findUnique({ where: { userId } })
  if (!filter) {
    filter = await prisma.userAutoApplyFilter.create({
      data: {
        userId,
        titleInclude: [],
        titleExclude: [],
        allowRemote: true,
        countryWhitelist: [],
        countryBlacklist: [],
        jobTypesAllowed: ['full-time', 'contract'],
        experienceAllowed: [],
        salaryMin: null,
        salaryCurrency: 'IDR',
        skipIfSalaryRequired: false,
        companyBlacklist: [],
        maxPerDay: 5,
        maxPerCompanyPerWeek: 2,
        easyApplyOnly: false,
        activeHourStart: 0,
        activeHourEnd: 23,
        activeDays: [],
        skipIfCoverLetter: false,
        skipIfEssay: false,
      },
    })
  }

  // Pass plain object (Prisma model -> client-safe shape)
  const initialFilter = JSON.parse(JSON.stringify(filter))

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auto-Apply Filters</h1>
        <p className="mt-1 text-gray-500">
          Aturan untuk Chrome extension. Pre-flight (sebelum buka tab) + mid-flow (saat scan halaman) + form-level.
        </p>
      </div>
      <FilterForm initialFilter={initialFilter} />
    </div>
  )
}
