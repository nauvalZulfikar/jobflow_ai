'use client'

import type { ResumeContent } from '@jobflow/shared'

interface StepPersonalProps {
  data: ResumeContent['personalInfo']
  onChange: (updates: Partial<ResumeContent['personalInfo']>) => void
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition'

export function StepPersonal({ data, onChange }: StepPersonalProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Data Pribadi</h2>
        <p className="mt-0.5 text-sm text-gray-500">Informasi dasar yang akan muncul di header resume</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nama Depan" required>
          <input
            className={inputCls}
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="Budi"
          />
        </Field>
        <Field label="Nama Belakang" required>
          <input
            className={inputCls}
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Santoso"
          />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            className={inputCls}
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="budi@email.com"
          />
        </Field>
        <Field label="Nomor Telepon" required>
          <input
            type="tel"
            className={inputCls}
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+62 812 3456 7890"
          />
        </Field>
        <Field label="Lokasi" required>
          <input
            className={inputCls}
            value={data.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Jakarta, Indonesia"
          />
        </Field>
        <Field label="LinkedIn URL">
          <input
            type="url"
            className={inputCls}
            value={data.linkedinUrl ?? ''}
            onChange={(e) => onChange({ linkedinUrl: e.target.value })}
            placeholder="https://linkedin.com/in/budi"
          />
        </Field>
        <Field label="GitHub URL">
          <input
            type="url"
            className={inputCls}
            value={data.githubUrl ?? ''}
            onChange={(e) => onChange({ githubUrl: e.target.value })}
            placeholder="https://github.com/budi"
          />
        </Field>
        <Field label="Portfolio / Website">
          <input
            type="url"
            className={inputCls}
            value={data.portfolioUrl ?? ''}
            onChange={(e) => onChange({ portfolioUrl: e.target.value })}
            placeholder="https://budi.dev"
          />
        </Field>
      </div>

      <Field label="Ringkasan Profesional">
        <textarea
          className={`${inputCls} min-h-[100px] resize-y`}
          value={data.summary ?? ''}
          onChange={(e) => onChange({ summary: e.target.value })}
          placeholder="Tuliskan ringkasan singkat (2-3 kalimat) tentang pengalaman dan tujuan kariermu..."
          rows={4}
        />
        <p className="mt-1 text-xs text-gray-400">
          Tips: Sebutkan total pengalaman, keahlian utama, dan value yang kamu tawarkan.
        </p>
      </Field>
    </div>
  )
}
