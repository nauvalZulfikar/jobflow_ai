import { Mail } from 'lucide-react'

export const metadata = { title: 'Cek Email Kamu' }

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <Mail className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Cek Email Kamu</h1>
        <p className="mt-2 text-gray-500">
          Kami sudah mengirimkan magic link ke email kamu. Klik link tersebut untuk masuk ke JobFlow AI.
        </p>
        <p className="mt-4 text-sm text-gray-400">Link akan kadaluarsa dalam 24 jam.</p>
      </div>
    </div>
  )
}
