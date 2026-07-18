/** Extract the franchise/show/book name from prompts like "Friends characters". */
export function extractWorkTitleFromTopic(topicPrompt?: string): string | undefined {
  if (!topicPrompt) return undefined
  const trimmed = topicPrompt.trim()

  const fromSuffix = trimmed.match(/^(.+?)\s+(characters?|cast|villains?|heroes|main cast)\b/i)
  if (fromSuffix?.[1]) return fromSuffix[1].trim()

  const fromPrefix = trimmed.match(/\b(?:characters?|cast)\s+(?:from|in|of)\s+(.+)/i)
  if (fromPrefix?.[1]) return fromPrefix[1].trim()

  return trimmed
}

/** Whether the tier-list topic is about fictional people/creatures (not books, films, etc.). */
export function detectCharacterTopic(topicPrompt?: string, label?: string): boolean {
  const text = `${topicPrompt ?? ''} ${label ?? ''}`.toLowerCase()
  return /\bcharacters?\b|pok[eé]mon|mario|superhero|supervillain|villains?|harry potter|hogwarts|star wars|marvel|dc comics|anime|disney|pixar|lord of the rings|game of thrones|stranger things|naruto|dragon ball|sonic|zelda|avengers|jedi|sith|wizard|witch|witcher|fortnite skins?|overwatch|league of legends|lol champions?|smash bros|mortal kombat|street fighter|resident evil|final fantasy|kingdom hearts|one piece|bleach|my hero academia|project hail mary|dune|expanse|wheel of time|percy jackson|hunger games/.test(
    text,
  )
}

/** Build a Google Images-style query with enough context to find the right subject. */
export function buildImageSearchQuery(
  label: string,
  topicPrompt?: string,
  imageQuery?: string,
): string {
  const explicit = imageQuery?.trim()
  if (explicit) return explicit

  const name = label.trim()
  const topic = topicPrompt?.trim()
  if (!topic) return name

  const topicLower = topic.toLowerCase()
  const nameLower = name.toLowerCase()
  if (nameLower.includes(topicLower)) return name

  if (detectCharacterTopic(topic, label)) {
    return `${name} ${topic} character`
  }

  return `${name} ${topic}`
}

/** Names that often resolve to franchise/book pages instead of a character. */
const FRANCHISE_AMBIGUOUS = new Set(
  [
    'Harry Potter',
    'Lord of the Rings',
    'Star Wars',
    'Marvel',
    'Batman',
    'Spider-Man',
    'Superman',
    'Wonder Woman',
    'Iron Man',
    'Thor',
    'Hulk',
    'Mario',
    'Zelda',
    'Link',
    'Sonic',
    'Pikachu',
  ].map((s) => s.toLowerCase()),
)

export function isFranchiseAmbiguousName(label: string): boolean {
  return FRANCHISE_AMBIGUOUS.has(label.trim().toLowerCase())
}

/** Prefer a character article title when the LLM returns a bare name. */
export function normalizeCharacterSearchTerm(
  label: string,
  searchTerm: string,
  topicPrompt?: string,
): string {
  const term = searchTerm.trim() || label.trim()
  const characterTopic = detectCharacterTopic(topicPrompt, label)
  const work = extractWorkTitleFromTopic(topicPrompt)

  if (!characterTopic) return term

  // Already disambiguated
  if (/\([^)]+\)/.test(term)) return term

  const bareName = term.toLowerCase() === label.trim().toLowerCase()

  // TV/film/book context — e.g. "Monica Geller Friends" not a generic "(character)" page
  if (bareName && work) {
    const workLower = work.toLowerCase()
    if (!label.toLowerCase().includes(workLower)) {
      return `${label.trim()} ${work}`
    }
  }

  // Bare name that often hits franchise/book pages
  if (bareName) {
    if (isFranchiseAmbiguousName(label) || characterTopic) {
      return `${label.trim()} (character)`
    }
  }

  return term
}
