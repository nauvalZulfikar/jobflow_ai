import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

// NOTE: Team and TeamMember models are not yet in schema.prisma.
// These routes are ready for when the models are added via migration.
// Until then, requests will return 503.

const TEAMS_ENABLED = false // Set to true after running migration to add Team/TeamMember models

export async function teamRoutes(app: FastifyInstance) {
  // POST /api/teams — create team
  app.post('/', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }
      const body = request.body as { name?: string }

      if (!body.name || typeof body.name !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'name wajib diisi'))
      }

      const slug = body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const team = await (prisma as any).team.create({
        data: {
          name: body.name,
          slug,
          ownerId: user.id,
          maxMembers: 5,
          members: {
            create: {
              userId: user.id,
              role: 'owner',
            },
          },
        },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        },
      })
      return reply.status(201).send(success(team))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat tim'))
    }
  })

  // GET /api/teams/my — list teams user belongs to
  app.get('/my', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memberships = await (prisma as any).teamMember.findMany({
        where: { userId: user.id },
        include: {
          team: {
            include: {
              _count: { select: { members: true } },
            },
          },
        },
      })

      const teams = memberships.map((m: {
        role: string;
        team: { id: string; name: string; slug: string; ownerId: string; _count: { members: number } }
      }) => ({
        ...m.team,
        role: m.role,
        memberCount: m.team._count.members,
      }))

      return reply.send(success(teams))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil daftar tim'))
    }
  })

  // GET /api/teams/:id/members
  app.get<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const membership = await (prisma as any).teamMember.findFirst({
        where: { teamId: request.params.id, userId: user.id },
      })
      if (!membership) return reply.status(403).send(failure('FORBIDDEN', 'Kamu bukan anggota tim ini'))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members = await (prisma as any).teamMember.findMany({
        where: { teamId: request.params.id },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      })
      return reply.send(success(members))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil anggota tim'))
    }
  })

  // POST /api/teams/:id/invite
  app.post<{ Params: { id: string } }>('/:id/invite', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }
      const body = request.body as { email?: string }

      if (!body.email || typeof body.email !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'email wajib diisi'))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const membership = await (prisma as any).teamMember.findFirst({
        where: { teamId: request.params.id, userId: user.id, role: { in: ['owner', 'admin'] } },
      })
      if (!membership) return reply.status(403).send(failure('FORBIDDEN', 'Hanya owner/admin yang bisa mengundang'))

      const secret = process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production'
      const payload = { teamId: request.params.id, email: body.email, invitedBy: user.id }
      const token = app.jwt.sign(payload, { expiresIn: '7d', key: secret })

      return reply.send(success({ inviteToken: token }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat undangan'))
    }
  })

  // POST /api/teams/:id/accept
  app.post<{ Params: { id: string } }>('/:id/accept', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }
      const body = request.body as { token?: string }

      if (!body.token || typeof body.token !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'token wajib diisi'))
      }

      const secret = process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production'
      let decoded: { teamId: string; email: string; invitedBy: string }
      try {
        decoded = app.jwt.verify(body.token, { key: secret }) as typeof decoded
      } catch {
        return reply.status(400).send(failure('INVALID_TOKEN', 'Token undangan tidak valid atau sudah expired'))
      }

      if (decoded.teamId !== request.params.id) {
        return reply.status(400).send(failure('INVALID_TOKEN', 'Token tidak sesuai dengan tim ini'))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const team = await (prisma as any).team.findUnique({ where: { id: request.params.id } })
      if (!team) return reply.status(404).send(failure('NOT_FOUND', 'Tim tidak ditemukan'))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memberCount = await (prisma as any).teamMember.count({ where: { teamId: request.params.id } })
      if (memberCount >= team.maxMembers) {
        return reply.status(400).send(failure('LIMIT_REACHED', 'Tim sudah mencapai batas anggota maksimum'))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma as any).teamMember.findFirst({
        where: { teamId: request.params.id, userId: user.id },
      })
      if (existing) return reply.status(409).send(failure('CONFLICT', 'Kamu sudah menjadi anggota tim ini'))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = await (prisma as any).teamMember.create({
        data: {
          teamId: request.params.id,
          userId: user.id,
          role: 'member',
        },
      })
      return reply.status(201).send(success(member))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal bergabung ke tim'))
    }
  })

  // DELETE /api/teams/:id/members/:userId
  app.delete<{ Params: { id: string; userId: string } }>('/:id/members/:userId', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requesterMembership = await (prisma as any).teamMember.findFirst({
        where: { teamId: request.params.id, userId: user.id, role: { in: ['owner', 'admin'] } },
      })
      if (!requesterMembership) return reply.status(403).send(failure('FORBIDDEN', 'Hanya owner/admin yang bisa menghapus anggota'))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const targetMembership = await (prisma as any).teamMember.findFirst({
        where: { teamId: request.params.id, userId: request.params.userId },
      })
      if (!targetMembership) return reply.status(404).send(failure('NOT_FOUND', 'Anggota tidak ditemukan'))

      if (targetMembership.role === 'owner') {
        return reply.status(400).send(failure('FORBIDDEN', 'Owner tidak bisa dihapus dari tim'))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).teamMember.delete({ where: { id: targetMembership.id } })
      return reply.send(success({ removed: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus anggota tim'))
    }
  })

  // POST /api/teams/:id/leave
  app.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const membership = await (prisma as any).teamMember.findFirst({
        where: { teamId: request.params.id, userId: user.id },
      })
      if (!membership) return reply.status(404).send(failure('NOT_FOUND', 'Kamu bukan anggota tim ini'))

      if (membership.role === 'owner') {
        return reply.status(400).send(failure('FORBIDDEN', 'Owner tidak bisa meninggalkan tim. Transfer ownership terlebih dahulu.'))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).teamMember.delete({ where: { id: membership.id } })
      return reply.send(success({ left: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal keluar dari tim'))
    }
  })

  // DELETE /api/teams/:id — delete team (owner only)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    if (!TEAMS_ENABLED) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Fitur teams belum tersedia'))
    }
    try {
      const user = request.user as { id: string }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const team = await (prisma as any).team.findFirst({
        where: { id: request.params.id, ownerId: user.id },
      })
      if (!team) return reply.status(404).send(failure('NOT_FOUND', 'Tim tidak ditemukan atau kamu bukan owner'))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).team.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus tim'))
    }
  })
}
