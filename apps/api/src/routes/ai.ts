import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { matchScore, keywordGapAnalysis, tailorResume, generateCoverLetter, streamMockInterview } from '@jobflow/ai'
import { success, failure } from '@jobflow/shared'
import type { ResumeContent } from '@jobflow/shared'
import { z } from 'zod'

const MatchScoreBodySchema = z.object({
  resumeId: z.string().cuid(),
  jobId: z.string().cuid(),
})

const TailorResumeBodySchema = z.object({
  resumeId: z.string().cuid(),
  jobId: z.string().cuid(),
  saveAs: z.string().optional(),
})

const CoverLetterBodySchema = z.object({
  resumeId: z.string().cuid(),
  jobId: z.string().cuid(),
  templateId: z.string().cuid().optional(),
})

const MockInterviewBodySchema = z.object({
  resumeId: z.string().cuid(),
  jobId: z.string().cuid(),
  history: z.array(z.object({ role: z.enum(['interviewer', 'candidate']), content: z.string() })).default([]),
  candidateAnswer: z.string().default(''),
})

export async function aiRoutes(app: FastifyInstance) {
  // POST /api/ai/match-score
  app.post('/match-score', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = MatchScoreBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const [resume, job] = await Promise.all([
        prisma.resume.findFirst({ where: { id: parsed.data.resumeId, userId: user.id } }),
        prisma.job.findUnique({ where: { id: parsed.data.jobId } }),
      ])

      if (!resume) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))
      if (!resume.rawText) return reply.status(400).send(failure('VALIDATION_ERROR', 'Resume belum memiliki teks'))

      // Cache: update application match score if exists
      const result = await matchScore(resume.rawText, job.description)

      await prisma.jobApplication.updateMany({
        where: { userId: user.id, jobId: job.id },
        data: { matchScore: result.score },
      })

      return reply.send(success(result))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghitung skor kecocokan'))
    }
  })

  // POST /api/ai/keyword-gap
  app.post('/keyword-gap', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = MatchScoreBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const [resume, job] = await Promise.all([
        prisma.resume.findFirst({ where: { id: parsed.data.resumeId, userId: user.id } }),
        prisma.job.findUnique({ where: { id: parsed.data.jobId } }),
      ])

      if (!resume) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))
      if (!resume.rawText) return reply.status(400).send(failure('VALIDATION_ERROR', 'Resume belum memiliki teks'))

      const result = await keywordGapAnalysis(resume.rawText, job.description)
      return reply.send(success(result))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menganalisis kata kunci'))
    }
  })

  // POST /api/ai/tailor-resume
  app.post('/tailor-resume', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = TailorResumeBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const [resume, job] = await Promise.all([
        prisma.resume.findFirst({ where: { id: parsed.data.resumeId, userId: user.id } }),
        prisma.job.findUnique({ where: { id: parsed.data.jobId } }),
      ])

      if (!resume) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))

      const tailored = await tailorResume(resume.content as ResumeContent, job.description)

      const newResume = await prisma.resume.create({
        data: {
          userId: user.id,
          title: parsed.data.saveAs ?? `${resume.title} - ${job.company}`,
          isDefault: false,
          content: tailored,
          rawText: resume.rawText,
          version: resume.version + 1,
        },
      })

      return reply.status(201).send(success(newResume))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menyesuaikan resume'))
    }
  })

  // POST /api/ai/generate-cover-letter
  app.post('/generate-cover-letter', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = CoverLetterBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const [resume, job] = await Promise.all([
        prisma.resume.findFirst({ where: { id: parsed.data.resumeId, userId: user.id } }),
        prisma.job.findUnique({ where: { id: parsed.data.jobId } }),
      ])

      if (!resume) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))

      let template = 'Kepada Yth. Tim Rekrutmen {{nama_perusahaan}},\n\nDengan hormat,\n\nSaya {{nama_pengguna}} ingin melamar posisi {{posisi}}.\n\n[ISI SURAT]\n\nHormat saya,\n{{nama_pengguna}}\n{{tanggal}}'

      if (parsed.data.templateId) {
        const tmpl = await prisma.coverLetterTemplate.findFirst({
          where: { id: parsed.data.templateId, userId: user.id },
        })
        if (tmpl) template = tmpl.body
      } else {
        const defaultTmpl = await prisma.coverLetterTemplate.findFirst({
          where: { userId: user.id, isDefault: true },
        })
        if (defaultTmpl) template = defaultTmpl.body
      }

      const content = resume.content as ResumeContent
      const result = await generateCoverLetter(content, job.description, template, {
        companyName: job.company,
        position: job.title,
      })

      return reply.send(success({ coverLetter: result }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat surat lamaran'))
    }
  })

  // POST /api/ai/mock-interview (streaming SSE)
  app.post('/mock', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = MockInterviewBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const [resume, job] = await Promise.all([
        prisma.resume.findFirst({ where: { id: parsed.data.resumeId, userId: user.id } }),
        prisma.job.findUnique({ where: { id: parsed.data.jobId } }),
      ])

      if (!resume) return reply.status(404).send(failure('NOT_FOUND', 'Resume tidak ditemukan'))
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      for await (const chunk of streamMockInterview(
        resume.content as ResumeContent,
        job.description,
        parsed.data.history,
        parsed.data.candidateAnswer
      )) {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
      }

      reply.raw.write('data: [DONE]\n\n')
      reply.raw.end()
    } catch {
      reply.raw.write(`data: ${JSON.stringify({ error: 'Gagal menjalankan simulasi wawancara' })}\n\n`)
      reply.raw.end()
    }
  })
}
