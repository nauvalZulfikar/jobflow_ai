import { auth } from '@/auth'
import { apiClient } from '@/lib/api-client'
import { NextResponse } from 'next/server'

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const res = await apiClient('/users/me/linkedin-cookie', session.user.id, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await apiClient('/users/me/linkedin-cookie', session.user.id, {
    method: 'DELETE',
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
