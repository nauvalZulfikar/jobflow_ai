import { SignJWT } from 'jose'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003'
const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'dev-secret'
)

async function makeJwt(userId: string): Promise<string> {
  return new SignJWT({ id: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1m')
    .sign(JWT_SECRET)
}

export async function apiClient(
  path: string,
  userId: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await makeJwt(userId)
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  })
}
