# AGENTS.md — JobFlow AI Platform
> Instruksi lengkap untuk Agentic AI (Claude Code, Cursor, Copilot Workspace, dll.)
> Baca file ini secara penuh sebelum menulis satu baris kode pun.

---

## 🎯 MISI PROYEK

Bangun **JobFlow AI** — platform otomasi lamaran kerja berbasis web yang memungkinkan pengguna:
1. Menyimpan profil & resume mereka
2. Menemukan lowongan dari berbagai sumber
3. Mendapatkan resume yang disesuaikan otomatis dengan AI untuk setiap lowongan
4. Melamar dengan satu klik
5. Melacak semua lamaran dalam satu dashboard
6. Mempersiapkan wawancara dengan bantuan AI

---

## 🏗️ ARSITEKTUR SISTEM

```
jobflow-ai/
├── apps/
│   ├── web/                  # Frontend - Next.js 14 (App Router)
│   └── api/                  # Backend - Node.js + Express / Fastify
├── packages/
│   ├── db/                   # Prisma schema + migrations
│   ├── ai/                   # AI utilities (OpenAI/Claude wrappers)
│   └── shared/               # Types, constants, utils bersama
├── extensions/
│   └── chrome/               # Chrome Extension untuk auto-fill
├── docker-compose.yml
├── .env.example
└── AGENTS.md                 # File ini
```

**Tech Stack:**
| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Fastify, TypeScript |
| Database | PostgreSQL (via Prisma ORM) |
| Auth | NextAuth.js v5 (Google + GitHub OAuth + Email) |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Job Scraping | Puppeteer + Playwright |
| Email Parsing | Nylas API atau IMAP (nodemailer) |
| Queue | BullMQ + Redis |
| Storage | AWS S3 / Cloudflare R2 (untuk file resume) |
| Notifikasi | Resend (email) + web push |
| Browser Extension | Plasmo Framework (Chrome Extension) |
| Monorepo | Turborepo + pnpm workspaces |

---

## 📦 MODUL & FITUR LENGKAP

Bangun SEMUA modul berikut secara berurutan. Jangan lewati satupun.

---

### MODUL 1 — Profil Pengguna & Resume

**Tujuan:** Pengguna menyimpan semua data diri, resume, dan surat lamaran di satu tempat.

#### Fitur yang harus dibangun:

**1.1 Master Resume Builder**
- Form multi-step: Data Pribadi → Pengalaman Kerja → Pendidikan → Keahlian → Sertifikasi → Proyek
- Simpan beberapa versi resume (contoh: "Resume Backend", "Resume Full-Stack")
- Set satu versi sebagai "default"
- Setiap versi punya slug unik untuk digunakan saat apply

**1.2 Parser Resume (Upload PDF/Word)**
- Upload file `.pdf` atau `.docx`
- Ekstrak otomatis menggunakan AI: nama, email, phone, pengalaman, pendidikan, keahlian
- Preview hasil ekstraksi, minta konfirmasi pengguna sebelum simpan
- Endpoint: `POST /api/resume/parse`

**1.3 Inventaris Keahlian**
- CRUD keahlian dengan tag kategori (Bahasa Pemrograman, Framework, Tools, Soft Skills)
- Tingkat kemahiran: Pemula / Menengah / Mahir / Pakar
- Auto-suggest keahlian dari resume yang sudah diupload

**1.4 Template Surat Lamaran**
- CRUD template dengan variabel dinamis: `{{nama_perusahaan}}`, `{{posisi}}`, `{{nama_pengguna}}`, `{{tanggal}}`
- Editor teks kaya (rich text)
- Preview render dengan data nyata
- Tandai satu template sebagai default

**1.5 Portofolio & Contoh Kerja**
- Upload file atau tautan URL (GitHub, Behance, Dribbble, dll.)
- Tag per kategori pekerjaan (contoh: "untuk posisi frontend")
- Otomatis dilampirkan saat apply ke kategori yang sesuai

#### Database Schema (Prisma):
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  resumes       Resume[]
  coverLetters  CoverLetterTemplate[]
  skills        UserSkill[]
  portfolio     PortfolioItem[]
  applications  JobApplication[]
  createdAt     DateTime  @default(now())
}

model Resume {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  title       String   // contoh: "Resume Backend Engineer"
  isDefault   Boolean  @default(false)
  content     Json     // struktur: { personalInfo, experience[], education[], skills[], projects[] }
  rawText     String?  // plain text untuk AI matching
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model CoverLetterTemplate {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  title     String
  body      String   // bisa mengandung {{variabel}}
  isDefault Boolean  @default(false)
}

model UserSkill {
  id          String @id @default(cuid())
  userId      String
  user        User   @relation(fields: [userId], references: [id])
  name        String
  category    String // "programming", "framework", "tool", "soft"
  proficiency String // "beginner", "intermediate", "advanced", "expert"
}

model PortfolioItem {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  title       String
  url         String?
  fileUrl     String?
  categories  String[] // tag kategori pekerjaan
}
```

---

### MODUL 2 — Pencarian & Penemuan Lowongan

**Tujuan:** Agregasikan lowongan dari berbagai sumber ke dalam satu feed terpusat.

#### Fitur yang harus dibangun:

**2.1 Agregator Multi-Platform**
- Scraper untuk: LinkedIn, Indeed, Glassdoor, JobStreet, Kalibrr, Tech in Asia Jobs
- Gunakan Puppeteer/Playwright untuk scraping
- Jalankan scraper di background job (BullMQ)
- Jadwal scraping: setiap 2 jam untuk keyword aktif pengguna
- Endpoint: `POST /api/jobs/sync` (trigger manual)

**2.2 Filter Pencarian Cerdas**
- Filter: judul posisi, lokasi, rentang gaji, remote/hybrid/onsite, ukuran perusahaan, industri, tanggal posting
- Simpan kombinasi filter sebagai "Pencarian Tersimpan"
- Pagination dengan infinite scroll di frontend

**2.3 Deduplikasi Lowongan**
- Setelah scraping, jalankan algoritma deduplikasi berdasarkan: nama perusahaan + judul posisi + kota (fuzzy match)
- Gabungkan sumber yang sama, tampilkan semua link sumber asli
- Endpoint internal: `POST /api/jobs/deduplicate`

**2.4 Notifikasi Pencarian Tersimpan**
- Setiap pencarian tersimpan punya toggle notifikasi
- Kirim email via Resend jika ada lowongan baru yang cocok
- Kirim web push notification
- Frekuensi: realtime / harian / mingguan (pilihan pengguna)

**2.5 Daftar Pantau Perusahaan**
- Pengguna tambahkan perusahaan ke watchlist
- Sistem scrape halaman karir perusahaan tersebut secara berkala
- Notifikasi saat ada lowongan baru dari perusahaan tersebut

#### Database Schema:
```prisma
model Job {
  id              String   @id @default(cuid())
  externalId      String?  // ID dari sumber asli
  source          String   // "linkedin", "indeed", "jobstreet", dll.
  title           String
  company         String
  location        String?
  salaryMin       Int?
  salaryMax       Int?
  currency        String?  @default("IDR")
  isRemote        Boolean  @default(false)
  description     String   // full JD text
  requirements    String?
  applyUrl        String
  postedAt        DateTime?
  closingDate     DateTime?
  industry        String?
  companySize     String?
  duplicateOf     String?  // referensi ke job.id master jika duplikat
  applications    JobApplication[]
  createdAt       DateTime @default(now())
}

model SavedSearch {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String
  filters     Json     // { title, location, salary, remote, industry, ... }
  notifyEmail Boolean  @default(true)
  notifyPush  Boolean  @default(false)
  frequency   String   @default("realtime") // "realtime", "daily", "weekly"
  lastRunAt   DateTime?
}

model CompanyWatchlist {
  id          String @id @default(cuid())
  userId      String
  user        User   @relation(fields: [userId], references: [id])
  companyName String
  careerUrl   String?
  lastChecked DateTime?
}
```

---

### MODUL 3 — Pencocokan & Penyesuaian AI

**Tujuan:** Gunakan AI untuk menilai kecocokan resume dengan lowongan dan mengoptimalkan dokumen.

#### Fitur yang harus dibangun:

**3.1 Skor Kecocokan Resume–Lowongan**
- Kirim `resume.rawText` + `job.description` ke Claude API
- Dapatkan skor 0–100 beserta alasan singkat
- Tampilkan skor di card lowongan dan halaman detail
- Cache hasil scoring (jangan re-score jika tidak ada perubahan)
- Endpoint: `POST /api/ai/match-score`

**3.2 Analisis Celah Kata Kunci (ATS)**
- Ekstrak kata kunci penting dari JD (skill, tools, sertifikasi)
- Bandingkan dengan resume pengguna
- Tampilkan: kata kunci yang ada ✓ / yang hilang ✗
- Endpoint: `POST /api/ai/keyword-gap`

**3.3 Penyesuaian Resume Otomatis**
- Generate versi resume yang disesuaikan dengan JD tertentu
- Tulis ulang bullet point pengalaman agar relevan dengan bahasa JD
- Jangan ubah fakta — hanya framing dan urutan
- Simpan sebagai versi resume baru (jangan timpa yang asli)
- Endpoint: `POST /api/ai/tailor-resume`

**3.4 Generator Surat Lamaran**
- Input: resume + JD + template surat lamaran default
- Output: surat lamaran personal yang sudah diisi
- Pengguna bisa edit sebelum simpan/kirim
- Endpoint: `POST /api/ai/generate-cover-letter`

**3.5 Penjelasan Kecocokan Peran**
- Paragraf singkat (3–5 kalimat) kenapa pengguna cocok/tidak cocok
- Sertakan saran konkret untuk meningkatkan kecocokan
- Endpoint: `POST /api/ai/role-fit-explanation`

#### Implementasi AI (Claude API):
```typescript
// packages/ai/src/claude.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function matchScore(resumeText: string, jobDescription: string) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Kamu adalah sistem ATS (Applicant Tracking System) profesional.
      
Berikan skor kecocokan antara resume dan deskripsi pekerjaan berikut.

RESUME:
${resumeText}

DESKRIPSI PEKERJAAN:
${jobDescription}

Balas HANYA dalam format JSON:
{
  "score": <angka 0-100>,
  "summary": "<ringkasan 1 kalimat>",
  "strengths": ["<kelebihan 1>", "<kelebihan 2>"],
  "gaps": ["<kekurangan 1>", "<kekurangan 2>"],
  "missingKeywords": ["<kata kunci hilang>"]
}`
    }]
  });
  
  return JSON.parse(response.content[0].text);
}

export async function tailorResume(resumeJson: object, jobDescription: string) {
  // implementasi serupa — minta Claude rewrite bullet points
}

export async function generateCoverLetter(
  resumeJson: object, 
  jobDescription: string, 
  template: string
) {
  // implementasi cover letter generator
}
```

---

### MODUL 4 — Otomasi Lamaran

**Tujuan:** Isi formulir lamaran secara otomatis menggunakan data profil pengguna.

#### Fitur yang harus dibangun:

**4.1 Mesin Lamar Satu Klik (Server-side)**
- Untuk platform yang punya API publik (Greenhouse, Lever, Workable): gunakan API langsung
- Endpoint: `POST /api/applications/submit`
- Input: `{ jobId, resumeId, coverLetterId }`
- Output: status sukses/gagal + link konfirmasi

**4.2 Chrome Extension — Auto-fill**
- Bangun dengan Plasmo Framework
- Inject content script ke halaman lamaran kerja yang dikenali
- Tampilkan floating button "JobFlow: Isi Otomatis"
- Saat diklik: fetch profil pengguna dari API → map ke field formulir → isi otomatis
- Support platform: LinkedIn Easy Apply, Indeed, Glassdoor, Workday, Taleo, SuccessFactors

**4.3 Pemetaan Field Formulir (Form Field Mapper)**
- Gunakan heuristik: cek `name`, `id`, `placeholder`, `aria-label` dari input
- Buat mapping dictionary untuk field umum:
  ```
  ["first_name", "firstName", "fname"] → user.firstName
  ["email", "email_address"]           → user.email
  ["phone", "phone_number", "mobile"]  → user.phone
  ["cover_letter", "coverLetter"]      → generatedCoverLetter
  ```
- Fallback ke AI jika field tidak dikenali (kirim label field ke Claude untuk interpretasi)

**4.4 Antrian Lamar Massal (Batch Apply Queue)**
- Pengguna pilih beberapa lowongan → masukkan ke antrian
- Jalankan dengan BullMQ, max 10 lamaran per jam (rate limiting)
- Dashboard antrian: status tiap item (pending / processing / done / failed)
- Endpoint: `POST /api/applications/batch`

**4.5 Pembatas Laju (Rate Limiter)**
- Konfigurasi per platform: max N aplikasi per jam
- Tambahkan jeda acak antar submit (3–15 detik) untuk hindari deteksi bot
- Alert pengguna jika mendekati batas

---

### MODUL 5 — Pelacakan Lamaran

**Tujuan:** Satu dashboard untuk semua status lamaran kerja.

#### Fitur yang harus dibangun:

**5.1 Papan Kanban Lamaran**
- Kolom: Disimpan → Dilamar → Screening → Wawancara → Penawaran → Ditolak → Ditarik
- Drag-and-drop untuk pindah status (gunakan `@dnd-kit/core`)
- Klik card untuk lihat detail lengkap
- Filter & sort per kolom

**5.2 Deteksi Status Otomatis dari Email**
- Sambungkan Gmail/Outlook via OAuth
- Parse email masuk dengan keyword detection:
  - "kami regret" / "tidak melanjutkan" → status = Ditolak
  - "undangan wawancara" / "interview" → status = Wawancara
  - "selamat" / "offer letter" → status = Penawaran
- Tampilkan notifikasi in-app untuk setiap update otomatis
- Endpoint webhook: `POST /api/email/parse`

**5.3 Pengingat Tindak Lanjut**
- Setiap lamaran punya field "Tanggal Follow-up"
- Default: 7 hari setelah tanggal apply
- Kirim reminder via email + notifikasi in-app
- Template pesan follow-up yang bisa dikustomisasi

**5.4 Catatan & Log per Lamaran**
- Field: nama rekruter, nomor telepon rekruter, email rekruter
- Timeline log aktivitas (applied → email masuk → wawancara → dll.)
- Catatan bebas (markdown editor)
- Lampiran file (mis. hasil tes, kontrak)

**5.5 Pelacak Tenggat Waktu**
- Tampilkan badge merah jika closing date < 3 hari lagi
- Sort by urgency di halaman utama
- Kalender view untuk semua deadline & jadwal wawancara

#### Database Schema:
```prisma
model JobApplication {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  jobId           String
  job             Job       @relation(fields: [jobId], references: [id])
  resumeId        String?
  coverLetterId   String?
  status          String    @default("saved")
  // saved | applied | screening | interview | offer | rejected | withdrawn
  appliedAt       DateTime?
  followUpDate    DateTime?
  recruiterName   String?
  recruiterEmail  String?
  recruiterPhone  String?
  notes           String?   // markdown
  matchScore      Int?
  salary          Int?      // jika ada penawaran
  logs            ApplicationLog[]
  interviews      Interview[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model ApplicationLog {
  id            String          @id @default(cuid())
  applicationId String
  application   JobApplication  @relation(fields: [applicationId], references: [id])
  action        String          // "status_changed", "email_received", "note_added", dll.
  detail        String?
  createdAt     DateTime        @default(now())
}

model Interview {
  id            String          @id @default(cuid())
  applicationId String
  application   JobApplication  @relation(fields: [applicationId], references: [id])
  scheduledAt   DateTime
  type          String          // "phone", "video", "onsite", "technical"
  notes         String?
  outcome       String?         // "passed", "failed", "pending"
}
```

---

### MODUL 6 — Persiapan Wawancara

**Tujuan:** Bantu pengguna mempersiapkan diri sebelum wawancara.

#### Fitur yang harus dibangun:

**6.1 Ringkasan Riset Perusahaan**
- Input: nama perusahaan + URL karir
- Gunakan web search (atau scrape) untuk kumpulkan: profil perusahaan, berita terbaru, produk utama, tech stack, budaya kerja, review di Glassdoor
- Format output: dokumen terstruktur yang bisa diunduh sebagai PDF
- Endpoint: `POST /api/interview/company-brief`

**6.2 Generator Bank Pertanyaan**
- Analisis JD dengan Claude → prediksi 10–15 pertanyaan wawancara
- Kategorikan: Teknikal, Behavioral (STAR), Situasional, Culture Fit
- Untuk tiap pertanyaan: sertakan tips menjawab
- Endpoint: `POST /api/interview/question-bank`

**6.3 Wawancara Simulasi dengan AI**
- Mode teks: tanya–jawab giliran dengan AI sebagai pewawancara
- AI memberi feedback per jawaban: apa yang bagus, apa yang kurang, saran perbaikan
- Skor akhir + ringkasan performa
- Endpoint: `POST /api/interview/mock` (streaming response)

**6.4 Perpustakaan Cerita STAR**
- CRUD cerita pengalaman pengguna
- Tag kompetensi: Leadership, Problem Solving, Teamwork, Conflict Resolution, dll.
- AI bantu merapikan cerita ke format STAR (Situation, Task, Action, Result)
- Endpoint: `POST /api/interview/star-story`

**6.5 Patokan Gaji**
- Tampilkan rentang gaji berdasarkan: posisi + lokasi + pengalaman
- Data dari: Glassdoor API / LinkedIn Salary / patokan internal
- Kalkulasi: lower quartile, median, upper quartile
- Endpoint: `GET /api/salary/benchmark?title=&location=&experience=`

---

### MODUL 7 — Analitik & Wawasan

**Tujuan:** Tampilkan data performa pencarian kerja pengguna.

#### Fitur yang harus dibangun:

**7.1 Dashboard Analitik Funnel**
- Chart: jumlah lamaran per tahap (bar chart)
- Tingkat konversi: applied → screening → interview → offer
- Gunakan Recharts atau Chart.js

**7.2 Tingkat Respons per Sumber**
- Tabel: source (LinkedIn, Indeed, dll.) → total apply → total respons → response rate %
- Insight otomatis dari AI: "Platform terbaik untukmu adalah X karena..."

**7.3 A/B Testing Resume**
- Tandai 2 versi resume sebagai kandidat A/B
- Lacak: versi mana yang digunakan di lamaran mana
- Hitung response rate per versi resume
- Tampilkan pemenang setelah minimum 10 lamaran per versi

**7.4 Pelacak Kecepatan Lamaran**
- Target harian/mingguan yang bisa dikonfigurasi pengguna
- Progress bar: lamaran hari ini vs. target
- Streak tracker: berapa hari berturut-turut pengguna apply

**7.5 Analisis Pola Penolakan**
- Kumpulkan semua lamaran dengan status "Ditolak"
- Kelompokkan berdasarkan: industri, ukuran perusahaan, skor kecocokan saat apply
- Insight: "Kamu sering ditolak di perusahaan startup dengan skor kecocokan < 60"

---

### MODUL 8 — Infrastruktur Platform

**Tujuan:** Fondasi teknis yang aman, scalable, dan terintegrasi.

#### Fitur yang harus dibangun:

**8.1 Autentikasi & Manajemen Akun**
- NextAuth.js v5 dengan provider: Google, GitHub, Email Magic Link
- JWT + session management
- Profile settings: update data pribadi, ganti password, hapus akun
- Multi-device session dengan kemampuan revoke per device

**8.2 Enkripsi Data**
- Enkripsi field sensitif di database (email, phone, resume content) menggunakan `@prisma/client-extension-encryption`
- HTTPS only
- File upload disimpan di S3/R2 dengan signed URL (expired 1 jam)
- Jangan log data PII di server logs

**8.3 Hub Integrasi**
- OAuth connect untuk: Gmail, Outlook (email parsing)
- OAuth connect untuk: LinkedIn (untuk ambil profil awal)
- Webhook receiver untuk: Calendly (sync jadwal wawancara)
- Settings page: lihat semua integrasi aktif, disconnect kapan saja

**8.4 Penyimpanan Dokumen**
- Upload resume (PDF/DOCX) ke Cloudflare R2
- Versioning: setiap update resume simpan versi baru, bukan timpa
- Max size: 10MB per file
- Endpoint: `POST /api/storage/upload`, `GET /api/storage/:key`

**8.5 Sistem Notifikasi**
- Email via Resend: template HTML yang konsisten
- Web Push Notification: gunakan `web-push` library
- In-app notification center: bell icon dengan badge, daftar notifikasi dengan mark-as-read
- Preference center: pengguna pilih notifikasi mana yang ingin diterima

**8.6 Paket & Tagihan**
- Paket: Free (20 lamaran/bulan), Pro (unlimited), Tim (multi-user)
- Integrasi Stripe: subscription, upgrade/downgrade, invoice
- Middleware rate limiting berbasis paket
- Usage dashboard: berapa AI call tersisa bulan ini

---

## 🗂️ URUTAN PEMBANGUNAN (Build Order)

Bangun dalam urutan ini. JANGAN loncat modul.

```
Tahap 1 — Fondasi (Minggu 1–2)
  [x] Setup monorepo (Turborepo + pnpm)
  [x] Setup database PostgreSQL + Prisma schema lengkap
  [x] Autentikasi (NextAuth.js)
  [x] Layout dasar frontend (sidebar, navbar, routing)
  [x] Upload & storage file (S3/R2)

Tahap 2 — Profil & Resume (Minggu 2–3)
  [x] Resume Builder (form multi-step)
  [x] Parser Resume (PDF/DOCX → structured data)
  [x] Inventaris Keahlian
  [x] Template Surat Lamaran

Tahap 3 — Penemuan Lowongan (Minggu 3–4)
  [x] Scraper JobStreet + Indeed + LinkedIn
  [x] Feed lowongan + filter pencarian
  [x] Deduplikasi
  [ ] Notifikasi pencarian tersimpan

Tahap 4 — AI Matching (Minggu 4–5)
  [x] Skor kecocokan
  [x] Analisis keyword gap
  [x] Penyesuaian resume otomatis
  [x] Generator surat lamaran

Tahap 5 — Pelacakan (Minggu 5–6)
  [x] Kanban board lamaran
  [x] Catatan & log
  [x] Pengingat follow-up
  [ ] Parser email (Gmail OAuth)

Tahap 6 — Otomasi Lamaran (Minggu 6–8)
  [ ] Auto-apply server-side (Playwright per platform)
  [ ] AI jawab pertanyaan custom form
  [ ] Preview & konfirmasi sebelum submit
  [ ] Batch apply queue (BullMQ)
  [ ] Chrome Extension (Plasmo) — auto-fill

Tahap 7 — Wawancara & Analitik (Minggu 8–9)
  [x] Riset perusahaan otomatis
  [x] Bank pertanyaan + mock interview
  [ ] Dashboard analitik
  [ ] A/B testing resume

Tahap 8 — Billing & Polish (Minggu 9–10)
  [ ] Stripe integration
  [ ] Paket Free/Pro
  [ ] Rate limiting
  [ ] Error handling menyeluruh
  [ ] Testing (Vitest + Playwright E2E)
```

### Status Implementasi Saat Ini

| Fitur | Status | Catatan |
|-------|--------|---------|
| Resume Builder | ✅ Done | Multi-step form, versioning, default |
| Resume Parser (PDF) | ✅ Done | `pdf-parse` + GPT-4o-mini |
| Skill Inventory | ✅ Done | CRUD + kategori |
| Cover Letter Template | ✅ Done | CRUD + generate |
| Job Scraper (LinkedIn, Indeed, JobStreet) | ✅ Done | Playwright + BullMQ |
| Job Feed + Filter | ✅ Done | Pagination, filter |
| Deduplikasi | ✅ Done | `duplicateOf` field |
| AI Match Score | ✅ Done | GPT-4o-mini |
| AI Keyword Gap | ✅ Done | |
| AI Tailor Resume | ✅ Done | Simpan versi baru |
| AI Cover Letter Generator | ✅ Done | |
| AI Mock Interview (streaming) | ✅ Done | SSE |
| AI Question Bank | ✅ Done | |
| AI Company Research | ✅ Done | |
| AI Salary Benchmark | ✅ Done | |
| AI Role Fit | ✅ Done | |
| AI STAR Story | ✅ Done | |
| Kanban Application Board | ✅ Done | @dnd-kit |
| Application Log | ✅ Done | |
| Follow-up Reminder (cron) | ✅ Done | Hourly cron |
| Stripe Billing | ✅ Done | Free/Pro/Team |
| Notifikasi in-app | ✅ Done | |
| **Auto-apply (Playwright submit)** | ❌ Belum | **Next priority** |
| **AI jawab pertanyaan form** | ❌ Belum | Butuh `AutoApplySession` model |
| **Chrome Extension** | ❌ Belum | Plasmo belum setup |
| Parser email (Gmail OAuth) | ❌ Belum | |
| Dashboard analitik | ❌ Belum | |
| A/B Testing Resume | ❌ Belum | Model sudah ada |
| Notifikasi pencarian tersimpan | ❌ Belum | |

---

## 🤖 FITUR AUTO-APPLY — Rencana Implementasi

> Fitur ini adalah **next priority**. Implementasi dalam urutan berikut.

### Flow End-to-End

```
User klik "Auto Apply" pada job card
  → POST /api/applications/:id/auto-apply
    → Playwright detect form fields di job site (~5s)
    → AI generate jawaban untuk custom questions
    → Return { sessionId, fields, answers } ke browser
      → User preview/edit di modal
        → POST /api/applications/:id/auto-apply/confirm
          → Enqueue ke BullMQ 'auto-apply' queue
            → Playwright fill & submit form
              → Update status ke 'applied'
              → Notifikasi ke user
```

### DB Models yang Perlu Ditambahkan

```prisma
model AutoApplySession {
  id            String   @id @default(cuid())
  applicationId String   @unique
  application   JobApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  status        String   @default("detecting")
  // "detecting" | "pending_approval" | "approved" | "submitting" | "submitted" | "failed" | "skipped"
  detectedFields Json?   // array DetectedField
  answers       Json?    // array FormAnswer
  submittedAt   DateTime?
  failureReason String?  @db.Text
  screenshotUrl String?
  siteUrl       String
  source        String   // "linkedin" | "indeed" | "jobstreet"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AutoApplyLog {
  id        String   @id @default(cuid())
  sessionId String
  session   AutoApplySession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  level     String   // "info" | "warn" | "error"
  step      String   // "detect" | "fill" | "submit" | "screenshot"
  message   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
}
```

### File yang Perlu Dibuat

```
packages/ai/src/form-answer.ts                         # generateFormAnswers()
packages/ai/src/index.ts                               # export form-answer

apps/scraper/src/appliers/base.applier.ts              # abstract BaseApplier
apps/scraper/src/appliers/indeed.applier.ts            # Indeed Easy Apply
apps/scraper/src/appliers/jobstreet.applier.ts         # JobStreet apply
apps/scraper/src/appliers/linkedin.applier.ts          # LinkedIn Easy Apply (auth-gated)
apps/scraper/src/queues/auto-apply-queue.ts            # BullMQ queue definition
apps/scraper/src/workers/auto-apply.worker.ts          # BullMQ worker
apps/scraper/src/worker.ts                             # MODIFY: start autoApplyWorker

apps/api/src/plugins/auto-apply-queue.ts               # Queue client untuk API
apps/api/src/routes/auto-apply.ts                      # 4 routes: trigger, confirm, status, cancel
apps/api/src/server.ts                                 # MODIFY: register autoApplyRoutes
```

### Platform Priority

| Platform | Priority | Alasan |
|----------|----------|--------|
| Indeed | 1st | Form paling konsisten, no auth required |
| JobStreet | 2nd | Scraper sudah ada, `data-automation` attrs stabil |
| LinkedIn | 3rd | Butuh session cookie dari `UserIntegration` |

---

## 🔧 RENCANA IMPROVEMENT — OTOMASI PENDAFTARAN

> Bagian ini menjabarkan secara teknis bagaimana fitur auto-apply dibangun dari nol.
> Implementasi dilakukan bertahap (Phase 1 → 4). Jangan loncat phase.

---

### Phase 1 — DB Schema + Types + AI Function

#### 1A. Tambah model ke `packages/db/prisma/schema.prisma`

```prisma
model AutoApplySession {
  id            String   @id @default(cuid())
  applicationId String   @unique
  application   JobApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  // Status lifecycle
  status        String   @default("detecting")
  // "detecting" | "pending_approval" | "approved" | "submitting" | "submitted" | "failed" | "skipped"

  // Hasil deteksi form dari Playwright
  detectedFields Json?
  // Array of DetectedField: { name, label, type, required, options?, maxLength? }

  // Jawaban AI + editan user
  answers       Json?
  // Array of FormAnswer: { fieldName, label, value, aiGenerated, editedByUser }

  // Hasil eksekusi
  submittedAt   DateTime?
  failureReason String?  @db.Text
  screenshotUrl String?  // R2 URL screenshot sukses

  // Metadata
  siteUrl       String
  source        String   // "linkedin" | "indeed" | "jobstreet"

  logs          AutoApplyLog[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AutoApplyLog {
  id        String   @id @default(cuid())
  sessionId String
  session   AutoApplySession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  level     String   // "info" | "warn" | "error"
  step      String   // "detect" | "fill" | "submit" | "screenshot"
  message   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
}
```

Tambahkan juga relasi di `JobApplication`:
```prisma
autoApplySession AutoApplySession?
```

Jalankan setelah edit schema:
```bash
pnpm db:migrate --name auto_apply
```

#### 1B. Tambah shared types di `packages/shared/src/types/index.ts`

```typescript
export type FormFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'file'

export type DetectedField = {
  name: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]   // untuk select/radio
  maxLength?: number
}

export type FormAnswer = {
  fieldName: string
  label: string
  value: string
  aiGenerated: boolean
  editedByUser?: boolean
}

export type AutoApplyStatus =
  | 'detecting'
  | 'pending_approval'
  | 'approved'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'skipped'

// Tambahkan 'auto_applying' ke ApplicationStatus
export type ApplicationStatus =
  | 'saved'
  | 'auto_applying'   // transient: sedang diproses auto-apply
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export type AutoApplyJobData = {
  sessionId: string
  applicationId: string
  userId: string
  jobId: string
  siteUrl: string
  source: 'linkedin' | 'indeed' | 'jobstreet'
  answers: FormAnswer[]
  resumeFileUrl?: string
}
```

#### 1C. Buat `packages/ai/src/form-answer.ts`

```typescript
import { openai, AI_MODEL } from './client.js'
import type { ResumeContent } from '@jobflow/shared'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

// Field yang diisi dari profil, bukan AI
const STANDARD_FIELD_PATTERNS = [
  { patterns: ['first_name', 'firstname', 'fname', 'given_name'], key: 'firstName' },
  { patterns: ['last_name', 'lastname', 'lname', 'family_name', 'surname'], key: 'lastName' },
  { patterns: ['email', 'email_address', 'emailaddress'], key: 'email' },
  { patterns: ['phone', 'phone_number', 'mobile', 'telephone', 'hp'], key: 'phone' },
  { patterns: ['city', 'kota', 'domisili'], key: 'city' },
  { patterns: ['address', 'alamat'], key: 'address' },
]

function matchStandardField(field: DetectedField, resumeContent: ResumeContent): string | null {
  const normalizedName = field.name.toLowerCase().replace(/[-\s]/g, '_')
  const normalizedLabel = field.label.toLowerCase().replace(/[-\s]/g, '_')
  const personal = resumeContent.personalInfo as Record<string, string>

  for (const { patterns, key } of STANDARD_FIELD_PATTERNS) {
    if (patterns.some(p => normalizedName.includes(p) || normalizedLabel.includes(p))) {
      return personal[key] ?? null
    }
  }
  return null
}

export async function generateFormAnswers(
  resumeContent: ResumeContent,
  jobDescription: string,
  fields: DetectedField[],
  siteLanguage: 'id' | 'en' = 'id'
): Promise<FormAnswer[]> {
  const results: FormAnswer[] = []
  const customFields: DetectedField[] = []

  // Pisahkan: field standar diisi langsung, custom fields dikirim ke AI
  for (const field of fields) {
    if (field.type === 'file') continue // file upload ditangani terpisah

    const standardValue = matchStandardField(field, resumeContent)
    if (standardValue) {
      results.push({ fieldName: field.name, label: field.label, value: standardValue, aiGenerated: false })
    } else {
      customFields.push(field)
    }
  }

  if (customFields.length === 0) return results

  // Satu batch call ke AI untuk semua custom fields
  const lang = siteLanguage === 'id' ? 'Bahasa Indonesia' : 'English'
  const fieldList = customFields.map((f, i) => {
    const optionsNote = f.options?.length ? `\n   Pilihan yang tersedia: ${f.options.join(' | ')}` : ''
    const maxNote = f.maxLength ? `\n   Maksimal ${f.maxLength} karakter` : ''
    return `${i + 1}. fieldName: "${f.name}"\n   Label: "${f.label}"\n   Tipe: ${f.type}${optionsNote}${maxNote}`
  }).join('\n\n')

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu mengisi formulir lamaran kerja secara otomatis.
Jawab dalam ${lang}. Jawaban harus jujur berdasarkan resume yang diberikan.
Untuk field select/radio: pilih SATU dari opsi yang tersedia, persis sama tulisannya.
Untuk field number (tahun pengalaman): hitung dari data resume.
Kembalikan JSON: { "answers": [{ "fieldName": "...", "value": "..." }] }`
      },
      {
        role: 'user',
        content: `RESUME:\n${JSON.stringify(resumeContent, null, 2)}\n\nDESKRIPSI PEKERJAAN:\n${jobDescription}\n\nFIELD YANG PERLU DIISI:\n${fieldList}`
      }
    ]
  })

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{"answers":[]}')
  for (const ans of parsed.answers ?? []) {
    const field = customFields.find(f => f.name === ans.fieldName)
    if (field && ans.value) {
      results.push({ fieldName: ans.fieldName, label: field.label, value: String(ans.value), aiGenerated: true })
    }
  }

  return results
}
```

Tambahkan export di `packages/ai/src/index.ts`:
```typescript
export { generateFormAnswers } from './form-answer.js'
export type { DetectedField, FormAnswer } from '@jobflow/shared'
```

---

### Phase 2 — Playwright Appliers (Scraper App)

#### 2A. Refactor `apps/scraper/src/scrapers/base.scraper.ts`

Ekstrak shared browser logic ke `apps/scraper/src/browser/browser-base.ts`:

```typescript
// apps/scraper/src/browser/browser-base.ts
import { chromium, Browser, Page } from 'playwright'

export class BrowserBase {
  protected browser: Browser | null = null

  async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    })
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) { await this.browser.close(); this.browser = null }
  }

  protected async newStealthPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not launched')
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'id-ID',
      viewport: { width: 1366, height: 768 },
      geolocation: { latitude: -6.2088, longitude: 106.8456 },
      permissions: ['geolocation'],
    })
    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
      // @ts-ignore
      window.chrome = { runtime: {} }
    })
    return page
  }

  protected randomDelay(min = 2000, max = 5000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min))
  }
}
```

Update `base.scraper.ts` untuk extend `BrowserBase` (hapus duplikasi method).

#### 2B. Buat `apps/scraper/src/appliers/base.applier.ts`

```typescript
import { BrowserBase } from '../browser/browser-base.js'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

export abstract class BaseApplier extends BrowserBase {
  abstract source: string

  // Phase 1: deteksi field tanpa submit — dipanggil sync dari API
  abstract detectFields(applyUrl: string): Promise<DetectedField[]>

  // Phase 2: isi dan submit form — dipanggil dari BullMQ worker
  abstract apply(
    applyUrl: string,
    answers: FormAnswer[],
    resumeFileUrl?: string
  ): Promise<{ success: boolean; screenshotUrl?: string; errorMessage?: string }>

  // Helper: isi satu input field
  protected async fillField(page: import('playwright').Page, selector: string, value: string): Promise<void> {
    const el = page.locator(selector).first()
    await el.waitFor({ timeout: 3000 }).catch(() => {})
    const tagName = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => 'input')
    if (tagName === 'select') {
      await el.selectOption(value)
    } else {
      await el.fill(value)
    }
    await this.randomDelay(200, 600)
  }

  // Helper: deteksi auth wall (redirect ke halaman login)
  protected async isAuthWall(page: import('playwright').Page, expectedHost: string): Promise<boolean> {
    const url = page.url()
    return !url.includes(expectedHost) && (url.includes('login') || url.includes('signin') || url.includes('auth'))
  }

  // Helper: screenshot ke buffer untuk upload ke R2
  protected async takeScreenshot(page: import('playwright').Page): Promise<Buffer> {
    return page.screenshot({ type: 'png', fullPage: false })
  }
}
```

#### 2C. Buat `apps/scraper/src/appliers/indeed.applier.ts`

Indeed diprioritaskan pertama karena:
- Form "Easy Apply" konsisten dengan `data-testid` yang stabil
- Tidak butuh login untuk banyak listing
- Multi-step wizard yang bisa dinagivasi dengan klik "Continue"

```typescript
import { BaseApplier } from './base.applier.js'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

export class IndeedApplier extends BaseApplier {
  source = 'indeed'

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    await this.launchBrowser()
    const page = await this.newStealthPage()
    const fields: DetectedField[] = []

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // Klik tombol "Apply now" jika ada
      const applyBtn = page.locator('[data-testid="apply-button"], .jobsearch-IndeedApplyButton-newDesign, [aria-label*="Apply"]').first()
      if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await applyBtn.click()
        await page.waitForTimeout(2000)
      }

      // Cek auth wall
      if (await this.isAuthWall(page, 'indeed.com')) {
        throw new Error('requires_auth')
      }

      // Deteksi semua input dalam form
      const inputs = await page.locator('input:visible, select:visible, textarea:visible').all()
      for (const input of inputs) {
        const name = await input.getAttribute('name') ?? ''
        const id = await input.getAttribute('id') ?? ''
        const placeholder = await input.getAttribute('placeholder') ?? ''
        const ariaLabel = await input.getAttribute('aria-label') ?? ''
        const type = await input.getAttribute('type') ?? 'text'

        // Ambil label dari elemen <label> yang berelasi
        let label = ariaLabel || placeholder
        if (!label && id) {
          const labelEl = page.locator(`label[for="${id}"]`).first()
          label = await labelEl.textContent().catch(() => '') ?? ''
        }
        label = label.trim()
        if (!label && !name) continue

        const field: DetectedField = {
          name: name || id || label.toLowerCase().replace(/\s+/g, '_'),
          label: label || name,
          type: type === 'tel' ? 'text' : type as DetectedField['type'],
          required: await input.getAttribute('required') !== null,
        }

        // Untuk select: ambil semua options
        if (await input.evaluate(el => el.tagName) === 'SELECT') {
          field.type = 'select'
          field.options = await input.locator('option').allTextContents()
        }

        const maxLength = await input.getAttribute('maxlength')
        if (maxLength) field.maxLength = parseInt(maxLength)

        fields.push(field)
      }
    } finally {
      await this.closeBrowser()
    }

    return fields
  }

  async apply(applyUrl: string, answers: FormAnswer[], resumeFileUrl?: string): Promise<{ success: boolean; screenshotUrl?: string; errorMessage?: string }> {
    await this.launchBrowser()
    const page = await this.newStealthPage()

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      const applyBtn = page.locator('[data-testid="apply-button"]').first()
      if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await applyBtn.click()
        await page.waitForTimeout(2000)
      }

      if (await this.isAuthWall(page, 'indeed.com')) {
        return { success: false, errorMessage: 'requires_auth' }
      }

      // Upload resume jika ada file input
      if (resumeFileUrl) {
        const fileInput = page.locator('input[type="file"]').first()
        if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Download file ke /tmp lalu set input
          const { execSync } = await import('child_process')
          const tmpPath = `/tmp/resume_${Date.now()}.pdf`
          execSync(`curl -s -o "${tmpPath}" "${resumeFileUrl}"`)
          await fileInput.setInputFiles(tmpPath)
          await this.randomDelay(1000, 2000)
        }
      }

      // Isi semua field berdasarkan answers
      for (const answer of answers) {
        const selector = `[name="${answer.fieldName}"], #${answer.fieldName}`
        await this.fillField(page, selector, answer.value).catch(() => {})
        await this.randomDelay(300, 800)
      }

      // Navigasi multi-step: klik Continue sampai tombol Submit muncul
      let maxSteps = 5
      while (maxSteps-- > 0) {
        const continueBtn = page.locator('[data-testid="IndeedApplyButton"], button:has-text("Continue"), button:has-text("Lanjutkan")').first()
        const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Kirim")').first()

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(3000)
          break
        }
        if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await continueBtn.click()
          await page.waitForTimeout(2000)
        } else {
          break
        }
      }

      const screenshot = await this.takeScreenshot(page)
      return { success: true, screenshotUrl: `screenshot_${Date.now()}.png` } // URL diisi setelah upload ke R2
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }
}
```

#### 2D. Buat `apps/scraper/src/appliers/jobstreet.applier.ts`

```typescript
import { BaseApplier } from './base.applier.js'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

export class JobStreetApplier extends BaseApplier {
  source = 'jobstreet'

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    await this.launchBrowser()
    const page = await this.newStealthPage()
    const fields: DetectedField[] = []

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // Deteksi external ATS redirect (keluar dari domain jobstreet.co.id)
      if (!page.url().includes('jobstreet.co.id')) {
        throw new Error('external_ats')
      }

      // JobStreet pakai data-automation attributes yang stabil
      const inputs = await page.locator('[data-automation], input:visible, textarea:visible, select:visible').all()
      for (const input of inputs) {
        const automation = await input.getAttribute('data-automation') ?? ''
        const name = await input.getAttribute('name') ?? automation
        const label = await page.locator(`label[for="${await input.getAttribute('id')}"]`).textContent().catch(() => name)

        if (!name) continue

        fields.push({
          name,
          label: label?.trim() || name,
          type: (await input.getAttribute('type') ?? 'text') as DetectedField['type'],
          required: await input.getAttribute('required') !== null,
        })
      }
    } finally {
      await this.closeBrowser()
    }

    return fields
  }

  async apply(applyUrl: string, answers: FormAnswer[], resumeFileUrl?: string): Promise<{ success: boolean; screenshotUrl?: string; errorMessage?: string }> {
    await this.launchBrowser()
    const page = await this.newStealthPage()

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      if (!page.url().includes('jobstreet.co.id')) {
        return { success: false, errorMessage: 'external_ats' }
      }

      for (const answer of answers) {
        await this.fillField(page, `[name="${answer.fieldName}"], [data-automation="${answer.fieldName}"]`, answer.value).catch(() => {})
        await this.randomDelay(300, 700)
      }

      const submitBtn = page.locator('button[type="submit"], button:has-text("Apply"), button:has-text("Lamar")').first()
      await submitBtn.click()
      await page.waitForTimeout(3000)

      const screenshot = await this.takeScreenshot(page)
      return { success: true }
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }
}
```

#### 2E. Buat `apps/scraper/src/appliers/linkedin.applier.ts`

LinkedIn butuh session cookie dari `UserIntegration`. Tanpa itu, return `requires_auth`.

```typescript
import { BaseApplier } from './base.applier.js'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

export class LinkedInApplier extends BaseApplier {
  source = 'linkedin'
  private linkedInCookie?: string

  constructor(linkedInCookie?: string) {
    super()
    this.linkedInCookie = linkedInCookie
  }

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    if (!this.linkedInCookie) throw new Error('requires_auth')

    await this.launchBrowser()
    const page = await this.newStealthPage()
    const fields: DetectedField[] = []

    try {
      // Set cookie sesi LinkedIn
      await page.context().addCookies([{ name: 'li_at', value: this.linkedInCookie, domain: '.linkedin.com', path: '/' }])
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      if (await this.isAuthWall(page, 'linkedin.com')) throw new Error('requires_auth')

      // Klik Easy Apply button
      const easyApplyBtn = page.locator('button:has-text("Easy Apply"), .jobs-apply-button').first()
      if (await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await easyApplyBtn.click()
        await page.waitForTimeout(2000)
      }

      // Form ada di dalam modal
      const modal = page.locator('.jobs-easy-apply-modal, [role="dialog"]').first()
      const inputs = await modal.locator('input:visible, select:visible, textarea:visible').all()

      for (const input of inputs) {
        const id = await input.getAttribute('id') ?? ''
        const name = await input.getAttribute('name') ?? id
        const label = await page.locator(`label[for="${id}"]`).textContent().catch(() => '') ?? name
        if (!name) continue

        fields.push({
          name,
          label: label.trim() || name,
          type: (await input.getAttribute('type') ?? 'text') as DetectedField['type'],
          required: await input.getAttribute('required') !== null,
        })
      }
    } finally {
      await this.closeBrowser()
    }

    return fields
  }

  async apply(applyUrl: string, answers: FormAnswer[], resumeFileUrl?: string): Promise<{ success: boolean; screenshotUrl?: string; errorMessage?: string }> {
    if (!this.linkedInCookie) return { success: false, errorMessage: 'requires_auth' }

    await this.launchBrowser()
    const page = await this.newStealthPage()

    try {
      await page.context().addCookies([{ name: 'li_at', value: this.linkedInCookie, domain: '.linkedin.com', path: '/' }])
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      if (await this.isAuthWall(page, 'linkedin.com')) return { success: false, errorMessage: 'requires_auth' }

      const easyApplyBtn = page.locator('button:has-text("Easy Apply")').first()
      await easyApplyBtn.click()
      await page.waitForTimeout(2000)

      const modal = page.locator('[role="dialog"]').first()

      for (const answer of answers) {
        await this.fillField(modal.locator(`[name="${answer.fieldName}"], #${answer.fieldName}`).first() as any, '', answer.value).catch(() => {})
        await this.randomDelay(300, 700)
      }

      // Multi-step: klik Next sampai Submit
      let maxSteps = 6
      while (maxSteps-- > 0) {
        const nextBtn = modal.locator('button:has-text("Next"), button:has-text("Review")').first()
        const submitBtn = modal.locator('button:has-text("Submit application")').first()

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(3000)
          break
        }
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click()
          await page.waitForTimeout(1500)
        } else break
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }
}
```

---

### Phase 3 — BullMQ Queue + Worker (Scraper App)

#### 3A. Buat `apps/scraper/src/queues/auto-apply-queue.ts`

```typescript
import { Queue } from 'bullmq'
import { createRedisConnection } from '../queues/index.js'
import type { AutoApplyJobData } from '@jobflow/shared'

export const AUTO_APPLY_QUEUE_NAME = 'auto-apply'

export const autoApplyQueue = new Queue<AutoApplyJobData>(AUTO_APPLY_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})
```

#### 3B. Buat `apps/scraper/src/workers/auto-apply.worker.ts`

```typescript
import { Worker } from 'bullmq'
import { createRedisConnection } from '../queues/index.js'
import { AUTO_APPLY_QUEUE_NAME } from '../queues/auto-apply-queue.js'
import { IndeedApplier } from '../appliers/indeed.applier.js'
import { JobStreetApplier } from '../appliers/jobstreet.applier.js'
import { LinkedInApplier } from '../appliers/linkedin.applier.js'
import { prisma } from '@jobflow/db'
import type { AutoApplyJobData } from '@jobflow/shared'

export function startAutoApplyWorker() {
  const worker = new Worker<AutoApplyJobData>(
    AUTO_APPLY_QUEUE_NAME,
    async (job) => {
      const { sessionId, applicationId, source, siteUrl, answers, resumeFileUrl, userId } = job.data

      // 1. Update status ke 'submitting'
      await prisma.autoApplySession.update({ where: { id: sessionId }, data: { status: 'submitting' } })
      await prisma.autoApplyLog.create({ data: { sessionId, level: 'info', step: 'submit', message: `Starting ${source} submit` } })

      // 2. Pilih applier sesuai source
      let applier
      if (source === 'indeed') {
        applier = new IndeedApplier()
      } else if (source === 'jobstreet') {
        applier = new JobStreetApplier()
      } else if (source === 'linkedin') {
        const integration = await prisma.userIntegration.findFirst({ where: { userId, provider: 'linkedin' } })
        applier = new LinkedInApplier(integration?.accessToken)
      } else {
        throw new Error(`Unsupported source: ${source}`)
      }

      // 3. Eksekusi apply
      const result = await applier.apply(siteUrl, answers, resumeFileUrl)

      // 4. Update session & application berdasarkan hasil
      if (result.success) {
        await prisma.autoApplySession.update({
          where: { id: sessionId },
          data: { status: 'submitted', submittedAt: new Date(), screenshotUrl: result.screenshotUrl },
        })
        await prisma.jobApplication.update({
          where: { id: applicationId },
          data: { status: 'applied', appliedAt: new Date() },
        })
        await prisma.applicationLog.create({
          data: { applicationId, action: 'status_changed', detail: 'Auto-applied successfully via JobFlow' },
        })
        await prisma.notification.create({
          data: { userId, type: 'status_update', title: 'Lamaran Berhasil Dikirim', body: 'Auto-apply selesai. Cek dashboard untuk detail.', link: `/applications/${applicationId}` },
        })
      } else {
        await prisma.autoApplySession.update({
          where: { id: sessionId },
          data: { status: 'failed', failureReason: result.errorMessage },
        })
        await prisma.jobApplication.update({ where: { id: applicationId }, data: { status: 'saved' } })
        await prisma.notification.create({
          data: { userId, type: 'status_update', title: 'Auto-apply Gagal', body: result.errorMessage ?? 'Terjadi kesalahan. Coba lamar manual.', link: `/applications/${applicationId}` },
        })
      }

      await prisma.autoApplyLog.create({ data: { sessionId, level: result.success ? 'info' : 'error', step: 'submit', message: result.success ? 'Submit success' : (result.errorMessage ?? 'unknown error') } })
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,                              // satu submit sekaligus
      limiter: { max: 3, duration: 60_000 },       // max 3 per menit
    }
  )

  worker.on('failed', (job, err) => console.error(`[auto-apply] job ${job?.id} failed:`, err))
  return worker
}
```

#### 3C. Modifikasi `apps/scraper/src/worker.ts`

```typescript
import { startAutoApplyWorker } from './workers/auto-apply.worker.js'

async function main() {
  const scrapeWorker = startScrapeWorker()
  const autoApplyWorker = startAutoApplyWorker()   // tambahkan ini
  startScheduler()

  process.on('SIGTERM', async () => {
    await Promise.all([scrapeWorker.close(), autoApplyWorker.close()])
    process.exit(0)
  })
}
```

---

### Phase 4 — API Routes

#### 4A. Buat `apps/api/src/plugins/auto-apply-queue.ts`

```typescript
import { Queue } from 'bullmq'
import type { AutoApplyJobData } from '@jobflow/shared'

// Antrian yang sama dengan scraper — API hanya enqueue, scraper yang process
export const autoApplyQueue = new Queue<AutoApplyJobData>('auto-apply', {
  connection: { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 },
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
})
```

#### 4B. Buat `apps/api/src/routes/auto-apply.ts`

Empat routes:

```typescript
import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { generateFormAnswers } from '@jobflow/ai'
import { autoApplyQueue } from '../plugins/auto-apply-queue.js'
import { IndeedApplier } from '../../../scraper/src/appliers/indeed.applier.js'  // atau import via shared package
import { z } from 'zod'

export async function autoApplyRoutes(app: FastifyInstance) {

  // ROUTE 1: Trigger — detect fields + generate AI answers
  app.post('/:id/auto-apply', async (req, reply) => {
    const { id: applicationId } = req.params as { id: string }
    const user = req.user  // dari auth middleware

    const application = await prisma.jobApplication.findFirst({
      where: { id: applicationId, userId: user.id },
      include: { job: true, resume: true },
    })
    if (!application) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' } })
    if (!application.resume) return reply.code(400).send({ success: false, error: { code: 'NO_RESUME', message: 'Pilih resume terlebih dahulu' } })

    // Cek session existing (idempotent)
    const existing = await prisma.autoApplySession.findUnique({ where: { applicationId } })
    if (existing?.status === 'submitted') return reply.send({ success: true, data: existing })

    const source = application.job.source as 'indeed' | 'jobstreet' | 'linkedin'
    const supported = ['indeed', 'jobstreet', 'linkedin']
    if (!supported.includes(source)) {
      return reply.code(400).send({ success: false, error: { code: 'UNSUPPORTED_SOURCE', message: `Auto-apply belum support ${source}` } })
    }

    // Detect form fields via Playwright
    let applier
    if (source === 'indeed') applier = new IndeedApplier()
    else if (source === 'jobstreet') applier = new (await import('../../../scraper/src/appliers/jobstreet.applier.js')).JobStreetApplier()
    else {
      const integration = await prisma.userIntegration.findFirst({ where: { userId: user.id, provider: 'linkedin' } })
      if (!integration) return reply.code(403).send({ success: false, error: { code: 'REQUIRES_AUTH', message: 'Hubungkan akun LinkedIn di Settings > Integrasi', requiresAuth: true } })
      applier = new (await import('../../../scraper/src/appliers/linkedin.applier.js')).LinkedInApplier(integration.accessToken)
    }

    let detectedFields
    try {
      detectedFields = await applier.detectFields(application.job.applyUrl)
    } catch (e: any) {
      if (e.message === 'requires_auth') return reply.code(403).send({ success: false, error: { code: 'REQUIRES_AUTH', message: 'Login diperlukan untuk platform ini', requiresAuth: true } })
      if (e.message === 'external_ats') return reply.code(400).send({ success: false, error: { code: 'EXTERNAL_ATS', message: 'Lamaran ini mengarah ke situs eksternal yang tidak didukung' } })
      throw e
    }

    // Generate AI answers
    const answers = await generateFormAnswers(
      application.resume.content as any,
      application.job.description,
      detectedFields
    )

    // Simpan session
    const session = await prisma.autoApplySession.upsert({
      where: { applicationId },
      create: { applicationId, status: 'pending_approval', detectedFields, answers, siteUrl: application.job.applyUrl, source },
      update: { status: 'pending_approval', detectedFields, answers },
    })

    // Update status aplikasi ke transient
    await prisma.jobApplication.update({ where: { id: applicationId }, data: { status: 'auto_applying' } })

    return reply.send({ success: true, data: { sessionId: session.id, fields: detectedFields, answers } })
  })

  // ROUTE 2: Confirm — user sudah review, enqueue untuk submit
  app.post('/:id/auto-apply/confirm', async (req, reply) => {
    const { id: applicationId } = req.params as { id: string }
    const body = z.object({ sessionId: z.string(), answers: z.array(z.any()) }).parse(req.body)
    const user = req.user

    const session = await prisma.autoApplySession.findUnique({ where: { id: body.sessionId } })
    if (!session || session.status !== 'pending_approval') {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_SESSION', message: 'Session tidak valid atau sudah kadaluarsa' } })
    }

    const application = await prisma.jobApplication.findFirst({
      where: { id: applicationId, userId: user.id },
      include: { resume: true },
    })

    await prisma.autoApplySession.update({ where: { id: body.sessionId }, data: { status: 'approved', answers: body.answers } })

    const bullJob = await autoApplyQueue.add('submit', {
      sessionId: body.sessionId,
      applicationId,
      userId: user.id,
      jobId: application!.jobId,
      siteUrl: session.siteUrl,
      source: session.source as any,
      answers: body.answers,
      resumeFileUrl: application?.resume?.fileUrl ?? undefined,
    })

    return reply.send({ success: true, data: { queued: true, jobId: bullJob.id } })
  })

  // ROUTE 3: Status — polling dari frontend
  app.get('/:id/auto-apply/status', async (req, reply) => {
    const { id: applicationId } = req.params as { id: string }
    const user = req.user

    const session = await prisma.autoApplySession.findUnique({
      where: { applicationId },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    })
    if (!session) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session tidak ditemukan' } })

    return reply.send({ success: true, data: session })
  })

  // ROUTE 4: Cancel — batalkan session yang pending
  app.delete('/:id/auto-apply', async (req, reply) => {
    const { id: applicationId } = req.params as { id: string }
    const user = req.user

    const session = await prisma.autoApplySession.findUnique({ where: { applicationId } })
    if (!session || !['pending_approval', 'approved'].includes(session.status)) {
      return reply.code(400).send({ success: false, error: { code: 'CANNOT_CANCEL', message: 'Session tidak bisa dibatalkan' } })
    }

    await prisma.autoApplySession.update({ where: { applicationId }, data: { status: 'skipped' } })
    await prisma.jobApplication.update({ where: { id: applicationId }, data: { status: 'saved' } })

    return reply.send({ success: true, data: { cancelled: true } })
  })
}
```

#### 4C. Register di `apps/api/src/server.ts`

```typescript
import { autoApplyRoutes } from './routes/auto-apply.js'
// dalam bootstrap():
await app.register(autoApplyRoutes, { prefix: '/api/applications' })
```

---

### Preview / Approval Flow (UX)

```
User klik "Auto Apply" di job card
  ↓
Loading modal: "Mendeteksi form lamaran..." (~5 detik)
  ↓
Modal terbuka dengan dua section:
  ┌─────────────────────────────────────┐
  │  Data Profil (read-only)            │
  │  Nama: John Doe          [Profil]   │
  │  Email: john@email.com   [Profil]   │
  │  Telp: 0812xxxxxx        [Profil]   │
  ├─────────────────────────────────────┤
  │  Pertanyaan Custom (editable)       │
  │  "Mengapa tertarik posisi ini?"     │
  │  [AI] Saya tertarik karena...  ✏️  │
  │                                     │
  │  "Berapa tahun pengalaman Python?"  │
  │  [AI] 3 tahun                  ✏️  │
  └─────────────────────────────────────┘
  [ Batal ]          [ Kirim Lamaran → ]
  ↓
User klik "Kirim Lamaran"
  ↓
Card di Kanban berubah: spinner "Sedang melamar..."
Frontend polling /status setiap 5 detik
  ↓
Sukses: card pindah ke kolom "Dilamar" + toast hijau
Gagal:  toast merah + tombol "Coba Manual" → buka applyUrl
```

### Edge Cases & Error Handling

| Kondisi | Behavior |
|---------|----------|
| Platform tidak support (Glassdoor, Kalibrr) | Return 400 `UNSUPPORTED_SOURCE` |
| LinkedIn tanpa `UserIntegration` | Return 403 `REQUIRES_AUTH` + CTA connect akun |
| JobStreet redirect ke external ATS | Return 400 `EXTERNAL_ATS` |
| CAPTCHA terdeteksi | Session → `failed`, notif "Coba manual" |
| Session sudah `submitted` | Return session existing (idempotent) |
| Playwright timeout > 30s | Session → `failed`, fallback manual |
| Resume tidak ada file URL | Skip upload, isi field text saja |

---

## 🔐 VARIABEL ENVIRONMENT

Buat file `.env.example` dengan semua variabel berikut:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/jobflow"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# AI
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""

# Storage
CLOUDFLARE_R2_ACCOUNT_ID=""
CLOUDFLARE_R2_ACCESS_KEY_ID=""
CLOUDFLARE_R2_SECRET_ACCESS_KEY=""
CLOUDFLARE_R2_BUCKET_NAME="jobflow-docs"

# Email
RESEND_API_KEY=""

# Redis (untuk BullMQ)
REDIS_URL="redis://localhost:6379"

# Stripe
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_PRO_PRICE_ID=""

# Email Integration
GOOGLE_GMAIL_CLIENT_ID=""
GOOGLE_GMAIL_CLIENT_SECRET=""

# Playwright
PLAYWRIGHT_HEADLESS="true"
```

---

## 🧪 STANDAR KODE

- **TypeScript strict mode** — tidak ada `any` yang tidak dijelaskan
- **Semua API endpoint** harus punya validasi input dengan `zod`
- **Error handling** — semua async function dibungkus try/catch, kembalikan error terstruktur: `{ success: false, error: { code, message } }`
- **API response format** harus konsisten:
  ```typescript
  // Sukses
  { success: true, data: T }
  // Gagal
  { success: false, error: { code: string, message: string } }
  ```
- **Database queries** — selalu gunakan Prisma, jangan raw SQL kecuali untuk operasi kompleks
- **Komponen React** — gunakan Server Components sebisa mungkin, Client Components hanya jika perlu interaktivitas
- **Naming convention**: camelCase untuk variabel/fungsi, PascalCase untuk komponen/types, kebab-case untuk file

---

## 📋 DEFINISI SELESAI (Definition of Done)

Sebuah fitur dianggap selesai jika:
1. ✅ Fungsional end-to-end (frontend ↔ API ↔ database)
2. ✅ Validasi input berjalan (coba kirim data rusak, harus return error yang jelas)
3. ✅ Loading state ada di UI
4. ✅ Error state ada di UI (toast notification)
5. ✅ Responsif di mobile (min 375px)
6. ✅ Tidak ada TypeScript error
7. ✅ Environment variable yang diperlukan terdokumentasi di `.env.example`

---

## 🚀 CARA MULAI

```bash
# 1. Clone & install
git clone <repo>
cd jobflow-ai
pnpm install

# 2. Setup environment
cp .env.example .env
# isi semua variabel di .env

# 3. Setup database
pnpm db:push      # push schema ke PostgreSQL
pnpm db:seed      # isi data awal (kategori, dll.)

# 4. Jalankan development
pnpm dev          # jalankan semua apps sekaligus (Turborepo)

# Frontend: http://localhost:3000
# API:      http://localhost:3001
# Prisma Studio: pnpm db:studio → http://localhost:5555
```

---

*File ini adalah sumber kebenaran tunggal (single source of truth) untuk proyek ini. Jika ada konflik antara file ini dengan kode yang sudah ada, file ini yang diikuti.*
