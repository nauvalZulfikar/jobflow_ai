'use client'

import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { ResumeBuilderClient } from './resume-builder-client'
import type { ResumeContent } from '@jobflow/shared'

type UploadState = 'idle' | 'uploading' | 'parsed' | 'error'

export function ResumeUploadClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [parsedContent, setParsedContent] = useState<ResumeContent | null>(null)
  const [fileName, setFileName] = useState('')

  async function processFile(file: File) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.type)) {
      toast.error('Hanya file PDF atau DOCX yang diizinkan')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 10MB')
      return
    }

    setFileName(file.name)
    setState('uploading')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/resume/parse', { method: 'POST', body: formData })
      const json = await res.json() as {
        success: boolean
        data?: { content: ResumeContent }
        error?: { message: string }
      }

      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Gagal memproses resume')
        setState('error')
        return
      }

      setParsedContent(json.data!.content)
      setState('parsed')
      toast.success('Resume berhasil diproses!')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
      setState('error')
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // After parse → show the builder pre-filled
  if (state === 'parsed' && parsedContent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="h-5 w-5 flex-none" />
          <span>
            <strong>{fileName}</strong> berhasil diproses. Periksa dan lengkapi data di bawah.
          </span>
        </div>
        <ResumeBuilderClient
          initialContent={parsedContent}
          initialTitle={fileName.replace(/\.[^.]+$/, '')}
        />
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => state === 'idle' && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : state === 'error'
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        {state === 'uploading' ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-gray-700">Memproses resume dengan AI...</p>
            <p className="text-xs text-gray-400">Biasanya memakan waktu 10–20 detik</p>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-12 w-12 text-red-400" />
            <p className="text-sm font-medium text-red-600">Gagal memproses file</p>
            <button
              onClick={() => { setState('idle'); setFileName('') }}
              className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
              <Upload className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                Drag & drop file atau{' '}
                <span className="text-blue-600 underline underline-offset-2">pilih file</span>
              </p>
              <p className="mt-1 text-sm text-gray-400">PDF atau DOCX · Maks. 10MB</p>
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileChange}
        className="sr-only"
      />

      {/* Info */}
      <div className="mt-6 rounded-lg bg-blue-50 p-4">
        <div className="flex gap-3">
          <FileText className="mt-0.5 h-5 w-5 flex-none text-blue-500" />
          <div>
            <p className="text-sm font-medium text-blue-800">Cara kerja parser AI</p>
            <ul className="mt-1.5 space-y-1 text-xs text-blue-600">
              <li>1. Upload file PDF resume kamu</li>
              <li>2. AI mengekstrak data: nama, email, pengalaman, pendidikan, keahlian</li>
              <li>3. Kamu review dan lengkapi data yang belum terisi</li>
              <li>4. Simpan sebagai resume di JobFlow AI</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
