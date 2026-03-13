import type { FastifyInstance } from 'fastify'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { success, failure, MAX_FILE_SIZE_BYTES, ALLOWED_RESUME_MIME_TYPES } from '@jobflow/shared'
import crypto from 'crypto'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '',
  },
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? 'jobflow-docs'

export async function storageRoutes(app: FastifyInstance) {
  // POST /api/storage/upload — upload file
  app.post('/upload', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const data = await request.file()
      if (!data) return reply.status(400).send(failure('VALIDATION_ERROR', 'File wajib diunggah'))

      if (!ALLOWED_RESUME_MIME_TYPES.includes(data.mimetype)) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'Hanya PDF atau DOCX yang diizinkan'))
      }

      const buffer = await data.toBuffer()
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'Ukuran file maksimal 10MB'))
      }

      const ext = data.filename.split('.').pop() ?? 'pdf'
      const key = `users/${user.id}/resumes/${crypto.randomUUID()}.${ext}`

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: buffer,
          ContentType: data.mimetype,
          ContentLength: buffer.length,
        })
      )

      // Generate signed URL (1 hour)
      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
        expiresIn: 3600,
      })

      return reply.send(success({ key, url: signedUrl }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengunggah file'))
    }
  })

  // GET /api/storage/:key — get signed download URL
  app.get<{ Params: { '*': string } }>('/*', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const key = (request.params as Record<string, string>)['*'] ?? ''

      // Security: ensure user can only access their own files
      if (!key.startsWith(`users/${user.id}/`)) {
        return reply.status(403).send(failure('FORBIDDEN', 'Akses ditolak'))
      }

      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
        expiresIn: 3600,
      })

      return reply.send(success({ url: signedUrl }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil URL file'))
    }
  })

  // DELETE /api/storage/:key
  app.delete<{ Params: { '*': string } }>('/*', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const key = (request.params as Record<string, string>)['*'] ?? ''

      if (!key.startsWith(`users/${user.id}/`)) {
        return reply.status(403).send(failure('FORBIDDEN', 'Akses ditolak'))
      }

      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus file'))
    }
  })
}
