'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { saveResumeRules } from './actions'

type Resume = {
  id: string
  title: string
  isDefault: boolean
  titleInclude: string[]
  titleExclude: string[]
}

function ChipInput({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')
  return (
    <div>
      <label className="text-xs font-medium text-gray-700">{label}</label>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-gray-300 bg-white p-2 min-h-[36px]">
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

export function RuleEditor({ resume }: { resume: Resume }) {
  const [include, setInclude] = useState<string[]>(resume.titleInclude)
  const [exclude, setExclude] = useState<string[]>(resume.titleExclude)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  function update(setter: (v: string[]) => void, val: string[]) {
    setter(val)
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await saveResumeRules(resume.id, include, exclude)
      if (res.success) {
        toast.success('Saved')
        setDirty(false)
      } else {
        toast.error(res.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-medium text-gray-900">{resume.title}</span>
          {resume.isDefault && <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Default</span>}
        </div>
        {dirty && (
          <button onClick={save} disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChipInput
          label="Use this resume if title contains"
          items={include}
          onChange={v => update(setInclude, v)}
          placeholder="data, analyst, ML"
        />
        <ChipInput
          label="Skip this resume if title contains"
          items={exclude}
          onChange={v => update(setExclude, v)}
          placeholder="senior, manager"
        />
      </div>
    </div>
  )
}
