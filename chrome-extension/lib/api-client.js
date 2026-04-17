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
  // Filter: only saved LinkedIn jobs
  return json.data.filter(a => a.status === 'saved' && a.job?.applyUrl?.includes('linkedin.com'))
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
