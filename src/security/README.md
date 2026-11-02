# Security and production readiness

This folder contains the security boundary for the application. The browser only receives Supabase's publishable key; Gemini and server configuration stay in the backend environment.

## Controls implemented

- Supabase access tokens are verified server-side with `auth.getUser`; client-supplied profile, owner, and role fields are ignored.
- Authentication endpoints have bounded input, generic login errors, non-enumerating recovery responses, and rate limits.
- API, authentication, AI, upload, and concurrent-request limits are enforced before expensive work.
- JSON payloads, text fields, histories, quiz sizes, files, MIME types, and file signatures are validated.
- Helmet headers, a restrictive CSP, exact-origin CORS, no-store auth responses, and safe production errors are enabled.
- Markdown HTML is disabled and math rendering is constrained; chatbot output is not treated as raw HTML.
- User resources are owner-checked for mutation and downloads are attachment responses. Upload directories are not public static paths.
- Public environment variables are allow-listed and production bundles are scanned for server secrets.

## Required deployment checks

1. Set `NODE_ENV=production`, exact HTTPS `APP_ORIGINS`, persistent `DATA_DIR` and `UPLOADS_DIR`, and the correct `TRUST_PROXY_HOPS`.
2. Configure Supabase Site URL and redirect URLs to match `AUTH_REDIRECT_URL`. Test login, signup confirmation, logout, and password recovery with a non-production account.
3. Run [`database/verify.sql`](database/verify.sql) in Supabase SQL Editor with administrator visibility. The publishable key cannot verify RLS, policies, grants, or security-definer functions.
4. Configure provider quotas/alerts and keep `GEMINI_API_KEY` server-only. Never put it in a `VITE_` variable.

## Known limitations

- Posts and uploaded files use local JSON/filesystem persistence. The in-memory rate-limit store and single-process persistence are suitable for one instance; use a shared database/rate-limit store before horizontal scaling.
- Existing legacy posts without an owner cannot be safely attributed automatically. Assign ownership through a controlled migration if those records must be mutable.
- Automated tests use mocked Supabase/provider responses; they do not create accounts, send email, or call Gemini.
- This project has no TypeScript source or type-check script, so TypeScript validation is not applicable.

The application should not be considered fully production-ready until the external Supabase SQL audit and real authentication flows have been completed.
