'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, LogOut, ClipboardCheck, AlertTriangle, SlidersHorizontal } from 'lucide-react'
import { Briefcase } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">JobFlow AI</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname.startsWith('/dashboard') || pathname.startsWith('/jobs') || pathname.startsWith('/resume')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <LayoutDashboard className={cn('h-5 w-5 flex-shrink-0', pathname.startsWith('/dashboard') || pathname.startsWith('/jobs') || pathname.startsWith('/resume') ? 'text-blue-600' : 'text-gray-400')} />
          Dashboard
        </Link>
        <Link
          href="/applications/history"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname.startsWith('/applications') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <ClipboardCheck className={cn('h-5 w-5 flex-shrink-0', pathname.startsWith('/applications') ? 'text-blue-600' : 'text-gray-400')} />
          Applied Jobs
        </Link>
        <Link
          href="/failures"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname.startsWith('/failures') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <AlertTriangle className={cn('h-5 w-5 flex-shrink-0', pathname.startsWith('/failures') ? 'text-blue-600' : 'text-gray-400')} />
          Failures
        </Link>
        <Link
          href="/settings/auto-apply"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname.startsWith('/settings/auto-apply') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <SlidersHorizontal className={cn('h-5 w-5 flex-shrink-0', pathname.startsWith('/settings/auto-apply') ? 'text-blue-600' : 'text-gray-400')} />
          Auto-Apply Filters
        </Link>
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-3 py-4 space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname === '/settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <Settings className={cn('h-5 w-5 flex-shrink-0', pathname === '/settings' ? 'text-blue-600' : 'text-gray-400')} />
          Pengaturan
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5 flex-shrink-0 text-gray-400" />
          Keluar
        </button>
      </div>
    </aside>
  )
}
