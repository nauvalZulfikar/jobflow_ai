import { MessageSquare, BookOpen, Mic, Star, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Persiapan Interview' }

const features = [
  {
    href: '/interview/mock',
    icon: Mic,
    title: 'Simulasi Interview',
    description: 'Latihan interview dengan AI sebagai pewawancara, dapat feedback langsung',
    color: 'bg-green-50 text-green-600',
    available: true,
  },
  {
    href: '/interview/company-research',
    icon: BookOpen,
    title: 'Riset Perusahaan',
    description: 'Dapatkan ringkasan mendalam tentang perusahaan target kamu dengan AI',
    color: 'bg-blue-50 text-blue-600',
    available: false,
  },
  {
    href: '/interview/questions',
    icon: MessageSquare,
    title: 'Bank Pertanyaan',
    description: 'Prediksi 10-15 pertanyaan interview berdasarkan job description',
    color: 'bg-purple-50 text-purple-600',
    available: false,
  },
  {
    href: '/interview/star-stories',
    icon: Star,
    title: 'Cerita STAR',
    description: 'Buat dan kelola cerita pengalaman dalam format STAR',
    color: 'bg-yellow-50 text-yellow-600',
    available: false,
  },
  {
    href: '/interview/salary',
    icon: TrendingUp,
    title: 'Patokan Gaji',
    description: 'Cek rentang gaji yang wajar berdasarkan posisi dan pengalaman',
    color: 'bg-red-50 text-red-600',
    available: false,
  },
]

export default function InterviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Persiapan Interview</h1>
        <p className="mt-1 text-gray-500">Persiapkan dirimu sebelum menghadapi wawancara</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ href, icon: Icon, title, description, color, available }) =>
          available ? (
            <Link
              key={href}
              href={href}
              className="group rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:border-blue-200 transition-all hover:shadow-md"
            >
              <div className={`mb-4 inline-flex rounded-xl p-3 ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                {title}
              </h3>
              <p className="mt-1.5 text-sm text-gray-500">{description}</p>
            </Link>
          ) : (
            <div
              key={href}
              className="relative rounded-xl bg-white p-6 shadow-sm border border-gray-100 opacity-60 cursor-not-allowed"
              aria-disabled="true"
            >
              <span className="absolute right-3 top-3 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Segera
              </span>
              <div className={`mb-4 inline-flex rounded-xl p-3 ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-gray-700">{title}</h3>
              <p className="mt-1.5 text-sm text-gray-400">{description}</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
