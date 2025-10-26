import personas from '../personas.json'

export type ChatTurn = { author: 'me' | 'them'; text: string }
export type Persona = { id: string; name: string; description: string; system?: string }

export function getPersonaForConversation(conversation: { id: string; name: string; personaDescription?: string; personaSystem?: string }): Persona {
  // Prefer per-conversation customizations if present
  if (conversation.personaDescription || conversation.personaSystem) {
    return {
      id: conversation.id,
      name: conversation.name,
      description: conversation.personaDescription || 'Custom persona.',
      system: conversation.personaSystem,
    }
  }
  const byId = (personas as Persona[]).find(p => p.id === conversation.id)
  if (byId) return byId
  const byName = (personas as Persona[]).find(p => p.name.toLowerCase() === conversation.name.toLowerCase())
  return byName ?? { id: conversation.id, name: conversation.name, description: 'Generic friendly persona.' }
}

type GenerateReplyParams = {
  persona: Persona
  history: ChatTurn[]
  userMessage: string
}

export async function generateReply(params: GenerateReplyParams): Promise<string> {
  const endpoint = import.meta.env.VITE_LLM_ENDPOINT as string | undefined
  const apiKey = import.meta.env.VITE_LLM_API_KEY as string | undefined
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  const geminiModel = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-1.5-flash'
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          persona: params.persona,
          history: params.history,
          userMessage: params.userMessage,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const text = (data.reply ?? data.text ?? '').toString()
      if (text) return text
    } catch (e) {
      // fall through to stub
    }
  }
  if (geminiKey) {
    try {
      const text = await generateReplyViaGemini(params, geminiKey, geminiModel)
      if (text) return text
    } catch (e) {
      // fall through to stub
    }
  }
  return stubReply(params)
}

function stubReply({ persona, history, userMessage }: GenerateReplyParams): string {
  const lastFromMe = userMessage.trim()
  const tone = persona.description?.toLowerCase().includes('sarcastic') ? '😏' : '🙂'
  const prefix = persona.name ? `${persona.name}:` : 'Reply:'
  if (/hello|hi|hey/i.test(lastFromMe)) return `${prefix} Hey! ${tone}`
  if (/coffee|tea/i.test(lastFromMe)) return `${prefix} Sounds good, when works for you? ${tone}`
  if (/dinner|lunch/i.test(lastFromMe)) return `${prefix} I’m in. Where were you thinking? ${tone}`
  const prev = history.filter(h => h.author === 'them').slice(-1)[0]?.text
  return `${prefix} ${prev ? 'Haha, ' : ''}got it — ${tone}`
}

// --- Scoring (delta-based interest meter) ---
export type ScoreResult = { delta: number; reason?: string }
type ScoreParams = { persona: Persona; history: ChatTurn[]; userMessage: string }

export async function scoreMessage(params: ScoreParams): Promise<ScoreResult> {
  const scoreEndpoint = import.meta.env.VITE_SCORE_ENDPOINT as string | undefined
  const apiKey = import.meta.env.VITE_LLM_API_KEY as string | undefined
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  const geminiModel = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-1.5-flash'
  if (scoreEndpoint) {
    try {
      const res = await fetch(scoreEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const delta = clampDelta(Number(data.delta))
      return { delta, reason: typeof data.reason === 'string' ? data.reason : undefined }
    } catch {}
  }
  if (geminiKey) {
    try {
      const out = await generateScoreViaGemini(params, geminiKey, geminiModel)
      return out
    } catch {}
  }
  return stubScore(params)
}

function clampDelta(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(-50, Math.min(50, Math.round(n)))
}

function stubScore({ userMessage }: ScoreParams): ScoreResult {
  const text = userMessage.toLowerCase()
  let delta = 0
  // Positive cues
  if (/sorry|apolog/i.test(text)) delta += 4
  if (/please|thanks|thank you|appreciate/i.test(text)) delta += 6
  if (/coffee|dinner|date|lunch|hang|meet/i.test(text)) delta += 8
  // Negative cues (stronger)
  if (/ghost|ignore|annoy|creepy|desperate/i.test(text)) delta -= 25
  if (/rude|stupid|dumb|idiot|hate|ugly|shut up/i.test(text)) delta -= 40
  if (/late|busy|can\'t|cannot|no\b|meh|whatever/i.test(text)) delta -= 8
  if (delta === 0) delta = Math.random() < 0.33 ? 2 : (Math.random() < 0.5 ? 0 : -2)
  return { delta: clampDelta(delta), reason: 'stub' }
}

async function generateScoreViaGemini(
  { persona, history, userMessage }: ScoreParams,
  apiKey: string,
  model: string
): Promise<ScoreResult> {
  const system = `You score the USER's last message based on how well it advances a friendly, flirty conversation with ${persona.name}. Return STRICT JSON: {"delta": number, "reason": string}. delta in [-50, 50]. Use large negative values for offensive/rude/disengaging lines; moderate positives for thoughtful/empathetic/forward but respectful lines. Keep reason short.`
  const contents: Array<{ role: string; parts: Array<{ text: string }> }>
    = [{ role: 'user', parts: [{ text: system }] }]
  for (const turn of history) {
    contents.push({ role: turn.author === 'me' ? 'user' : 'model', parts: [{ text: turn.text }] })
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const parsed = safeParseJson(text)
  const delta = clampDelta(Number(parsed?.delta))
  const reason = typeof parsed?.reason === 'string' ? parsed.reason : undefined
  return { delta, reason }
}

function safeParseJson(maybeJson: string): any {
  try { return JSON.parse(maybeJson) } catch {}
  const match = maybeJson.match(/[\{][\s\S]*[\}]/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  return null
}

// --- Quiz generation (LLM-driven, persona-aware) ---
export type QuizQuestion = {
  id: string
  type: 'mcq'
  text: string
  options: string[]
  correctIndex: number
  rationale?: string
}
export type Quiz = {
  quizId: string
  persona: string
  questions: QuizQuestion[]
  passMinCorrect: number
}

type GenerateQuizParams = {
  persona: Persona
  history: ChatTurn[]
}

export async function generateQuiz(params: GenerateQuizParams): Promise<Quiz> {
  const endpoint = import.meta.env.VITE_QUIZ_ENDPOINT as string | undefined
  const apiKey = import.meta.env.VITE_LLM_API_KEY as string | undefined
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  const geminiModel = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-1.5-flash'
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return normalizeQuiz(data, params)
    } catch {}
  }
  if (geminiKey) {
    try {
      return await generateQuizViaGemini(params, geminiKey, geminiModel)
    } catch {}
  }
  return stubQuiz(params)
}

function normalizeQuiz(data: any, params: GenerateQuizParams): Quiz {
  if (data && Array.isArray(data.questions) && typeof data.questions[0]?.text === 'string') {
    return {
      quizId: data.quizId || `${params.persona.id}-${Date.now()}`,
      persona: params.persona.name,
      questions: data.questions.map((q: any, i: number) => ({
        id: q.id || `q${i+1}`,
        type: 'mcq',
        text: String(q.text),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        correctIndex: Number(q.correctIndex ?? 0),
        rationale: typeof q.rationale === 'string' ? q.rationale : undefined,
      })),
      passMinCorrect: Number(data.passMinCorrect ?? 1),
    }
  }
  // try parse JSON from text
  const parsed = typeof data === 'string' ? safeParseJson(data) : null
  if (parsed) return normalizeQuiz(parsed, params)
  return stubQuiz(params)
}

async function generateQuizViaGemini(
  { persona, history }: GenerateQuizParams,
  apiKey: string,
  model: string
): Promise<Quiz> {
  const recent = history.slice(-6).map(h => `${h.author === 'me' ? 'USER' : persona.name}: ${h.text}`).join('\n')
  const instruction = `Create a 1-question multiple-choice quiz (type mcq) to test if USER understands healthy, empathetic boyfriend behavior for ${persona.name} based on recent conversation. Return STRICT JSON with fields: quizId, persona, questions:[{id,type,text,options[],correctIndex,rationale}], passMinCorrect.`
  const contents = [
    { role: 'user', parts: [{ text: instruction }] },
    { role: 'user', parts: [{ text: `Recent chat:\n${recent}` }] },
  ]
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const parsed = safeParseJson(text)
  return normalizeQuiz(parsed, { persona, history })
}

function stubQuiz({ persona }: GenerateQuizParams): Quiz {
  return {
    quizId: `${persona.id}-${Date.now()}`,
    persona: persona.name,
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        text: `${persona.name} had a tough day. What is the best first reply?`,
        options: [
          "It's not a big deal, you'll be fine.",
          'I’m here. Want to talk about it or decompress together?',
          'Ignore it and focus on the positive.',
          'You should have handled it better.'
        ],
        correctIndex: 1,
        rationale: 'Validate feelings and offer support without pressure.',
      },
    ],
    passMinCorrect: 1,
  }
}

async function generateReplyViaGemini(
  { persona, history, userMessage }: GenerateReplyParams,
  apiKey: string,
  model: string
): Promise<string> {
  // Construct contents: include brief persona instruction, then history, then the new user message
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  const instruction = `You are ${persona.name}. ${persona.description || ''} Keep replies short, natural, and in-character.`.trim()
  if (persona.system && persona.system.trim()) {
    contents.push({ role: 'user', parts: [{ text: persona.system.trim() }] })
  }
  contents.push({ role: 'user', parts: [{ text: instruction }] })
  for (const turn of history) {
    contents.push({ role: turn.author === 'me' ? 'user' : 'model', parts: [{ text: turn.text }] })
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const data = await res.json()
  // extract first text part
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text === 'string' && text.trim()) return text.trim()
  return ''
}


