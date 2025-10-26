import { useEffect, useMemo, useState } from 'react'
import { generateReply, getPersonaForConversation, scoreMessage, generateQuiz, type ChatTurn, type Quiz } from '../services/llm'
import { TypingBubble } from './TypingBubble'
import { NarratorModal } from './NarratorModal'
import { QuizModal } from './QuizModal'

type Message = {
  id: string
  conversationId: string
  author: 'me' | 'them'
  text: string
  createdAt: number
}

type Conversation = {
  id: string
  name: string
  phone?: string
  progress?: number // 0..100, defaults to 50
  unlocked?: boolean // gated progression
  lives?: number // per-conversation lives (default 3)
  quizPassed?: boolean
}

type Store = {
  conversations: Conversation[]
  messages: Message[]
  llmEnabled?: boolean
}

const STORAGE_KEY = 'imessage-lite-store-v1'

function loadStore(): Store {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Store
      // normalize: ensure progress/unlocked fields and gating
      const convs = [...parsed.conversations]
        .map((c, i) => ({
          ...c,
          progress: c.progress ?? 50,
          unlocked: i === 0 ? true : (c.unlocked ?? false),
          lives: c.lives ?? 3,
          quizPassed: c.quizPassed ?? false,
        }))
      for (let i = 1; i < convs.length; i++) {
        if ((convs[i - 1].progress ?? 50) >= 100) convs[i].unlocked = true
      }
      return { ...parsed, conversations: convs, llmEnabled: parsed.llmEnabled ?? true }
    } catch {}
  }
  const now = Date.now()
  const demoConversations: Conversation[] = [
    { id: 'c1', name: 'Taylor', progress: 50, unlocked: true, lives: 3 },
    { id: 'c2', name: 'Alex', progress: 50, unlocked: false, lives: 3 },
    { id: 'c3', name: 'Casey', progress: 50, unlocked: false, lives: 3 },
  ]
  const demoMessages: Message[] = [
    // Taylor — subtly cold/dry
    { id: 'm1', conversationId: 'c1', author: 'them', text: 'Hey.', createdAt: now - 1000 * 60 * 70 },
    { id: 'm2', conversationId: 'c1', author: 'me', text: 'Was thinking coffee later—if you’re free.', createdAt: now - 1000 * 60 * 66 },
    { id: 'm3', conversationId: 'c1', author: 'them', text: 'Maybe. Not sure yet.', createdAt: now - 1000 * 60 * 62 },

    // Alex — tech-savvy, a little sarcastic
    { id: 'm4', conversationId: 'c2', author: 'them', text: 'Got stuck debugging again lol 🧠', createdAt: now - 1000 * 60 * 140 },
    { id: 'm5', conversationId: 'c2', author: 'me', text: 'Want to decompress after? Walk or coffee?', createdAt: now - 1000 * 60 * 136 },
    { id: 'm6', conversationId: 'c2', author: 'them', text: 'A walk would be nice. My brain needs fresh air 😂', createdAt: now - 1000 * 60 * 132 },

    // Casey — kind but emotionally distant
    { id: 'm7', conversationId: 'c3', author: 'them', text: 'Been kind of in my head today.', createdAt: now - 1000 * 60 * 220 },
    { id: 'm8', conversationId: 'c3', author: 'me', text: 'I’m here. Want to talk or just chill?', createdAt: now - 1000 * 60 * 216 },
    { id: 'm9', conversationId: 'c3', author: 'them', text: 'Thanks. Maybe later — appreciate it.', createdAt: now - 1000 * 60 * 212 },
  ]
  return { conversations: demoConversations, messages: demoMessages, llmEnabled: true }
}

function saveStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function timeLabel(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatLayout() {
  const [store, setStore] = useState<Store>(() => loadStore())
  const [selectedId, setSelectedId] = useState<string>(store.conversations[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const llmEnabled = store.llmEnabled ?? true
  const currentConversation = store.conversations.find(c => c.id === selectedId)
  const quizPassed = currentConversation?.quizPassed ?? false
  const rawProgress = (store.conversations.find(c => c.id === selectedId)?.progress ?? 50)
  const progress = !quizPassed && rawProgress > 80 ? 80 : rawProgress
  const isComplete = progress >= 100
  const convLives = currentConversation?.lives ?? 3
  const [narratorOpen, setNarratorOpen] = useState(false)
  const [narratorText, setNarratorText] = useState('')
  const [lastNarratorAt, setLastNarratorAt] = useState(0)
  const [quizOpen, setQuizOpen] = useState(false)
  const [quiz, setQuiz] = useState<Quiz | null>(null)

  useEffect(() => { saveStore(store) }, [store])

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return store.conversations
    return store.conversations.filter(c => c.name.toLowerCase().includes(q) || (c.phone?.includes(q)))
  }, [store.conversations, query])

  const currentMessages = useMemo(() => {
    return store.messages
      .filter(m => m.conversationId === selectedId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [store.messages, selectedId])

  

  function sendMessage(text: string) {
    if (!text.trim() || !selectedId) return
    const msg: Message = {
      id: 'm' + Math.random().toString(36).slice(2),
      conversationId: selectedId,
      author: 'me',
      text: text.trim(),
      createdAt: Date.now(),
    }
    setStore(s => ({ ...s, messages: [...s.messages, msg] }))
    if (llmEnabled) void autoReply(text)
    if (llmEnabled) void scoreAndUpdate(text)
  }

  async function autoReply(userMessage: string) {
    const convo = store.conversations.find(c => c.id === selectedId)
    if (!convo) return
    setPending(true)
    try {
      const history: ChatTurn[] = store.messages
        .filter(m => m.conversationId === selectedId)
        .map(m => ({ author: m.author, text: m.text }))
      const persona = getPersonaForConversation(convo)
      const reply = await generateReply({ persona, history, userMessage })
      const msg: Message = {
        id: 'm' + Math.random().toString(36).slice(2),
        conversationId: selectedId,
        author: 'them',
        text: reply,
        createdAt: Date.now(),
      }
      setStore(s => ({ ...s, messages: [...s.messages, msg] }))
    } finally {
      setPending(false)
    }
  }

  async function scoreAndUpdate(userMessage: string) {
    const convo = store.conversations.find(c => c.id === selectedId)
    if (!convo) return
    try {
      const history: ChatTurn[] = [
        ...store.messages
          .filter(m => m.conversationId === selectedId)
          .map(m => ({ author: m.author, text: m.text })),
        { author: 'me', text: userMessage }
      ]
      const persona = getPersonaForConversation(convo)
      const { delta } = await scoreMessage({ persona, history, userMessage })
      setStore(s => {
        let lostLife = false
        const updatedConversations = s.conversations.map((c, idx, arr) => {
          if (c.id !== selectedId) return c
          const base = c.progress ?? 50
          const cappedDelta = Math.max(-25, Math.min(50, Math.round(delta)))
          const rawNext = Math.round(base + cappedDelta)
          let next = rawNext
          let lives = c.lives ?? 3
          if (rawNext < 0) {
            // lose a life and reset this conversation
            lostLife = true
            lives = Math.max(0, lives - 1)
            next = 50
          }
          next = Math.max(0, Math.min(100, next))
          // gate at 80% until quiz is passed
          const gatedNext = (c.quizPassed ? next : Math.min(next, 80))
          const updated = { ...c, progress: gatedNext, lives }
          if (next >= 100 && arr[idx + 1] && !arr[idx + 1].unlocked) {
            arr[idx + 1] = { ...arr[idx + 1], unlocked: true }
          }
          return updated
        })
        const updatedMessages = lostLife ? s.messages.filter(m => m.conversationId !== selectedId) : s.messages
        return { ...s, conversations: updatedConversations, messages: updatedMessages }
      })
      // trigger quiz if we crossed 80% and haven't passed
      const after = (currentConversation?.progress ?? 50) + delta
      if (!quizPassed && after >= 80 && !quizOpen) {
        try {
          const historyForQuiz: ChatTurn[] = [
            ...store.messages
              .filter(m => m.conversationId === selectedId)
              .map(m => ({ author: m.author, text: m.text })),
          ]
          const persona = getPersonaForConversation(convo)
          const qz = await generateQuiz({ persona, history: historyForQuiz })
          setQuiz(qz)
          setQuizOpen(true)
        } catch {}
      }
      // Trigger narrator if trending poorly or near loss
      const now = Date.now()
      const cooldown = now - lastNarratorAt < 20000
      if (!cooldown && (delta <= -20 || (store.conversations.find(c => c.id === selectedId)?.progress ?? 50) + delta <= 25)) {
        setNarratorText('Critical — interest is very low. Think carefully before you send your next line.')
        setNarratorOpen(true)
        setLastNarratorAt(now)
      }
    } catch {
      // ignore scoring errors; keep playing
    }
  }

  function guardBeforeSend(text: string): boolean {
    const now = Date.now()
    if (now - lastNarratorAt < 15000) return false
    if (progress <= 25 && !narratorOpen) {
      setNarratorText('You are about to lose the date. Consider a warmer, thoughtful message.')
      setNarratorOpen(true)
      setLastNarratorAt(now)
      return true
    }
    return false
  }

  function resetConversation(conversationId: string) {
    setPending(false)
    setStore(s => {
      const kept = s.messages.filter(m => m.conversationId !== conversationId)
      const updatedConversations = s.conversations.map(c => c.id === conversationId ? { ...c, progress: 50 } : c)
      return { ...s, messages: kept, conversations: updatedConversations }
    })
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">Messages</div>
        <div className="search">
          <input
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="conversations">
          {filteredConversations.map(c => {
            const last = store.messages
              .filter(m => m.conversationId === c.id)
              .sort((a, b) => b.createdAt - a.createdAt)[0]
            const initials = c.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={c.id}
                className="conv-item"
                onClick={() => { if (c.unlocked) setSelectedId(c.id) }}
                style={{
                  background: c.id === selectedId ? 'rgba(255,255,255,0.05)' : undefined,
                  opacity: c.unlocked ? 1 : 0.5,
                  cursor: c.unlocked ? 'pointer' : 'not-allowed'
                }}
              >
                <div className="conv-avatar">{c.unlocked ? (initials || '👤') : '🔒'}</div>
                <div className="conv-meta">
                  <div className="conv-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{c.name}</span>
                    <span className="conv-hearts">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <span key={i} aria-hidden style={{ color: i < (c.lives ?? 3) ? '#ef4444' : '#6b7280' }}>❤</span>
                      ))}
                    </span>
                  </div>
                  <div className="conv-preview">{last?.text ?? 'No messages yet'}</div>
                </div>
                <div className="conv-time">{last ? timeLabel(last.createdAt) : ''}</div>
              </div>
            )
          })}
        </div>
      </aside>

      <section className="chat">
        <div className="chat-header">
          <div className="chat-title">
            {currentConversation?.name ?? 'Select a conversation'}
            {currentConversation && (
              <button
                title="Restart conversation"
                onClick={() => resetConversation(currentConversation.id)}
                style={{
                  marginLeft: 10,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--subtle)',
                  fontSize: 12,
                  padding: '4px 8px',
                  cursor: 'pointer'
                }}
              >×</button>
            )}
          </div>
          {/* per-conversation hearts moved to sidebar items */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isComplete && (
              <button
                onClick={() => {
                  const idx = store.conversations.findIndex(c => c.id === selectedId)
                  const next = store.conversations[idx + 1]
                  if (next?.unlocked) setSelectedId(next.id)
                }}
              >Next</button>
            )}
            <div style={{ color: 'var(--subtle)', fontSize: 12 }}>iMessage</div>
          </div>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${isComplete ? 'complete' : ''}`}
            style={{ width: `${progress}%` }}
          />
          <div className="progress-back" />
        </div>
        <div className="chat-body">
          {currentMessages.length === 0 && (
            <div className="timestamp">No messages yet. Say hi!</div>
          )}
          {currentMessages.map((m, idx) => {
            const prev = currentMessages[idx - 1]
            const showTime = !prev || (m.createdAt - prev.createdAt) > 1000 * 60 * 10
            return (
              <div key={m.id}>
                {showTime && <div className="timestamp">{new Date(m.createdAt).toLocaleString()}</div>}
                <div className={`bubble ${m.author === 'me' ? 'me' : 'them'}`}>{m.text}</div>
              </div>
            )
          })}
          {pending && <TypingBubble />}
        </div>
        <Composer
          onSend={sendMessage}
          disabled={!selectedId || isComplete || !(currentConversation?.unlocked) || (convLives <= 0) || quizOpen}
          onBeforeSend={guardBeforeSend}
        />
      </section>
      <NarratorModal open={narratorOpen} text={narratorText} onClose={() => setNarratorOpen(false)} />
      <QuizModal
        open={quizOpen}
        quiz={quiz}
        onClose={() => setQuizOpen(false)}
        onPass={() => {
          setQuizOpen(false)
          setStore(s => ({
            ...s,
            conversations: s.conversations.map(c => c.id === selectedId ? { ...c, quizPassed: true } : c)
          }))
        }}
        onFail={() => {
          setQuizOpen(false)
          setStore(s => {
            return {
              ...s,
              conversations: s.conversations.map(c => {
                if (c.id !== selectedId) return c
                const newProgress = Math.max(0, (c.progress ?? 50) - 20)
                let lives = c.lives ?? 3
                if (newProgress === 0) {
                  // apply life loss + reset messages for this conversation
                  lives = Math.max(0, lives - 1)
                }
                return { ...c, progress: newProgress === 0 ? 50 : newProgress, lives }
              }),
              messages: ((s.conversations.find(c => c.id === selectedId)?.progress ?? 50) - 20) <= 0
                ? s.messages.filter(m => m.conversationId !== selectedId)
                : s.messages
            }
          })
        }}
      />
    </div>
  )
}

function Composer({ onSend, disabled, onBeforeSend }: { onSend: (text: string) => void, disabled?: boolean, onBeforeSend?: (text: string) => boolean }) {
  const [value, setValue] = useState('')
  function submit() {
    if (disabled) return
    const v = value.trim()
    if (!v) return
    if (onBeforeSend && onBeforeSend(v)) return
    onSend(v)
    setValue('')
  }
  return (
    <div className="composer">
      <input
        placeholder={disabled ? 'Select a conversation' : 'iMessage'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        disabled={disabled}
      />
      <button onClick={submit} disabled={disabled}>Send</button>
    </div>
  )
}


