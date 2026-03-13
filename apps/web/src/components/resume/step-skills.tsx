'use client'

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

const SKILL_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++',
  'React', 'Next.js', 'Vue.js', 'Angular', 'Svelte',
  'Node.js', 'Fastify', 'Express', 'NestJS',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'Git', 'CI/CD', 'GraphQL', 'REST API',
  'Tailwind CSS', 'Figma', 'Agile', 'Scrum',
]

interface StepSkillsProps {
  skills: string[]
  onChange: (skills: string[]) => void
}

export function StepSkills({ skills, onChange }: StepSkillsProps) {
  const [input, setInput] = useState('')

  const suggestions = SKILL_SUGGESTIONS.filter(
    (s) =>
      s.toLowerCase().includes(input.toLowerCase()) &&
      !skills.includes(s) &&
      input.length > 0
  ).slice(0, 6)

  function add(skill: string) {
    const trimmed = skill.trim()
    if (trimmed && !skills.includes(trimmed)) {
      onChange([...skills, trimmed])
    }
    setInput('')
  }

  function remove(skill: string) {
    onChange(skills.filter((s) => s !== skill))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && input === '' && skills.length > 0) {
      onChange(skills.slice(0, -1))
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Keahlian</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Ketik keahlian lalu tekan Enter atau koma untuk menambahkan
        </p>
      </div>

      {/* Tag input */}
      <div className="relative rounded-xl border border-gray-300 bg-white p-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
            >
              {skill}
              <button
                type="button"
                onClick={() => remove(skill)}
                className="rounded-full p-0.5 hover:bg-blue-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={skills.length === 0 ? 'Ketik keahlian, misal: React...' : ''}
            className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        {/* Autocomplete dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {skills.length} keahlian ditambahkan
      </p>

      {/* Quick-add suggestions */}
      {skills.length < 5 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">Saran populer:</p>
          <div className="flex flex-wrap gap-2">
            {SKILL_SUGGESTIONS.filter((s) => !skills.includes(s))
              .slice(0, 12)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  + {s}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
