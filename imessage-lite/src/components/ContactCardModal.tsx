import { useEffect, useState } from 'react'

type Props = {
  open: boolean
  name: string
  description: string
  system?: string
  onClose: () => void
  onSave: (updates: { description: string; system?: string }) => void
}

export function ContactCardModal({ open, name, description, system, onClose, onSave }: Props) {
  const [desc, setDesc] = useState(description)
  const [sys, setSys] = useState(system || '')
  useEffect(() => { if (open) { setDesc(description); setSys(system || '') } }, [open, description, system])
  if (!open) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 'min(720px, 92vw)' }}>
        <div className="modal-title">{name} — Contact</div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--subtle)', marginBottom: 6 }}>Persona Description</div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={'Examples:\n- Flirty but subtle, playful sarcasm, short texts, no emojis.\n- Busy med student, thoughtful, delayed replies, avoids small talk.\n- Warm, supportive friend, uses emojis sparingly, asks follow-ups.'}
              rows={6}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', resize: 'vertical' }}
            />
            <div style={{ color: 'var(--subtle)', fontSize: 12, marginTop: 6 }}>This feeds the Gemini prompt directly.</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--subtle)', marginBottom: 6 }}>System Prompt (optional)</div>
            <textarea
              value={sys}
              onChange={(e) => setSys(e.target.value)}
              placeholder={'Optional. Examples:\n- Never mention you are an AI.\n- Keep replies under 20 words.\n- Avoid giving advice about health or finance.'}
              rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', resize: 'vertical' }}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onSave({ description: desc.trim(), system: sys.trim() || undefined })} disabled={!desc.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}


