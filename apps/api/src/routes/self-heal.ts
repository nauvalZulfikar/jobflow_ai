import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { openai, AI_MODEL } from '@jobflow/ai'
import { success, failure } from '@jobflow/shared'

// Extract host + first two path segments as a coarse pattern
function hostPatternFor(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean).slice(0, 2).join('/')
    return `${u.hostname}${parts ? '/' + parts : ''}`
  } catch { return url.slice(0, 120) }
}

const DIAGNOSE_STUCK_SYSTEM = `You are a debugging assistant for a job-application automation agent.
The agent got stuck on a page. Your job is to analyze the trace and decide:
1. Root cause (one short phrase, snake_case)
2. Fix category — ONE of:
   - "skip_site"       : this site can't be auto-applied reliably, skip it
   - "selector_update" : the agent is scanning the wrong element; a better CSS selector would fix it
   - "prompt_rule"     : the AI decision logic needs a hint for this specific site
   - "iframe_switch"   : form is inside an iframe that agent doesn't enter
   - "login_wall"      : page requires login first
   - "unknown"         : unclear, needs manual review
3. Suggested fix (short imperative sentence describing the change)
4. Confidence 0–100 — how sure are you the fix will work
5. skipForNow: boolean — should the agent skip this hostPattern until a developer verifies

Reply with strict JSON only:
{"rootCause":"...","fixCategory":"...","suggestedFix":"...","confidence": N, "skipForNow": boolean}`

export async function selfHealRoutes(app: FastifyInstance) {
  // POST /api/self-heal/capture — extension reports a stuck/failed job
  app.post('/capture', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as {
        batchId?: string
        applicationId?: string
        url: string
        reason: string
        historySnippet?: any
        domSnippet?: string
        screenshot?: string
      }
      if (!body?.url || !body?.reason) {
        return reply.status(400).send(failure('BAD_REQUEST', 'url + reason required'))
      }
      const failureRow = await prisma.autoApplyFailure.create({
        data: {
          userId: user.id,
          batchId: body.batchId || null,
          applicationId: body.applicationId || null,
          url: body.url.slice(0, 500),
          hostPattern: hostPatternFor(body.url),
          reason: body.reason.slice(0, 200),
          historySnippet: body.historySnippet ?? undefined,
          domSnippet: body.domSnippet ? body.domSnippet.slice(0, 5000) : null,
          screenshot: body.screenshot || null,
        },
      })
      return reply.send(success({ failureId: failureRow.id, hostPattern: failureRow.hostPattern }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'capture failed'))
    }
  })

  // POST /api/self-heal/diagnose/:failureId — run AI diagnosis on a captured failure
  app.post('/diagnose/:failureId', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const { failureId } = request.params as { failureId: string }
      const f = await prisma.autoApplyFailure.findFirst({
        where: { id: failureId, userId: user.id },
      })
      if (!f) return reply.status(404).send(failure('NOT_FOUND', 'failure not found'))

      const userText = [
        `URL: ${f.url}`,
        `Host pattern: ${f.hostPattern}`,
        `Stuck reason: ${f.reason}`,
        f.historySnippet ? `History:\n${JSON.stringify(f.historySnippet, null, 2).slice(0, 2500)}` : '',
        f.domSnippet ? `DOM snippet (truncated):\n${f.domSnippet.slice(0, 2500)}` : '',
      ].filter(Boolean).join('\n\n')

      const res = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: DIAGNOSE_STUCK_SYSTEM },
          { role: 'user', content: userText },
        ],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      })
      const text = res.choices[0]?.message?.content
      let diagnosis: any = null
      try { diagnosis = text ? JSON.parse(text) : null } catch {}
      if (!diagnosis) {
        return reply.send(success({ diagnosis: null, recipeId: null }))
      }

      // Auto-create a recipe if confidence high and fix is skip-class.
      // For "skip whole site" cases, normalize urlPattern to just hostname so it
      // catches all paths under that domain (Qoala has many darwinbox subpaths).
      let recipeId: string | null = null
      const confidence = Number(diagnosis.confidence) || 0
      if (confidence >= 80 && (diagnosis.skipForNow === true || diagnosis.fixCategory === 'skip_site' || diagnosis.fixCategory === 'login_wall')) {
        let pattern = f.hostPattern
        try {
          const u = new URL(f.url)
          pattern = u.hostname  // hostname-only for site-wide skip
        } catch {}
        const existing = await prisma.applyRecipe.findFirst({
          where: { userId: user.id, urlPattern: pattern, skipSite: true },
        })
        if (!existing) {
          const recipe = await prisma.applyRecipe.create({
            data: {
              userId: user.id,
              urlPattern: pattern,
              skipSite: true,
              reason: `${diagnosis.rootCause || 'unknown'}: ${diagnosis.suggestedFix || ''}`.slice(0, 500),
              source: 'auto_from_failure',
              confidence,
            },
          })
          recipeId = recipe.id
        } else {
          recipeId = existing.id
        }
      }

      await prisma.autoApplyFailure.update({
        where: { id: f.id },
        data: { diagnosis, recipeId: recipeId || undefined },
      })

      return reply.send(success({ diagnosis, recipeId }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'diagnose failed'))
    }
  })

  // GET /api/self-heal/recipes?url=... — extension fetches recipes matching a url
  app.get('/recipes', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const q = request.query as { url?: string }
      if (!q.url) return reply.send(success({ recipes: [] }))
      const hp = hostPatternFor(q.url)
      let host = ''
      try { host = new URL(q.url).hostname } catch {}
      const candidates = Array.from(new Set([hp, host, q.url.split('?')[0].slice(0, 200)].filter(Boolean)))
      const recipes = await prisma.applyRecipe.findMany({
        where: {
          OR: [{ userId: user.id }, { userId: null }],
          urlPattern: { in: candidates },
        },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(success({ recipes, hostPattern: hp, candidates }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'recipes fetch failed'))
    }
  })

  // GET /api/self-heal/failures?limit=50 — list recent failures for UI
  app.get('/failures', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const q = request.query as { limit?: string }
      const limit = Math.min(Number(q.limit) || 50, 200)
      const rows = await prisma.autoApplyFailure.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return reply.send(success({ failures: rows }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'failures fetch failed'))
    }
  })
}
