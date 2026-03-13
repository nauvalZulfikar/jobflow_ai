import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { ResumeBuilderClient } from '@/components/resume/resume-builder-client'
import type { ResumeContent } from '@jobflow/shared'

export const metadata = { title: 'Edit Resume' }

export default async function EditResumePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user!.id!

  const resume = await prisma.resume.findFirst({
    where: { id, userId },
  })

  if (!resume) notFound()

  return (
    <ResumeBuilderClient
      resumeId={resume.id}
      initialTitle={resume.title}
      initialContent={resume.content as ResumeContent}
    />
  )
}
