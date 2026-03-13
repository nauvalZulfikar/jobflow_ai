import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { CreateSkillSchema } from '@jobflow/shared'
import { success, failure } from '@jobflow/shared'

export async function skillRoutes(app: FastifyInstance) {
  // GET /api/skills
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const skills = await prisma.userSkill.findMany({
        where: { userId: user.id },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      })
      return reply.send(success(skills))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil keahlian'))
    }
  })

  // POST /api/skills
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = CreateSkillSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const skill = await prisma.userSkill.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { userId: user.id, ...parsed.data } as any,
      })
      return reply.status(201).send(success(skill))
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(409).send(failure('CONFLICT', 'Keahlian ini sudah ada'))
      }
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menambah keahlian'))
    }
  })

  // PATCH /api/skills/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as Partial<{ name: string; category: string; proficiency: string }>

      const existing = await prisma.userSkill.findFirst({ where: { id: request.params.id, userId: user.id } })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Keahlian tidak ditemukan'))

      const updated = await prisma.userSkill.update({
        where: { id: request.params.id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.category ? { category: body.category } : {}),
          ...(body.proficiency ? { proficiency: body.proficiency } : {}),
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui keahlian'))
    }
  })

  // DELETE /api/skills/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.userSkill.findFirst({ where: { id: request.params.id, userId: user.id } })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Keahlian tidak ditemukan'))

      await prisma.userSkill.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus keahlian'))
    }
  })

  // POST /api/skills/bulk — import dari resume
  app.post('/bulk', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as { skills: string[] }
      if (!Array.isArray(body.skills)) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'skills wajib berupa array'))
      }

      const created = await prisma.$transaction(
        body.skills.slice(0, 50).map((name) =>
          prisma.userSkill.upsert({
            where: { userId_name: { userId: user.id, name } },
            create: { userId: user.id, name, category: 'tool', proficiency: 'intermediate' },
            update: {},
          })
        )
      )

      return reply.send(success({ imported: created.length }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengimpor keahlian'))
    }
  })
}
