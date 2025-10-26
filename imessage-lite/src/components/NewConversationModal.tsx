import { useMemo, useState } from 'react'

type ConversationLite = { id: string; name: string }

type Props = {
  open: boolean
  conversations: ConversationLite[]
  onClose: () => void
  onCreate: (name: string) => void
  onSelectExisting?: (id: string) => void
}

export function NewConversationModal({ open, conversations, onClose, onCreate, onSelectExisting }: Props) {
  const [to, setTo] = useState('')
  const trimmed = to.trim()
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase()
    if (!q) return [] as ConversationLite[]
    return conversations.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6)
  }, [conversations, trimmed])

  if (!open) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 'min(560px, 92vw)' }}>
        <div className="modal-title">New Message</div>
        <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--subtle)', fontSize: 12 }}>To:</span>
            <input
              autoFocus
              placeholder="e.g., Taylor, Alex, Casey"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed) {
                  e.preventDefault()
                  const existing = conversations.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
                  if (existing && onSelectExisting) {
                    onSelectExisting(existing.id)
                  } else {
                    onCreate(trimmed)
                  }
                  setTo('')
                }
              }}
              style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}
            />
          </label>
          <div style={{ color: 'var(--subtle)', fontSize: 12 }}>
            Tip: Use a simple name like "Taylor" or "Gym Crush".
          </div>
          {matches.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {matches.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelectExisting?.(m.id)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 9,
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)'
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {trimmed && matches.length === 0 && (
            <div style={{ color: 'var(--subtle)', fontSize: 13 }}>No matches. Press Enter to create “{trimmed}”.</div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => { if (trimmed) { const existing = conversations.find(c => c.name.toLowerCase() === trimmed.toLowerCase()); if (existing && onSelectExisting) onSelectExisting(existing.id); else onCreate(trimmed); setTo('') } }} disabled={!trimmed}>Create</button>
        </div>
      </div>
    </div>
  )
}


