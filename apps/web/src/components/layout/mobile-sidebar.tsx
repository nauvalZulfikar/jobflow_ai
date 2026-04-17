'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Menu, X, Briefcase, LayoutDashboard, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const isActive = pathname.startsWith('/dashboard') || pathname.startsWith('/jobs') || pathname.startsWith('/resume')

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mr-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl transition-transform duration-300 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">JobFlow AI</span>
          </Link>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <LayoutDashboard className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-blue-600' : 'text-gray-400')} />
            Dashboard
          </Link>
        </nav>

        <div className="border-t border-gray-200 px-3 py-4 space-y-0.5">
          <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
            <Settings className="h-5 w-5 text-gray-400" />
            Pengaturan
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5 text-gray-400" />
            Keluar
          </button>
        </div>
      </div>
    </>
  )
}
