# S.H.A.R.E.

S.H.A.R.E. is an academic resource-sharing platform with an integrated study
assistant named P.E.D.R.O. Students can publish and discover learning
materials, preview files, comment and react, save resources, and study through
AI chat and generated quizzes.

The application uses a React/Vite frontend, an Express API, Supabase for
authentication and production data, Supabase Storage for uploaded resources,
and Google Gemini for P.E.D.R.O.

## Features

- Searchable academic resource feed
- User accounts, profiles, saved resources, likes, and comments
- PDF, DOCX, PPTX, image, and video resource support
- Admin moderation and notifications
- P.E.D.R.O. streaming chat
- Quiz generation from topics or uploaded documents
- Deterministic quiz scoring with answer review and quiz history
- Supabase persistence with a local development fallback

## Requirements

- Node.js 24 or later
- npm
- A Supabase project for authentication and production persistence
- A Gemini API key for P.E.D.R.O. features

## Install and run locally

Clone the repository and enter the project directory:

```powershell
git clone https://github.com/HAHAHAAHA172/SHARE.git
cd SHARE
```

Install dependencies:

```powershell
npm.cmd install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and provide the required values:

```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

For local development, `VITE_API_BASE_URL` can remain empty. The Vite
development server proxies `/api` and `/uploads` to the API on port `3001`.

Start the frontend and API together:

```powershell
npm.cmd run dev
```

Open the frontend at [http://localhost:5173](http://localhost:5173). The API
health endpoint is available at
[http://localhost:3001/api/health](http://localhost:3001/api/health).

Stop the development processes with `Ctrl+C`.

### Start services separately

```powershell
npm.cmd run dev:client
npm.cmd run dev:server
```

To run only the API without watch mode:

```powershell
npm.cmd start
```

## Environment variables

The complete template is in [.env.example](./.env.example). Important values:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Gemini credential |
| `GEMINI_MODEL` | Optional model override for chat and quizzes |
| `VITE_SUPABASE_URL` | Public Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase browser key |
| `SUPABASE_SECRET_KEY` | Optional server-only admin operations key |
| `APP_ORIGINS` | Allowed frontend origins in production |
| `AUTH_REDIRECT_URL` | Supabase password recovery redirect |
| `DATA_DIR` | Persistent local fallback data directory |
| `UPLOADS_DIR` | Persistent local fallback upload directory |
| `UPSTASH_REDIS_REST_URL` | Optional distributed cache URL |
| `UPSTASH_REDIS_REST_TOKEN` | Optional distributed cache token |

Never expose `GEMINI_API_KEY`, `SUPABASE_SECRET_KEY`, or Redis tokens through a
`VITE_` variable or commit them to Git.

Without Supabase, the local fallback supports development-only resource
storage. Without a Gemini key, the main resource features still work but
P.E.D.R.O. is unavailable.

## Project structure

```text
src/
  App.jsx                 Frontend shell and hash-based navigation
  chatbot/                P.E.D.R.O. UI, streaming chat, quizzes, history
  core/                   Feed, resources, profiles, settings, and admin UI
  security/               Auth, upload validation, AI limits, and client security
  shared/                 Frontend API and shared utilities
server/
  app.js                  Express middleware and route composition
  chatbot/                Chat, quiz, and conversation persistence routes
  core/                   Posts, social actions, profiles, saved items, and admin
  shared/                 Server cache and shared backend utilities
shared/
  quiz.js                 Shared quiz response validation
public/                   Static assets
server.js                 Backend startup and environment loading
vite.config.js            Frontend development server and API proxy
render.yaml               Render deployment blueprint
```

## Production build and checks

Build the frontend:

```powershell
npm.cmd run build
```

Run the available checks:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run check:bundle
git --no-pager diff --check
```

The production build is written to `dist/`. The backend serves the built
frontend when `NODE_ENV=production`.

## Deployment

The repository includes [render.yaml](./render.yaml) for Render. The
deployment must install development dependencies because Vite is required to
build the frontend:

```text
npm ci --include=dev && npm run build
```

Configure the required Supabase, Gemini, `APP_ORIGINS`, `DATA_DIR`, and
`UPLOADS_DIR` environment variables in Render. The local filesystem is
temporary on Render, so production resources should use Supabase Database and
Storage as the source of truth.

## Main API routes

```text
POST /api/chat
POST /api/quiz/generate
POST /api/quiz/generate-from-file
GET  /api/health
```

P.E.D.R.O. chat responses stream through Server-Sent Events. Uploaded quiz
documents are validated before being sent to Gemini, and quiz responses are
validated against the shared schema before reaching the browser.

## Security notes

- Keep all server credentials out of frontend code.
- Use exact HTTPS origins in production `APP_ORIGINS`.
- Configure Supabase authentication redirect URLs.
- Do not commit `.env`, uploads, runtime data, or build output.
- Apply the SQL policies and indexes under `src/security/database/` to the
  production Supabase project.
