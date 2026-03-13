import { auth } from '@/auth'
import { Bell } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'

export async function Navbar({ mobileSidebar }: { mobileSidebar?: ReactNode }) {
  const session = await auth()

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex flex-1 items-center">
        {mobileSidebar}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? 'User'}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
              {session?.user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
          )}
          <span className="text-sm font-medium text-gray-700">{session?.user?.name}</span>
        </div>
      </div>
    </header>
  )
}
