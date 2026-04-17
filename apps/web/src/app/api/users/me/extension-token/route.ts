import { auth } from '@/auth'
import { apiClient } from '@/lib/api-client'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await apiClient('/users/me/extension-token', session.user.id, { method: 'POST' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
