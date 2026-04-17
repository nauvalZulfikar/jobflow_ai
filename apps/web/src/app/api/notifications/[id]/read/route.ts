import { auth } from '@/auth'
import { apiClient } from '@/lib/api-client'
import { NextResponse } from 'next/server'

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await apiClient(`/notifications/${params.id}/read`, session.user.id, { method: 'PATCH' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
