import { useEffect, useState } from 'react'

type Props = { open: boolean; text: string; onClose: () => void }

export function NarratorModal({ open, text, onClose }: Props) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    if (!open) return
    setExiting(false)
    const DISPLAY_MS = 3300
    const EXIT_MS = 220
    const t1 = setTimeout(() => setExiting(true), DISPLAY_MS)
    const t2 = setTimeout(onClose, DISPLAY_MS + EXIT_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={`toast ${exiting ? 'exiting' : ''}`} role="status" aria-live="polite" onClick={() => {
      if (!exiting) {
        setExiting(true)
        setTimeout(onClose, 220)
      }
    }}>
      <div className="toast-title">Bro</div>
      <div className="toast-body">{text}</div>
    </div>
  )
}


