import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { SkillsClient } from '@/components/skills/skills-client'
import { SKILL_CATEGORY_LABELS } from '@jobflow/shared'

export const metadata = { title: 'Inventaris Keahlian' }

export default async function SkillsPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const skills = await prisma.userSkill.findMany({
    where: { userId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  // Group by category
  const grouped = Object.entries(SKILL_CATEGORY_LABELS).map(([cat, label]) => ({
    category: cat as import('@jobflow/shared').SkillCategory,
    label,
    skills: skills.filter((s) => s.category === cat) as import('@jobflow/shared').UserSkill[],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventaris Keahlian</h1>
        <p className="mt-1 text-gray-500">
          {skills.length} keahlian tersimpan — digunakan untuk AI matching
        </p>
      </div>
      <SkillsClient initialGrouped={grouped} />
    </div>
  )
}
