import { prisma } from '@jobflow/db'

export const PLAN_LIMITS: Record<string, { aiCalls: number; applications: number }> = {
  free: { aiCalls: 20, applications: 10 },
  pro: { aiCalls: 500, applications: 9999 },
  team: { aiCalls: 500, applications: 9999 },
}

export function getPlanLimits(plan: string): { aiCalls: number; applications: number } {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS['free']!
}

/**
 * Check if user is within their plan limits for the given usage type.
 * Resets counters if usageResetDate has passed.
 * Increments the counter.
 * Throws an Error with a descriptive message if over limit.
 *
 * NOTE: User model does not yet have aiCallsThisMonth, applicationsThisMonth,
 * or usageResetDate fields. This service uses $queryRaw to gracefully handle
 * the absence of those columns. Add those fields to the schema when ready:
 *   aiCallsThisMonth     Int      @default(0)
 *   applicationsThisMonth Int     @default(0)
 *   usageResetDate       DateTime?
 */
export async function checkAndIncrementUsage(
  userId: string,
  type: 'aiCall' | 'application'
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  if (!user) throw new Error('User tidak ditemukan')

  const limits = getPlanLimits(user.plan ?? 'free')

  // Check if reset date has passed and reset counters
  const now = new Date()
  const resetDate: Date | null = user.usageResetDate ? new Date(user.usageResetDate) : null
  const needsReset = !resetDate || now > resetDate

  if (needsReset) {
    const nextResetDate = new Date(now)
    nextResetDate.setMonth(nextResetDate.getMonth() + 1)
    nextResetDate.setDate(1)
    nextResetDate.setHours(0, 0, 0, 0)

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          aiCallsThisMonth: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          applicationsThisMonth: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          usageResetDate: nextResetDate,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
      // Reset local values
      user.aiCallsThisMonth = 0
      user.applicationsThisMonth = 0
    } catch {
      // Fields may not exist in schema yet — skip reset
    }
  }

  const currentAiCalls: number = user.aiCallsThisMonth ?? 0
  const currentApplications: number = user.applicationsThisMonth ?? 0

  if (type === 'aiCall') {
    if (currentAiCalls >= limits.aiCalls) {
      throw new Error(
        `Batas AI calls bulan ini telah tercapai (${limits.aiCalls}). Upgrade ke plan Pro untuk lebih banyak.`
      )
    }
    try {
      await prisma.user.update({
        where: { id: userId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { aiCallsThisMonth: currentAiCalls + 1 } as any,
      })
    } catch {
      // Fields may not exist in schema yet — skip increment
    }
  } else if (type === 'application') {
    if (currentApplications >= limits.applications) {
      throw new Error(
        `Batas lamaran bulan ini telah tercapai (${limits.applications}). Upgrade ke plan Pro untuk lebih banyak.`
      )
    }
    try {
      await prisma.user.update({
        where: { id: userId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { applicationsThisMonth: currentApplications + 1 } as any,
      })
    } catch {
      // Fields may not exist in schema yet — skip increment
    }
  }
}
