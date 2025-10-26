import { useEffect, useRef, useState } from 'react'

type Props = {
  text: string
  author: 'me' | 'them'
}

export function AudioBubble({ text, author }: Props) {
  const [playing, setPlaying] = useState(false)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    return () => {
      if (utterRef.current && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function toggle() {
    if (playing) {
      window.speechSynthesis.cancel()
      utterRef.current = null
      setPlaying(false)
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    // Prefer a more natural voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => /Samantha|Allison|Serena|Google UK English Female|en-US/i.test(v.name))
    if (preferred) u.voice = preferred
    u.onend = () => setPlaying(false)
    utterRef.current = u
    setPlaying(true)
    window.speechSynthesis.speak(u)
  }

  return (
    <div className={`bubble ${author === 'me' ? 'me' : 'them'}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={toggle}
        style={{
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.15)',
          color: 'inherit',
          padding: '6px 10px',
          cursor: 'pointer'
        }}
      >{playing ? 'Pause' : 'Play'}</button>
      <span style={{ opacity: 0.8, fontSize: 13, maxWidth: '56ch', display: 'inline-block' }}>{text}</span>
    </div>
  )
}


