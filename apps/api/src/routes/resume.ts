import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { parseResume } from '@jobflow/ai'
import { CreateResumeSchema } from '@jobflow/shared'
import { success, failure } from '@jobflow/shared'
import pdfParse from 'pdf-parse'

export async function resumeRoutes(app: FastifyInstance) {
  // GET /api/resume — list all resumes for current user
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const resumes = await prisma.resume.findMany({
        where: { userId: user.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, title: true, isDefault: true, version: true, createdAt: true, updatedAt: true },
      })
      return reply.send(success(resumes))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil daftar resume'))
    }
  })

  // GET /api/resume/:id — get single resume
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const resume = await prisma.resume.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!resume) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))
      return reply.send(success(resume))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil resume'))
    }
  })

  // POST /api/resume — create resume
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = CreateResumeSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(
          failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid')
        )
      }

      // If setting as default, unset current default
      if (parsed.data.isDefault) {
        await prisma.resume.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        })
      }

      const rawText = extractRawText(parsed.data.content)

      const resume = await prisma.resume.create({
        data: {
          userId: user.id,
          title: parsed.data.title,
          isDefault: parsed.data.isDefault,
          content: parsed.data.content,
          rawText,
        },
      })

      return reply.status(201).send(success(resume))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat resume'))
    }
  })

  // PATCH /api/resume/:id — update resume
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.resume.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))

      const body = request.body as Record<string, unknown>

      if (body.isDefault === true) {
        await prisma.resume.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        })
      }

      const rawText = body.content ? extractRawText(body.content as Parameters<typeof extractRawText>[0]) : undefined

      const updated = await prisma.resume.update({
        where: { id: request.params.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...(body.title ? { title: body.title as string } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault as boolean } : {}),
          ...(body.content ? { content: body.content as any, rawText, version: existing.version + 1 } : {}),
        },
      })

      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui resume'))
    }
  })

  // DELETE /api/resume/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.resume.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))

      await prisma.resume.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus resume'))
    }
  })

  // POST /api/resume/parse — parse uploaded PDF/DOCX
  app.post('/parse', async (request, reply) => {
    try {
      const data = await request.file()
      if (!data) return reply.status(400).send(failure('VALIDATION_ERROR', 'File wajib diunggah'))

      const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      if (!allowed.includes(data.mimetype)) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'Hanya file PDF atau DOCX yang diizinkan'))
      }

      const buffer = await data.toBuffer()
      let rawText = ''

      if (data.mimetype === 'application/pdf') {
        const parsed = await pdfParse(buffer)
        rawText = parsed.text
      } else {
        // For DOCX, return error for now — full implementation needs mammoth
        return reply.status(400).send(failure('NOT_IMPLEMENTED', 'DOCX parsing belum tersedia, gunakan PDF'))
      }

      const resumeContent = await parseResume(rawText)
      return reply.send(success({ content: resumeContent, rawText }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memproses file resume'))
    }
  })
}

function extractRawText(content: { personalInfo?: { firstName?: string; lastName?: string; summary?: string }; experience?: Array<{ company?: string; title?: string; bullets?: string[] }>; skills?: string[] }): string {
  const parts: string[] = []
  if (content.personalInfo) {
    parts.push(`${content.personalInfo.firstName ?? ''} ${content.personalInfo.lastName ?? ''}`.trim())
    if (content.personalInfo.summary) parts.push(content.personalInfo.summary)
  }
  if (content.experience) {
    for (const exp of content.experience) {
      parts.push(`${exp.title ?? ''} at ${exp.company ?? ''}`)
      if (exp.bullets) parts.push(...exp.bullets)
    }
  }
  if (content.skills) {
    parts.push(content.skills.join(', '))
  }
  return parts.join('\n')
}
