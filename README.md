# CutMind

CutMind is an AI Content Director for short-video creators. It is designed to find the exact moments worth using inside a large collection of footage, discover the stories those moments can tell, and turn a selected story into a structured editing plan.

> Phase 3 can send a few extracted Segment keyframes to a server-side Gemini provider and validate structured visual-understanding results. It does not upload full videos, transcribe speech, discover stories, or generate edits.

## Technology

- Next.js 16 (App Router)
- React 19
- TypeScript (strict mode)
- Tailwind CSS 4
- ESLint

No database, AI SDK, state library, component kit, or video-processing dependency is included.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

To enable Segment understanding, copy `.env.example` to `.env.local`, set `GEMINI_API_KEY`, and restart the development server. The key is read only by the server route and must never use a `NEXT_PUBLIC_` prefix.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Structure

```text
src/
  app/                 Routes and presentation
  components/          Reusable UI
  domain/
    types/             Structured domain contracts
    services/          Provider-neutral future service interfaces
docs/
  ARCHITECTURE.md
  ROADMAP.md
```

See [Architecture](docs/ARCHITECTURE.md) and [Roadmap](docs/ROADMAP.md).
