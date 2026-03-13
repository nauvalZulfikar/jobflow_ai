import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { CoverLetterClient } from './cover-letter-client'

export const metadata = { title: 'Template Surat Lamaran' }

const VARIABLES = [
  { key: '{{nama_perusahaan}}', desc: 'Nama perusahaan yang dilamar' },
  { key: '{{posisi}}', desc: 'Nama posisi/jabatan' },
  { key: '{{nama_pengguna}}', desc: 'Nama lengkap kamu' },
  { key: '{{tanggal}}', desc: 'Tanggal hari ini' },
]

export default async function CoverLettersPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const templates = await prisma.coverLetterTemplate.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Template Surat Lamaran</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gunakan variabel dinamis yang akan diganti otomatis saat generate surat:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VARIABLES.map(({ key, desc }) => (
            <span
              key={key}
              title={desc}
              className="cursor-help rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {key}
            </span>
          ))}
        </div>
      </div>
      <CoverLetterClient initialTemplates={templates} />
    </div>
  )
}
