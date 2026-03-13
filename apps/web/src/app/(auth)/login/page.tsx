import { signIn } from '@/auth'
import { Github, Mail } from 'lucide-react'

export const metadata = { title: 'Masuk' }

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">JobFlow AI</h1>
          <p className="mt-2 text-gray-500">Platform otomasi lamaran kerja berbasis AI</p>
        </div>

        <div className="space-y-3">
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/dashboard' })
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Masuk dengan Google
            </button>
          </form>

          <form
            action={async () => {
              'use server'
              await signIn('github', { redirectTo: '/dashboard' })
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-gray-800"
            >
              <Github className="h-5 w-5" />
              Masuk dengan GitHub
            </button>
          </form>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-sm text-gray-400">atau</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <EmailSignInForm />

        <p className="mt-6 text-center text-xs text-gray-400">
          Dengan masuk, kamu menyetujui{' '}
          <a href="#" className="text-blue-600 hover:underline">
            Syarat & Ketentuan
          </a>{' '}
          dan{' '}
          <a href="#" className="text-blue-600 hover:underline">
            Kebijakan Privasi
          </a>
        </p>
      </div>
    </div>
  )
}

function EmailSignInForm() {
  return (
    <form
      action={async (formData: FormData) => {
        'use server'
        const email = formData.get('email') as string
        await signIn('resend', { email, redirectTo: '/dashboard' })
      }}
      className="space-y-3"
    >
      <input
        name="email"
        type="email"
        required
        placeholder="email@kamu.com"
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700"
      >
        <Mail className="h-4 w-4" />
        Kirim Magic Link
      </button>
    </form>
  )
}
