'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Overview', href: '/dashboard', param: 'overview' },
  { label: 'Lowongan', href: '/dashboard?tab=jobs', param: 'jobs' },
  { label: 'Lamaran', href: '/dashboard?tab=applications', param: 'applications' },
  { label: 'Resume', href: '/dashboard?tab=resume', param: 'resume' },
  { label: 'Pengaturan', href: '/settings', param: null },
]

export function NavTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'overview'

  function isActive(item: typeof TABS[0]) {
    if (item.param === null) return pathname === item.href
    if (pathname !== '/dashboard') return false
    return item.param === tab || (item.param === 'overview' && !searchParams.get('tab'))
  }

  return (
    <nav className="flex items-center gap-1">
      {TABS.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            isActive(item)
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
