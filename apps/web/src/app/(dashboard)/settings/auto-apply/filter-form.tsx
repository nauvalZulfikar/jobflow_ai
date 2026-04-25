'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { saveAutoApplyFilter } from './actions'

type Filter = {
  titleInclude: string[]
  titleExclude: string[]
  allowRemote: boolean
  countryWhitelist: string[]
  countryBlacklist: string[]
  jobTypesAllowed: string[]
  experienceAllowed: string[]
  salaryMin: number | null
  salaryCurrency: string
  skipIfSalaryRequired: boolean
  companyBlacklist: string[]
  maxPerDay: number
  maxPerCompanyPerWeek: number
  easyApplyOnly: boolean
  activeHourStart: number
  activeHourEnd: number
  activeDays: string[]
  skipIfCoverLetter: boolean
  skipIfEssay: boolean
}

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'temporary']
const EXP_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'director']
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function ChipInput({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-gray-300 bg-white p-2">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-800">
            {it}
            <button type="button" className="text-blue-600 hover:text-blue-900" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>×</button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[100px] border-0 p-0.5 text-sm outline-none"
          placeholder={placeholder || 'Type & Enter'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
              e.preventDefault()
              if (!items.includes(input.trim())) onChange([...items, input.trim()])
              setInput('')
            }
          }}
        />
      </div>
    </div>
  )
}

function CheckboxGroup({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(opt => {
          const on = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'}`}
              onClick={() => onChange(on ? selected.filter(o => o !== opt) : [...selected, opt])}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function FilterForm({ initialFilter }: { initialFilter: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [saving, setSaving] = useState(false)

  const update = (patch: Partial<Filter>) => setFilter(f => ({ ...f, ...patch }))

  async function save() {
    setSaving(true)
    try {
      const res = await saveAutoApplyFilter(filter)
      if (res.success) toast.success('Saved')
      else toast.error(res.error)
    } catch (err: any) {
      toast.error(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">📋 Job Title</h2>
        <ChipInput label="Title harus include (any of)" items={filter.titleInclude} onChange={v => update({ titleInclude: v })} placeholder="data, AI, ML" />
        <ChipInput label="Title harus exclude" items={filter.titleExclude} onChange={v => update({ titleExclude: v })} placeholder="intern, manager" />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">📍 Location</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter.allowRemote} onChange={e => update({ allowRemote: e.target.checked })} />
          Allow remote jobs
        </label>
        <ChipInput label="Country whitelist (kosong = semua)" items={filter.countryWhitelist} onChange={v => update({ countryWhitelist: v })} placeholder="Indonesia, Singapore" />
        <ChipInput label="Country blacklist" items={filter.countryBlacklist} onChange={v => update({ countryBlacklist: v })} placeholder="United States" />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">💼 Job Type & Experience</h2>
        <CheckboxGroup label="Job Types Allowed" options={JOB_TYPES} selected={filter.jobTypesAllowed} onChange={v => update({ jobTypesAllowed: v })} />
        <CheckboxGroup label="Experience Levels Allowed" options={EXP_LEVELS} selected={filter.experienceAllowed} onChange={v => update({ experienceAllowed: v })} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">💰 Salary</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700">Minimum salary (annual)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={filter.salaryMin ?? ''}
              onChange={e => update({ salaryMin: e.target.value ? Number(e.target.value) : null })}
              placeholder="50000000"
            />
          </div>
          <div className="w-28">
            <label className="text-sm font-medium text-gray-700">Currency</label>
            <select className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={filter.salaryCurrency} onChange={e => update({ salaryCurrency: e.target.value })}>
              <option>IDR</option><option>USD</option><option>EUR</option><option>SGD</option><option>GBP</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter.skipIfSalaryRequired} onChange={e => update({ skipIfSalaryRequired: e.target.checked })} />
          Skip job kalau salary expectation diminta tapi gak ada di profile
        </label>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">🚫 Company Blacklist</h2>
        <ChipInput label="Companies to skip" items={filter.companyBlacklist} onChange={v => update({ companyBlacklist: v })} placeholder="Acme Corp" />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">🚦 Limits</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Max per day</label>
            <input type="number" min={1} max={100} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={filter.maxPerDay} onChange={e => update({ maxPerDay: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Max per company / week</label>
            <input type="number" min={1} max={50} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={filter.maxPerCompanyPerWeek} onChange={e => update({ maxPerCompanyPerWeek: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">⚙️ Advanced</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter.easyApplyOnly} onChange={e => update({ easyApplyOnly: e.target.checked })} />
          LinkedIn Easy Apply only (skip jobs yang redirect ke external ATS)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter.skipIfCoverLetter} onChange={e => update({ skipIfCoverLetter: e.target.checked })} />
          Skip job kalau cover letter required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter.skipIfEssay} onChange={e => update({ skipIfEssay: e.target.checked })} />
          Skip job kalau ada essay/long-text question
        </label>

        <div>
          <label className="text-sm font-medium text-gray-700">Active hours (24h)</label>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <input type="number" min={0} max={23} className="w-16 rounded-md border border-gray-300 px-2 py-1" value={filter.activeHourStart} onChange={e => update({ activeHourStart: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} />
            <span>—</span>
            <input type="number" min={0} max={23} className="w-16 rounded-md border border-gray-300 px-2 py-1" value={filter.activeHourEnd} onChange={e => update({ activeHourEnd: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} />
          </div>
        </div>

        <CheckboxGroup label="Active days (kosong = semua hari)" options={DAYS} selected={filter.activeDays} onChange={v => update({ activeDays: v })} />
      </section>

      <div className="sticky bottom-0 border-t border-gray-200 bg-white py-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Filters'}
        </button>
      </div>
    </div>
  )
}
