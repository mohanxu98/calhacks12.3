import { useState } from 'react'
import type { Quiz } from '../services/llm'

type Props = {
  open: boolean
  quiz: Quiz | null
  onClose: () => void
  onPass: () => void
  onFail: () => void
}

export function QuizModal({ open, quiz, onClose, onPass, onFail }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  if (!open || !quiz) return null
  const correctCount = quiz.questions.reduce((acc, q) => acc + ((answers[q.id] === q.correctIndex) ? 1 : 0), 0)
  const canSubmit = Object.keys(answers).length === quiz.questions.length
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 'min(640px, 92vw)' }}>
        <div className="modal-title">Quiz — {quiz.persona}</div>
        <div className="modal-body">
          {quiz.questions.map((q) => (
            <div key={q.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{q.text}</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {q.options.map((opt, idx) => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === idx}
                      onChange={() => setAnswers(a => ({ ...a, [q.id]: idx }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              if (correctCount >= quiz.passMinCorrect) onPass(); else onFail();
            }}
          >Submit</button>
        </div>
      </div>
    </div>
  )
}


