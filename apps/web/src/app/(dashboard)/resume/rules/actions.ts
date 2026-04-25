'use server'

import { auth } from '@/auth'
import { prisma } from '@jobflow/db'

export async function saveResumeRules(resumeId: string, titleInclude: string[], titleExclude: string[]) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'Not authenticated' }
  try {
    const r = await prisma.resume.findFirst({ where: { id: resumeId, userId: session.user.id } })
    if (!r) return { success: false, error: 'Resume not found' }
    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        titleInclude: titleInclude.map(s => String(s).trim()).filter(Boolean).slice(0, 50),
        titleExclude: titleExclude.map(s => String(s).trim()).filter(Boolean).slice(0, 50),
      },
    })
    return { success: true } as const
  } catch (err: any) {
    return { success: false, error: err?.message || 'Save failed' } as const
  }
}
