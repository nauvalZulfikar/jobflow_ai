import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? 'placeholder-key',
})

export const AI_MODEL = 'gpt-4o-mini'
