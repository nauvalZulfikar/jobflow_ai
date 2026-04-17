const API_BASE = 'https://jobflow.aureonforge.com/api'

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
