'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check } from 'lucide-react'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  link: string | null
  createdAt: string
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchUnreadCount() {
    try {
      const res = await fetch('/api/notifications/unread-count')
      const data = await res.json()
      setUnread(data.data?.count ?? 0)
    } catch {}
  }

  async function openPanel() {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=10')
      const data = await res.json()
      setNotifications(data.data ?? [])
    } catch {} finally {
      setLoading(false)
    }
  }

  async function markAllRead() {
    try {
      await fetch('/api/notifications/read-all', { method: 'PATCH' })
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnread(0)
    } catch {}
  }

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n))
      setUnread((prev) => Math.max(0, prev - 1))
    } catch {}
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openPanel}
        className="relative rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        aria-label="Notifikasi"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl bg-white shadow-xl border border-gray-100">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900">Notifikasi</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Check className="h-3.5 w-3.5" />
                  Baca semua
                </button>
              )}
              <button onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}
              </div>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">Tidak ada notifikasi</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 ${!n.isRead ? 'bg-blue-50/50' : ''}`}
                >
                  {!n.isRead && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                  )}
                  <div className="flex-1 min-w-0" onClick={() => !n.isRead && markRead(n.id)}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate">{n.body}</p>
                      </Link>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-500">{n.body}</p>
                      </>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
