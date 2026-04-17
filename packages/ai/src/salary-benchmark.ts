import { openai, AI_MODEL } from './client.js'

export type SalaryBenchmarkResult = {
  min: number
  max: number
  median: number
  currency: string
  factors: string[]
  negotiationTips: string[]
  marketDemand: string
}

function isIndonesianLocation(location: string): boolean {
  const indonesianKeywords = [
    'indonesia', 'jakarta', 'bandung', 'surabaya', 'medan', 'semarang',
    'bali', 'denpasar', 'yogyakarta', 'malang', 'bekasi', 'tangerang',
    'depok', 'bogor', 'palembang', 'makassar', 'id',
  ]
  return indonesianKeywords.some((kw) => location.toLowerCase().includes(kw))
}

export async function benchmarkSalary(
  jobTitle: string,
  location: string,
  yearsExperience: number
): Promise<SalaryBenchmarkResult> {
  const currency = isIndonesianLocation(location) ? 'IDR' : 'USD'

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah konsultan kompensasi dan benefit yang memberikan benchmark gaji akurat berdasarkan data pasar terkini.
Selalu balas dengan JSON valid saja. Gunakan mata uang ${currency}. Format:
{
  "min": <angka minimum gaji>,
  "max": <angka maksimum gaji>,
  "median": <angka median gaji>,
  "currency": "${currency}",
  "factors": ["<faktor yang mempengaruhi gaji>", ...],
  "negotiationTips": ["<tips negosiasi gaji>", ...],
  "marketDemand": "<tingkat permintaan pasar: Tinggi/Sedang/Rendah dengan penjelasan>"
}`,
      },
      {
        role: 'user',
        content: `Berikan benchmark gaji untuk posisi "${jobTitle}" di ${location} dengan pengalaman ${yearsExperience} tahun. Gunakan mata uang ${currency}.`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as SalaryBenchmarkResult
}
