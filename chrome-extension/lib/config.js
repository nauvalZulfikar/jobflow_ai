// Runtime-configurable: read chrome.storage.local.devMode each call.
// Toggle via popup checkbox.
const PROD_BASE = 'https://jobflow.aureonforge.com/api'
const DEV_BASE = 'http://localhost:3001/api'

export async function getApiBase() {
  try {
    const { devMode } = await chrome.storage.local.get('devMode')
    return devMode ? DEV_BASE : PROD_BASE
  } catch {
    return PROD_BASE
  }
}
