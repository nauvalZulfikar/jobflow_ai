import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { SettingsForm } from './SettingsForm'

export const metadata = { title: 'Pengaturan' }

export default async function SettingsPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const [user, resumes, linkedinIntegration] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        plan: true,
        planExpiresAt: true,
        autoApplyEnabled: true,
        autoApplyResumeId: true,
        autoApplyMaxDaily: true,
        autoApplyLastRunAt: true,
      },
    }),
    prisma.resume.findMany({
      where: { userId },
      select: { id: true, title: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.userIntegration.findFirst({
      where: { userId, provider: 'linkedin' },
      select: { id: true },
    }),
  ])

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan</h1>
        <p className="mt-1 text-gray-500">Kelola akun dan preferensimu</p>
      </div>
      {user && <SettingsForm user={user} resumes={resumes} hasLinkedinCookie={!!linkedinIntegration} />}
    </div>
  )
}
