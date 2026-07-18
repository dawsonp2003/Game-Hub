const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const WIKI_REST_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary'

async function wikiQuery(params) {
  const url = new URL(WIKI_API)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const res = await fetch(url.toString())
  return res.json()
}

async function fetchSummaryThumbnail(title) {
  const res = await fetch(`${WIKI_REST_SUMMARY}/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!res.ok) return undefined
  const data = await res.json()
  if (data.type === 'disambiguation') return undefined
  return data.thumbnail?.source
}

async function fetchPageImageProp(title) {
  const data = await wikiQuery({ action: 'query', titles: title, redirects: '1', prop: 'pageprops' })
  const page = Object.values(data.query?.pages ?? {}).find((p) => !p.missing)
  const fileName = page?.pageprops?.page_image
  if (!fileName) return undefined
  const fileData = await wikiQuery({
    action: 'query',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '200',
  })
  return Object.values(fileData.query?.pages ?? {})[0]?.imageinfo?.[0]?.thumburl
}

async function searchThumbnail(query) {
  const data = await wikiQuery({ action: 'query', list: 'search', srsearch: query, srlimit: '6' })
  for (const hit of data.query?.search ?? []) {
    const t = await fetchSummaryThumbnail(hit.title)
    if (t) return t
    const p = await fetchPageImageProp(hit.title)
    if (p) return p
  }
}

async function resolveOne(title, label) {
  for (const c of [...new Set([title, label])]) {
    const s = await fetchSummaryThumbnail(c)
    if (s) return s
  }
  for (const c of [...new Set([title, label])]) {
    const p = await fetchPageImageProp(c)
    if (p) return p
  }
  for (const q of [...new Set([title, label])]) {
    const s = await searchThumbnail(q)
    if (s) return s
  }
}

const samples = [
  ['Pikachu', 'Pikachu'],
  ['Charizard', 'Charizard'],
  ['Mewtwo', 'Mewtwo'],
  ['Luigi', 'Luigi'],
  ['Bowser', 'Bowser'],
  ["McDonald's", "McDonald's"],
  ['Thor', 'Thor (Marvel Comics)'],
]

let ok = 0
for (const [term, label] of samples) {
  const url = await resolveOne(term, label)
  console.log(label, url ? '✓' : '✗')
  if (url) ok++
}
console.log(`\n${ok}/${samples.length} with images`)
