import { auth } from '@/auth'
import { apiClient } from '@/lib/api-client'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: { id: string; userId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await apiClient(`/teams/${params.id}/members/${params.userId}`, session.user.id, {
    method: 'DELETE',
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
