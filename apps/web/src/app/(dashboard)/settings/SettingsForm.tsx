'use client'

import { useState } from 'react'
import { User, Mail, Shield, Bot, Clock, Link2, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateExtensionToken } from './actions'

interface UserData {
  id: string
  name: string | null
  email: string
  image: string | null
  plan: string
  planExpiresAt: Date | null
  autoApplyEnabled: boolean
  autoApplyResumeId: string | null
  autoApplyMaxDaily: number
  autoApplyLastRunAt: Date | null
}

interface Resume {
  id: string
  title: string
  isDefault: boolean
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratis',
  pro: 'Pro',
  team: 'Tim',
}

export function SettingsForm({ user, resumes, hasLinkedinCookie }: { user: UserData; resumes: Resume[]; hasLinkedinCookie: boolean }) {
  const [name, setName] = useState(user.name ?? '')
  const [saving, setSaving] = useState(false)

  const [autoApplyEnabled, setAutoApplyEnabled] = useState(user.autoApplyEnabled)
  const [autoApplyResumeId, setAutoApplyResumeId] = useState(user.autoApplyResumeId ?? '')
  const [autoApplyMaxDaily, setAutoApplyMaxDaily] = useState(user.autoApplyMaxDaily)
  const [savingAutoApply, setSavingAutoApply] = useState(false)

  const [linkedinCookie, setLinkedinCookie] = useState('')
  const [cookieConnected, setCookieConnected] = useState(hasLinkedinCookie)
  const [savingCookie, setSavingCookie] = useState(false)

  const [extensionToken, setExtensionToken] = useState('')
  const [generatingToken, setGeneratingToken] = useState(false)

  async function handleSaveProfile() {
    setSaving(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      toast.success('Profil diperbarui')
    } catch {
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveLinkedinCookie() {
    if (!linkedinCookie.trim()) {
      toast.error('Paste cookie li_at LinkedIn kamu')
      return
    }
    setSavingCookie(true)
    try {
      const res = await fetch('/api/users/me/linkedin-cookie', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: linkedinCookie.trim() }),
      })
      if (!res.ok) throw new Error()
      setCookieConnected(true)
      setLinkedinCookie('')
      toast.success('LinkedIn terhubung')
    } catch {
      toast.error('Gagal menyimpan cookie')
    } finally {
      setSavingCookie(false)
    }
  }

  async function handleDisconnectLinkedin() {
    setSavingCookie(true)
    try {
      await fetch('/api/users/me/linkedin-cookie', { method: 'DELETE' })
      setCookieConnected(false)
      toast.success('LinkedIn diputus')
    } catch {
      toast.error('Gagal memutus LinkedIn')
    } finally {
      setSavingCookie(false)
    }
  }

  async function handleGenerateToken() {
    setGeneratingToken(true)
    try {
      const result = await generateExtensionToken()
      if (result.success) {
        setExtensionToken(result.token)
        toast.success('Token dibuat')
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Gagal membuat token')
    } finally {
      setGeneratingToken(false)
    }
  }

  async function handleSaveAutoApply() {
    if (autoApplyEnabled && !autoApplyResumeId) {
      toast.error('Pilih resume terlebih dahulu')
      return
    }
    setSavingAutoApply(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoApplyEnabled,
          autoApplyResumeId: autoApplyResumeId || null,
          autoApplyMaxDaily,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(autoApplyEnabled ? 'Auto-apply diaktifkan' : 'Auto-apply dinonaktifkan')
    } catch {
      toast.error('Gagal menyimpan pengaturan')
    } finally {
      setSavingAutoApply(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* LinkedIn Integration section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Koneksi LinkedIn</h2>
          {cookieConnected ? (
            <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Terhubung
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <XCircle className="h-4 w-4" /> Belum terhubung
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Untuk auto-apply di LinkedIn, sistem butuh semua cookies sesi LinkedIn kamu.{' '}
          Cara ambil: login LinkedIn → F12 → tab <strong>Console</strong> → paste dan jalankan kode ini:
        </p>
        <pre className="mb-4 rounded-lg bg-gray-900 p-3 text-xs text-green-400 overflow-x-auto select-all">
{`copy(JSON.stringify([...document.cookie.split(';').map(c=>{const[n,...v]=c.trim().split('=');return{name:n,value:v.join('='),domain:'.linkedin.com',path:'/'}})]))`}
        </pre>
        <p className="mb-4 text-sm text-gray-500">
          Hasilnya otomatis ter-copy ke clipboard. Paste di bawah.
        </p>
        {cookieConnected ? (
          <button
            onClick={handleDisconnectLinkedin}
            disabled={savingCookie}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Putus Koneksi LinkedIn
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={linkedinCookie}
              onChange={(e) => setLinkedinCookie(e.target.value)}
              placeholder="Paste nilai cookie li_at di sini..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono"
            />
            <button
              onClick={handleSaveLinkedinCookie}
              disabled={savingCookie || !linkedinCookie.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
            >
              {savingCookie ? 'Menyimpan...' : 'Hubungkan'}
            </button>
          </div>
        )}
      </div>

      {/* Auto-Apply section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-semibold text-gray-900">Auto-Apply Otomatis</h2>
          </div>
          <button
            role="switch"
            aria-checked={autoApplyEnabled}
            onClick={() => setAutoApplyEnabled(!autoApplyEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoApplyEnabled ? 'bg-violet-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoApplyEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Saat aktif, sistem akan otomatis melamar ke lowongan baru yang ditemukan setiap kali scraper berjalan (06:00 &amp; 18:00 WIB).
        </p>

        {user.autoApplyLastRunAt && (
          <div className="mb-4 flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            Terakhir berjalan: {new Date(user.autoApplyLastRunAt).toLocaleString('id-ID')}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Resume yang digunakan
            </label>
            {resumes.length === 0 ? (
              <p className="text-sm text-amber-600">
                Belum ada resume. Buat resume di tab Resume terlebih dahulu.
              </p>
            ) : (
              <select
                value={autoApplyResumeId}
                onChange={(e) => setAutoApplyResumeId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="">-- Pilih Resume --</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}{r.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Maksimal lamaran per hari
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={autoApplyMaxDaily}
              onChange={(e) => setAutoApplyMaxDaily(Number(e.target.value))}
              className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="mt-1 text-xs text-gray-400">Maksimal 50 per hari untuk menghindari spam</p>
          </div>

          <button
            onClick={handleSaveAutoApply}
            disabled={savingAutoApply}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {savingAutoApply ? 'Menyimpan...' : 'Simpan Pengaturan Auto-Apply'}
          </button>
        </div>
      </div>

      {/* Profile section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">Profil</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nama Lengkap</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
            <input
              value={user.email}
              disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving || !name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>

      {/* Plan section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">Paket Berlangganan</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">{PLAN_LABELS[user.plan] ?? user.plan}</p>
            {user.planExpiresAt && (
              <p className="text-sm text-gray-500">
                Aktif hingga{' '}
                {new Date(user.planExpiresAt).toLocaleDateString('id-ID', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}
            {user.plan === 'free' && (
              <p className="text-sm text-gray-500">Upgrade untuk fitur lebih banyak</p>
            )}
          </div>
        </div>
      </div>

      {/* Chrome Extension section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-gray-900">Chrome Extension Token</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Generate token untuk Chrome Extension auto-apply. Paste token ini di popup extension.
        </p>
        {extensionToken ? (
          <div className="space-y-2">
            <input
              readOnly
              value={extensionToken}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono outline-none"
            />
            <p className="text-xs text-gray-400">Copy token ini, lalu paste di extension popup.</p>
          </div>
        ) : (
          <button
            onClick={handleGenerateToken}
            disabled={generatingToken}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {generatingToken ? 'Generating...' : 'Generate Token'}
          </button>
        )}
      </div>

      {/* Account section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">Akun</h2>
        </div>
        <p className="text-sm text-gray-500">
          Login melalui provider:{' '}
          <span className="font-medium text-gray-700">Email / OAuth</span>
        </p>
      </div>
    </div>
  )
}
