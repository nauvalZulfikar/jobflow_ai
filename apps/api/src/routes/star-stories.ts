import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function starStoryRoutes(app: FastifyInstance) {
  // GET /api/star-stories
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const stories = await prisma.starStory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(success(stories))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil STAR stories'))
    }
  })

  // POST /api/star-stories
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as {
        title?: string
        situation?: string
        task?: string
        action?: string
        result?: string
        competencies?: string[]
      }

      if (!body.title || typeof body.title !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'title wajib diisi'))
      }
      if (!body.situation || typeof body.situation !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'situation wajib diisi'))
      }
      if (!body.task || typeof body.task !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'task wajib diisi'))
      }
      if (!body.action || typeof body.action !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'action wajib diisi'))
      }
      if (!body.result || typeof body.result !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'result wajib diisi'))
      }

      const story = await prisma.starStory.create({
        data: {
          userId: user.id,
          title: body.title,
          situation: body.situation,
          task: body.task,
          action: body.action,
          result: body.result,
          competencies: Array.isArray(body.competencies) ? body.competencies : [],
        },
      })
      return reply.status(201).send(success(story))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat STAR story'))
    }
  })

  // PATCH /api/star-stories/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as Partial<{
        title: string
        situation: string
        task: string
        action: string
        result: string
        competencies: string[]
      }>

      const existing = await prisma.starStory.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'STAR story tidak ditemukan'))

      const updated = await prisma.starStory.update({
        where: { id: request.params.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.situation !== undefined ? { situation: body.situation } : {}),
          ...(body.task !== undefined ? { task: body.task } : {}),
          ...(body.action !== undefined ? { action: body.action } : {}),
          ...(body.result !== undefined ? { result: body.result } : {}),
          ...(body.competencies !== undefined ? { competencies: body.competencies } : {}),
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui STAR story'))
    }
  })

  // DELETE /api/star-stories/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.starStory.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'STAR story tidak ditemukan'))

      await prisma.starStory.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus STAR story'))
    }
  })
}
