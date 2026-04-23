// Ganti ke true untuk dev lokal (localhost:3001)
const DEV = false

export const API_BASE = DEV
  ? 'http://localhost:3001/api'
  : 'https://jobflow.aureonforge.com/api'
