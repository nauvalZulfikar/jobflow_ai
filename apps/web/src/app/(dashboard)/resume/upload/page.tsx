import { ResumeUploadClient } from '@/components/resume/resume-upload-client'

export const metadata = { title: 'Upload Resume' }

export default function UploadResumePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload Resume</h1>
        <p className="mt-1 text-gray-500">
          Upload file PDF atau DOCX — AI akan mengekstrak datamu secara otomatis
        </p>
      </div>
      <ResumeUploadClient />
    </div>
  )
}
