'use client'

import { useState, useEffect } from 'react'
import { Search, X, Loader2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

interface ScrapeHistoryEntry {
  keywords: string[]
  location: string
  queued: number
  at: string
}

const SUGGESTED_KEYWORDS = [
  'software engineer',
  'frontend developer',
  'backend developer',
  'fullstack developer',
  'data analyst',
  'product manager',
]

const SOURCES = [
  { id: 'jobstreet', label: 'JobStreet' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'indeed', label: 'Indeed' },
]

const HISTORY_KEY = 'scraper-history'
const RECENT_KEYWORDS_KEY = 'scraper-recent-keywords'

function loadHistory(): ScrapeHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(entry: ScrapeHistoryEntry) {
  try {
    const prev = loadHistory()
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...prev].slice(0, 5)))
  } catch {}
}

export function ScraperTrigger() {
  const [open, setOpen] = useState(false)
  const [keywords, setKeywords] = useState<string[]>(['software engineer'])
  const [sources, setSources] = useState<string[]>(['jobstreet', 'linkedin', 'indeed'])
  const [location, setLocation] = useState('Jakarta')
  const [pages, setPages] = useState(3)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([])

  // Load recent keywords and history on mount
  useEffect(() => {
    try {
      const recent = JSON.parse(localStorage.getItem(RECENT_KEYWORDS_KEY) ?? '[]') as string[]
      if (recent.length > 0) setKeywords(recent.slice(0, 10))
    } catch {}
    setHistory(loadHistory())
  }, [])

  function addKeyword(kw: string) {
    const trimmed = kw.trim()
    if (trimmed && !keywords.includes(trimmed) && keywords.length < 10) {
      setKeywords([...keywords, trimmed])
    }
    setInput('')
  }

  function removeKeyword(kw: string) {
    setKeywords(keywords.filter((k) => k !== kw))
  }

  function toggleSource(id: string) {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  async function handleSubmit() {
    if (keywords.length === 0) return toast.error('Tambahkan minimal 1 keyword')
    if (sources.length === 0) return toast.error('Pilih minimal 1 sumber')

    setLoading(true)
    try {
      const res = await fetch('/api/jobs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, sources, location, pages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Gagal memulai scraping')
      toast.success(`${data.queued ?? 0} pekerjaan scraping ditambahkan ke antrian!`)
      // Save recent keywords
      try { localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(keywords)) } catch {}
      // Save history
      const entry: ScrapeHistoryEntry = { keywords, location, queued: data.queued ?? 0, at: new Date().toISOString() }
      saveHistory(entry)
      setHistory(loadHistory())
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Search className="h-4 w-4" />
        Cari Lowongan Baru
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Cari Lowongan Baru</h2>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Keywords */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Keyword <span className="text-gray-400">({keywords.length}/10)</span>
              </label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 p-2">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                  >
                    {kw}
                    <button onClick={() => removeKeyword(kw)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addKeyword(input)
                    }
                  }}
                  placeholder="Ketik + Enter..."
                  className="min-w-[120px] flex-1 border-none text-sm outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_KEYWORDS.filter((k) => !keywords.includes(k)).map((k) => (
                  <button
                    key={k}
                    onClick={() => addKeyword(k)}
                    className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600"
                  >
                    + {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Lokasi</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Pages */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Halaman per sumber ({pages})
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={pages}
                onChange={(e) => setPages(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            {/* Sources */}
            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Sumber</label>
              <div className="flex gap-3">
                {SOURCES.map(({ id, label }) => (
                  <label key={id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sources.includes(id)}
                      onChange={() => toggleSource(id)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Scraping history */}
            {history.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  Riwayat Pencarian
                </p>
                <div className="space-y-1.5">
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => { setKeywords(h.keywords); setLocation(h.location) }}
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    >
                      <p className="text-xs font-medium text-gray-700 truncate">{h.keywords.join(', ')}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {h.location} · {h.queued} jobs · {new Date(h.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? 'Memproses...' : 'Mulai Scraping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
