'use client'

import { useState } from 'react'
import { Loader2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

interface MatchScoreResult {
  score: number
  summary: string
  strengths: string[]
  gaps: string[]
  missingKeywords: string[]
}

interface Props {
  jobId: string
  resumeId?: string
  resumeTitle?: string
  applicationId?: string
}

const CIRCLE_RADIUS = 42
const CIRCLE_STROKE = 10
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444'

  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={CIRCLE_RADIUS} fill="none" stroke="#f3f4f6" strokeWidth={CIRCLE_STROKE} />
        <circle
          cx="50"
          cy="50"
          r={CIRCLE_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={CIRCLE_STROKE}
          strokeDasharray={`${(score / 100) * CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="text-center">
        <span className="text-3xl font-bold text-gray-900">{score}</span>
        <span className="block text-xs text-gray-400">/ 100</span>
      </div>
    </div>
  )
}

export function MatchScoreCard({ jobId, resumeId, resumeTitle, applicationId }: Props) {
  const [result, setResult] = useState<MatchScoreResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function analyze() {
    if (!resumeId) {
      toast.error('Upload resume terlebih dahulu di halaman Resume')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/ai/match-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, resumeId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Gagal menganalisis')
      }
      const data = await res.json()
      const scoreResult: MatchScoreResult = data.data ?? data
      setResult(scoreResult)

      // Simpan skor ke application jika ada
      if (applicationId) {
        fetch(`/api/applications/${applicationId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchScore: scoreResult.score }),
        }).catch(() => {})
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analisis gagal. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center">
        <Zap className="mx-auto mb-2 h-8 w-8 text-blue-500" />
        <p className="mb-1 text-sm font-medium text-gray-700">Analisis kecocokan dengan AI</p>
        {resumeId && resumeTitle && (
          <p className="mb-1 text-xs text-gray-500">Resume: <span className="font-medium text-gray-700">{resumeTitle}</span></p>
        )}
        {!resumeId && (
          <p className="mb-2 text-xs text-gray-400">Upload resume aktif terlebih dahulu</p>
        )}
        <button
          onClick={analyze}
          disabled={loading || !resumeId}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {loading ? 'Menganalisis...' : 'Analisis Sekarang'}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-900">Analisis Kecocokan AI</h3>

      <ScoreCircle score={result.score} />

      <p className="mt-4 text-center text-sm text-gray-600">{result.summary}</p>

      {result.strengths.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-green-600">
            Kelebihan
          </p>
          <ul className="space-y-1">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 text-green-500">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.gaps.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-500">
            Kekurangan
          </p>
          <ul className="space-y-1">
            {result.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 text-red-400">✗</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.missingKeywords.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Keyword yang Kurang
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.missingKeywords.map((kw) => (
              <span key={kw} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={analyze}
        disabled={loading}
        className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-xs text-gray-500 hover:bg-gray-50"
      >
        Analisis Ulang
      </button>
    </div>
  )
}
