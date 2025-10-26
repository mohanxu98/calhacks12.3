# iMessage Lite (Vite + React + TypeScript)

A minimal iMessage-style chat UI with localStorage persistence, built with Vite + React + TypeScript.

## Features
- Two-pane layout: conversations sidebar + chat view
- Message bubbles (blue for you, gray for them)
- Timestamp separators
- Search conversations
- Local persistence (no backend required)

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes
- Data is stored under `localStorage` key `imessage-lite-store-v1`.
- This is a client-only demo intended for learning and prototyping.

## Optional: LLM Auto-Replies

1) Configure an HTTP endpoint in `.env` (or use the built-in stub):

```
VITE_LLM_ENDPOINT=https://your-endpoint
VITE_LLM_API_KEY=your-key
```

2) Personas live in `src/personas.json`. The app matches by `conversation.id` or `name`.

3) Toggle “LLM” in the header to enable auto-replies. If no endpoint is set, a local stub generates short persona-flavored replies.

Gemini setup (alternative):

```
VITE_GEMINI_API_KEY=your_gemini_key
VITE_GEMINI_MODEL=gemini-1.5-flash
```
The app will use Gemini automatically when `VITE_LLM_ENDPOINT` is not provided.
