'use server'

import { auth } from '@/auth'
import { SignJWT } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'dev-secret'
)

export async function generateExtensionToken(): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'Tidak terautentikasi' }
  }

  try {
    const token = await new SignJWT({ id: session.user.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(JWT_SECRET)

    return { success: true, token }
  } catch {
    return { success: false, error: 'Gagal membuat token' }
  }
}
