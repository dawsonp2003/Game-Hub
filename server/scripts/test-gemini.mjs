import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const key = process.env.GEMINI_API_KEY
const model = 'gemini-2.5-flash-lite'

if (!key) {
  console.error('No GEMINI_API_KEY')
  process.exit(1)
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

const body = {
  contents: [
    {
      parts: [
        {
          text: `Return individual Pokemon species for a tier list. JSON only: {"items":[{"label":"Pikachu","searchTerm":"Pikachu"}]}`,
        },
      ],
    },
  ],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' },
              searchTerm: { type: 'STRING' },
            },
            required: ['label', 'searchTerm'],
          },
        },
      },
      required: ['items'],
    },
  },
}

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

console.log('status:', res.status)
const text = await res.text()
console.log(text.slice(0, 800))
