import type { FastifyRequest, FastifyReply } from 'fastify'

const PUBLIC_ROUTES = ['/health', '/api/auth']

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (PUBLIC_ROUTES.some((route) => request.url.startsWith(route))) return

  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token tidak valid atau sudah kadaluarsa' },
    })
  }
}
