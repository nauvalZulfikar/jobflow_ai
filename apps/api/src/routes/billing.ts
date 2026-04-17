import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

const PLAN_LIMITS: Record<string, { aiCalls: number; applications: number }> = {
  free: { aiCalls: 20, applications: 10 },
  pro: { aiCalls: 500, applications: 9999 },
  team: { aiCalls: 500, applications: 9999 },
}

export async function billingRoutes(app: FastifyInstance) {
  // GET /api/billing
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const found = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          plan: true,
          planExpiresAt: true,
          _count: {
            select: { resumes: true },
          },
        },
      })
      if (!found) return reply.status(404).send(failure('NOT_FOUND', 'User tidak ditemukan'))

      const limits = PLAN_LIMITS[found.plan] ?? PLAN_LIMITS['free']!

      return reply.send(
        success({
          plan: found.plan,
          planExpiresAt: found.planExpiresAt,
          usage: {
            aiCalls: 0,
            aiCallsLimit: limits.aiCalls,
            applications: 0,
            applicationsLimit: limits.applications,
            resumes: found._count.resumes,
            resetDate: null,
          },
        })
      )
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil data billing'))
    }
  })

  // POST /api/billing/create-checkout
  app.post('/create-checkout', async (request, reply) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Stripe tidak dikonfigurasi'))
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = require('stripe')
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })
      const user = request.user as { id: string }

      const found = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true },
      })
      if (!found) return reply.status(404).send(failure('NOT_FOUND', 'User tidak ditemukan'))

      const priceId = process.env.STRIPE_PRO_PRICE_ID
      if (!priceId) {
        return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Price ID Stripe tidak dikonfigurasi'))
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: found.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/billing?success=1`,
        cancel_url: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/billing?canceled=1`,
        metadata: { userId: user.id },
      })

      return reply.send(success({ checkoutUrl: session.url }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat sesi checkout'))
    }
  })

  // POST /api/billing/cancel
  app.post('/cancel', async (request, reply) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Stripe tidak dikonfigurasi'))
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = require('stripe')
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })
      const user = request.user as { id: string }

      const body = request.body as { subscriptionId?: string }
      if (!body.subscriptionId) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'subscriptionId wajib diisi'))
      }

      await stripe.subscriptions.cancel(body.subscriptionId)

      await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'free', planExpiresAt: null },
      })

      return reply.send(success({ canceled: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membatalkan langganan'))
    }
  })

  // POST /api/billing/webhook
  app.post('/webhook', async (request, reply) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return reply.status(503).send(failure('SERVICE_UNAVAILABLE', 'Stripe tidak dikonfigurasi'))
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = require('stripe')
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      let event: { type: string; data: { object: Record<string, unknown> } }

      if (webhookSecret) {
        const sig = request.headers['stripe-signature'] as string
        const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody
        if (!rawBody) {
          return reply.status(400).send(failure('BAD_REQUEST', 'Raw body tidak tersedia'))
        }
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      } else {
        event = request.body as typeof event
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as { metadata?: { userId?: string }; subscription?: string }
        const userId = session.metadata?.userId
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              plan: 'pro',
              planExpiresAt: null,
            },
          })
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as { metadata?: { userId?: string }; customer?: string }
        const userId = subscription.metadata?.userId
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              plan: 'free',
              planExpiresAt: null,
            },
          })
        }
      }

      return reply.send({ received: true })
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memproses webhook'))
    }
  })
}
