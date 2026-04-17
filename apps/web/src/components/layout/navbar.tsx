import { auth } from '@/auth'
import { NavTabs } from './NavTabs'
import { UserMenu } from './UserMenu'
import { NotificationBell } from './NotificationBell'
import { Briefcase } from 'lucide-react'
import Link from 'next/link'

export async function Navbar() {
  const session = await auth()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Left: logo + nav */}
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <Briefcase className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900">JobFlow AI</span>
        </Link>
        <NavTabs />
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        <UserMenu
          name={session?.user?.name ?? null}
          image={session?.user?.image ?? null}
        />
      </div>
    </header>
  )
}
