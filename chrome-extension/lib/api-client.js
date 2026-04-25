import { getApiBase } from './config.js'

async function getToken() {
  const { apiToken } = await chrome.storage.local.get('apiToken')
  return apiToken
}

// Sum months across experience entries (overlapping ranges counted once)
function computeTotalYears(experience) {
  if (!Array.isArray(experience) || experience.length === 0) return 0
  const parseMonth = (s) => {
    if (!s) return null
    const t = String(s).toLowerCase()
    if (t === 'present' || t === 'current' || t === 'now') return Date.now()
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d.getTime()
  }
  const ranges = experience
    .map(e => [parseMonth(e.startDate), parseMonth(e.endDate) ?? Date.now()])
    .filter(([a, b]) => a != null && b != null && b > a)
    .sort((x, y) => x[0] - y[0])
  if (ranges.length === 0) return 0
  // Merge overlapping ranges
  let merged = [ranges[0].slice()]
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1]
    if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1])
    else merged.push(ranges[i].slice())
  }
  const totalMs = merged.reduce((acc, [a, b]) => acc + (b - a), 0)
  return Math.max(0, Math.round(totalMs / (365.25 * 24 * 3600 * 1000)))
}

export async function fetchSavedApplications() {
  const token = await getToken()
  const res = await fetch(`${await getApiBase()}/applications`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message || 'Failed to fetch')
  // All saved jobs (LinkedIn + external)
  return json.data.filter(a => a.status === 'saved' && a.job?.applyUrl)
}

// Pick the best resume for a given job title from a list of resumes.
// Matching: exclude wins over include; otherwise include match wins; else default.
function pickResumeForTitle(resumes, jobTitle) {
  if (!Array.isArray(resumes) || resumes.length === 0) return null
  const t = String(jobTitle || '').toLowerCase()
  const fallback = resumes.find(r => r.isDefault) || resumes[0]
  if (!t) return fallback
  for (const r of resumes) {
    const exclude = (r.titleExclude || []).some(x => t.includes(String(x).toLowerCase()))
    if (exclude) continue
    const include = (r.titleInclude || []).some(x => t.includes(String(x).toLowerCase()))
    if (include) return r
  }
  return fallback
}

export async function fetchResumeData(jobTitle = '') {
  const token = await getToken()
  const res = await fetch(`${await getApiBase()}/users/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const json = await res.json()
  if (!json.success) return {}

  const user = json.data

  // Fetch all resumes, pick the best match for this job title (multi-resume profiles)
  let resume = {}
  try {
    const resResume = await fetch(`${await getApiBase()}/resume`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const resumeJson = await resResume.json()
    if (resumeJson.success && resumeJson.data?.length > 0) {
      const defaultResume = pickResumeForTitle(resumeJson.data, jobTitle)
      const content = defaultResume.content || {}
      const pi = content.personalInfo || {}
      const exps = Array.isArray(content.experience) ? content.experience : []
      const totalYears = computeTotalYears(exps)
      // Fallback location from most recent experience if personalInfo.location empty
      const fallbackLocation = pi.location || exps[0]?.location || ''
      resume = {
        firstName: pi.firstName || user.name?.split(' ')[0] || '',
        lastName: pi.lastName || user.name?.split(' ').slice(1).join(' ') || '',
        fullName: `${pi.firstName || ''} ${pi.lastName || ''}`.trim() || user.name || '',
        email: pi.email || user.email || '',
        phone: pi.phone || '',
        location: fallbackLocation,
        city: fallbackLocation.split(',')[0]?.trim() || '',
        country: 'Indonesia',
        linkedin: pi.linkedinUrl || '',
        github: pi.githubUrl || '',
        portfolio: pi.portfolioUrl || '',
        summary: pi.summary || '',
        resumeUrl: defaultResume.fileUrl || null,
        currentCompany: exps[0]?.company || '',
        currentTitle: exps[0]?.title || '',
        yearsExp: String(totalYears),
        skills: Array.isArray(content.skills) ? content.skills : [],
        experience: exps.slice(0, 5).map(e => ({
          title: e.title || '',
          company: e.company || '',
          startDate: e.startDate || '',
          endDate: e.endDate || 'Present',
        })),
        education: (Array.isArray(content.education) ? content.education : []).slice(0, 3).map(e => ({
          school: e.school || '',
          degree: e.degree || '',
          field: e.field || '',
        })),
        coverLetter: '',
        salary: '',
        address: pi.location || '',
      }
    }
  } catch {}

  // Fallback from user profile
  if (!resume.firstName) {
    resume = {
      firstName: user.name?.split(' ')[0] || '',
      lastName: user.name?.split(' ').slice(1).join(' ') || '',
      fullName: user.name || '',
      email: user.email || '',
      phone: '', location: '', city: '', country: 'Indonesia',
      linkedin: '', github: '', portfolio: '', summary: '',
      resumeUrl: null, currentCompany: '', currentTitle: '',
      yearsExp: '', coverLetter: '', salary: '', address: '',
    }
  }

  return resume
}

export async function resolveFields({ fields, resumeData, url }) {
  const token = await getToken()
  if (!token) return []
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/resolve-fields`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, resumeData, url }),
    })
    const json = await res.json()
    return json?.success ? (json.data?.fields ?? []) : []
  } catch { return [] }
}

export async function recoverField({ field, error, valueAttempted, resumeData }) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/recover-field`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, error, valueAttempted, resumeData }),
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

export async function checkLinkedInSession() {
  // Service worker can't use credentials:include — use chrome.cookies API instead
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' })
    return !!cookie && !!cookie.value
  } catch {
    return false
  }
}

export async function triggerServerAutoApply(applicationId) {
  const token = await getToken()
  const res = await fetch(`${await getApiBase()}/applications/${applicationId}/auto-apply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const json = await res.json()
  return json // { success, data: { sessionId, status } }
}

export async function pollAutoApplyStatus(applicationId, maxWaitMs = 120000) {
  const token = await getToken()
  const start = Date.now()
  const pollInterval = 5000

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${await getApiBase()}/applications/${applicationId}/auto-apply/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const json = await res.json()
      if (!json.success) return { status: 'failed', reason: json.error?.message || 'unknown' }

      const session = json.data
      if (session.status === 'submitted') {
        return { status: 'applied', reason: 'server_auto_apply' }
      }
      if (session.status === 'failed') {
        return { status: 'failed', reason: session.failureReason || 'server_failed' }
      }
      if (session.status === 'skipped') {
        return { status: 'needs_review', reason: 'server_skipped' }
      }
      // Still processing (approved, submitting, detecting) — keep polling
    } catch {
      // Network error — keep trying
    }
    await new Promise(r => setTimeout(r, pollInterval))
  }

  return { status: 'failed', reason: 'server_timeout' }
}

export async function diagnoseFailure({ url, screenshotBase64, domSnippet, ruleBasedReason, attempted }) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/diagnose`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, screenshotBase64, domSnippet, ruleBasedReason, attempted }),
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

export async function guideForm({ url, domSnippet, formFields, resumeData, filledCount, totalCount }) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/guide-form`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, domSnippet, formFields, resumeData, filledCount, totalCount }),
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

export async function domStep({ url, pageState, resumeData, history, currentStep, maxStep }) {
  const token = await getToken()
  if (!token) return { actions: [], status: 'fail', reason: 'no_token' }
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/dom-step`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pageState, resumeData, history, currentStep, maxStep }),
    })
    if (!res.ok) return { actions: [], status: 'fail', reason: `http_${res.status}` }
    const json = await res.json()
    if (!json?.success) return { actions: [], status: 'fail', reason: json?.error?.code || 'api_error' }
    return json.data
  } catch (err) {
    return { actions: [], status: 'fail', reason: `network: ${err?.message || 'unknown'}` }
  }
}

export async function agentStep({ url, screenshotBase64, goal, history, resumeData, maxStep, currentStep }) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/agent-step`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, screenshotBase64, goal, history, resumeData, maxStep, currentStep }),
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

export async function pushExtensionLogs(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { success: true, ignored: true }
  const token = await getToken()
  if (!token) return { success: false, error: { code: 'NO_TOKEN' } }
  try {
    const res = await fetch(`${await getApiBase()}/extension/logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries }),
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: { code: 'NETWORK', message: err?.message || 'network' } }
  }
}

// Fetch user's auto-apply filter config (web-defined rules)
export async function fetchAutoApplyFilter() {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/auto-apply/filters`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

// Fetch runtime recipes (url → {skipSite, overrides}) for a given apply URL
export async function fetchRecipes(url) {
  const token = await getToken()
  if (!token) return []
  try {
    const res = await fetch(`${await getApiBase()}/self-heal/recipes?url=${encodeURIComponent(url)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const json = await res.json()
    return json?.success ? (json.data?.recipes || []) : []
  } catch { return [] }
}

// Report a stuck/failed job with context; returns { failureId }
export async function captureFailure({ batchId, applicationId, url, reason, historySnippet, domSnippet, screenshot }) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/self-heal/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, applicationId, url, reason, historySnippet, domSnippet, screenshot }),
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

// Trigger AI diagnosis for a captured failure; returns { diagnosis, recipeId }
export async function diagnoseFailureById(failureId) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${await getApiBase()}/self-heal/diagnose/${failureId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

export async function updateStatus(applicationId, status, notes) {
  const token = await getToken()
  const body = { status }
  if (notes) body.notes = notes
  const res = await fetch(`${await getApiBase()}/applications/${applicationId}/status`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.ok
}
