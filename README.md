# S.H.A.R.E + P.E.D.R.O

The academic resource app and study assistant share one React entry point and one Express API. The partner app's purple visual identity is retained, with separate core and chatbot modules.

## Run locally

Requires Node.js 24 or later (the test scripts use Node's in-process test runner).

From the project root, install dependencies once:

```powershell
npm.cmd install
```

Start both services:

```powershell
npm.cmd run dev
```

Open the Local URL printed by Vite (normally `http://localhost:5173`). Stop both services with Ctrl+C. The API uses port 3001 by default; Vite proxies `/api` and `/uploads` to it. `PORT` can change the API port, and Vite uses that environment value for its proxy target.

To start only the frontend, run `npm.cmd run dev:client`. To start only the API in watch mode, run `npm.cmd run dev:server`. `npm.cmd start` starts the API without watch mode.

The landing page supports a Continue button and an upward swipe. Use the home feed to publish/search resources, open details, save favorites, or launch P.E.D.R.O. Login and signup use Supabase email/password authentication; no passwords are stored by this application. You can browse directly through `http://localhost:5173/#/home`.

Resource links use `#/post-detail/<resource-id>`, so refreshes, direct links, and browser history resolve the matching resource. A missing resource shows a recovery link; temporary loading failures offer a retry.

Resource links use `#/post-detail/<resource-id>`, so refreshes, direct links, and browser history resolve the matching resource. A missing resource shows a recovery link; temporary loading failures offer a retry.

## Environment

The root `.env` file is ignored by Git. Required variable names have been added without replacing existing values.

- In `.env`, add your key to `GEMINI_API_KEY=`. The existing `GEMINI` variable also remains supported. Optional `GEMINI_MODEL` overrides the existing chatbot model; `PORT` defaults to 3001.
- `VITE_API_BASE_URL=` stays empty for local proxy requests. Set an explicit API origin only when hosting the API separately. Frontend variables prefixed with `VITE_` are public; keep API keys in the backend environment.
- Supabase signup confirmation and password recovery links use `AUTH_REDIRECT_URL`, which defaults to `http://localhost:5173/#/login` during local development. Add that exact URL under Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs, and set the Site URL to `http://localhost:5173` (not port 3000).

Restart the services after editing environment variables. Resource browsing and posting work without an AI key. P.E.D.R.O returns an explanatory setup error until a key is configured. Existing provider SDK calls and the default model were retained; live generation needs a valid key and a model available to your account.

## Code layout

```text
src/
  App.jsx             App navigation, demo profile, favorites, module composition
  core/pages/         Feed, resource creation/detail, landing, demo profile, settings
  core/assets/        Partner app logo
  chatbot/            Chat, streamed replies, uploads, quizzes, timer, math rendering
  shared/api.js       Shared API URL configuration
public/               Static assets
index.html            Vite HTML entry
vite.config.js        Frontend dev server and API proxy
server.js             Environment and server startup
server/app.js         Express module composition
server/core/posts.js  Persistent resource collection and uploaded files
server/chatbot/       Existing AI chat and quiz endpoints
test/                 Isolated API integration tests
data/                 Persistent resource data (created/used at runtime)
uploads/              Uploaded files (created/used at runtime)
```

Security controls live under `src/security/`. The server verifies Supabase access tokens, validates and bounds request data, limits API and AI usage, restricts uploads, applies security headers/CORS, and returns safe errors. See [`src/security/README.md`](src/security/README.md) for deployment checks and known limitations.

## Data and current behavior

- Posts persist in `data/posts.json`; attachments are stored in `uploads/`. Both are local runtime data and ignored by Git. Back these directories up if retaining posted resources.
- Favorites are saved in this browser's local storage and namespaced by the verified Supabase user ID. The optional Remember me choice controls the local auth session only.
- Comments are explicitly local to the open detail view and are not saved to the server yet.
- Chat/quiz state stays in memory while moving between the feed and P.E.D.R.O. A page reload resets it. Quiz timers pause while P.E.D.R.O is hidden.
- Opening a resource in P.E.D.R.O prefills its title/description. Its file is not automatically sent to AI; attach it manually to analyze its contents.
- Invalid post requests and failed saves show errors instead of creating a fake success. Empty feed and favorites views contain no fabricated records.

## Scripts and verification

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run lint
```

The build runs Vite and writes production assets to root `dist/`. Tests cover resource persistence/filtering/download/deletion, missing-key behavior, chat and quiz route compatibility with a stub provider, and fragmented streamed response handling. They do not call a live AI provider. Lint runs ESLint across the project.

Production builds are generated in `dist`. Set `NODE_ENV=production`, configure exact HTTPS `APP_ORIGINS`, persistent `DATA_DIR`/`UPLOADS_DIR`, and a trusted `TRUST_PROXY_HOPS` value. Serve the built directory through the backend or a host that forwards `/api` and `/uploads`; configure `VITE_API_BASE_URL` before building when the API is on another origin. This integration does not deploy the app.

The supplied ZIP's extracted source and the original chatbot snapshots remain under the ignored `.integration/` folder. The previous package folders and configuration files are preserved in `.integration/legacy-packages/`.
