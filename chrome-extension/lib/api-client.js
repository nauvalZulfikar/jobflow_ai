import { API_BASE } from './config.js'

async function getToken() {
  const { apiToken } = await chrome.storage.local.get('apiToken')
  return apiToken
}

export async function fetchSavedApplications() {
  const token = await getToken()
  const res = await fetch(`${API_BASE}/applications`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message || 'Failed to fetch')
  // All saved jobs (LinkedIn + external)
  return json.data.filter(a => a.status === 'saved' && a.job?.applyUrl)
}

export async function fetchResumeData() {
  const token = await getToken()
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const json = await res.json()
  if (!json.success) return {}

  const user = json.data

  // Fetch default resume content
  let resume = {}
  try {
    const resResume = await fetch(`${API_BASE}/resume`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const resumeJson = await resResume.json()
    if (resumeJson.success && resumeJson.data?.length > 0) {
      const defaultResume = resumeJson.data.find(r => r.isDefault) || resumeJson.data[0]
      const content = defaultResume.content || {}
      const pi = content.personalInfo || {}
      resume = {
        firstName: pi.firstName || user.name?.split(' ')[0] || '',
        lastName: pi.lastName || user.name?.split(' ').slice(1).join(' ') || '',
        fullName: `${pi.firstName || ''} ${pi.lastName || ''}`.trim() || user.name || '',
        email: pi.email || user.email || '',
        phone: pi.phone || '',
        location: pi.location || '',
        city: pi.location?.split(',')[0]?.trim() || '',
        country: 'Indonesia',
        linkedin: pi.linkedinUrl || '',
        github: pi.githubUrl || '',
        portfolio: pi.portfolioUrl || '',
        summary: pi.summary || '',
        resumeUrl: defaultResume.fileUrl || null,
        currentCompany: content.experience?.[0]?.company || '',
        currentTitle: content.experience?.[0]?.title || '',
        yearsExp: String(content.experience?.length || 0),
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
    const res = await fetch(`${API_BASE}/auto-apply/resolve-fields`, {
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
    const res = await fetch(`${API_BASE}/auto-apply/recover-field`, {
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
  const res = await fetch(`${API_BASE}/applications/${applicationId}/auto-apply`, {
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
      const res = await fetch(`${API_BASE}/applications/${applicationId}/auto-apply/status`, {
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
    const res = await fetch(`${API_BASE}/auto-apply/diagnose`, {
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
    const res = await fetch(`${API_BASE}/auto-apply/guide-form`, {
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
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/auto-apply/dom-step`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pageState, resumeData, history, currentStep, maxStep }),
    })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

export async function agentStep({ url, screenshotBase64, goal, history, resumeData, maxStep, currentStep }) {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/auto-apply/agent-step`, {
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
    const res = await fetch(`${API_BASE}/extension/logs`, {
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

export async function updateStatus(applicationId, status, notes) {
  const token = await getToken()
  const body = { status }
  if (notes) body.notes = notes
  const res = await fetch(`${API_BASE}/applications/${applicationId}/status`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.ok
}
