import { auth } from '@/auth'
import { apiClient } from '@/lib/api-client'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await apiClient('/teams/my', session.user.id)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
