import { auth } from '@/auth'
import { apiClient } from '@/lib/api-client'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await apiClient(`/applications/${params.id}/auto-apply`, session.user.id, {
    method: 'POST',
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await apiClient(`/applications/${params.id}/auto-apply`, session.user.id, {
    method: 'DELETE',
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
