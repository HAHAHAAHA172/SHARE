# S.H.A.R.E. Change History

This file summarizes the major changes recorded in the Git history. It is a human-readable overview rather than a replacement for the commit log.

## 2026-11-05

- `aa2b3a1` — Added the unauthorized-admin fallback so non-admin users do not remain on the moderation screen.
- `6870043` — Added admin moderation security refinements, including protected moderation actions and UI changes.

## 2026-11-04

- `85b32fa` — Added persistent notifications for pending, approved, rejected, liked, and commented posts.
- `8718f9f`, `a5e9372` — Fixed notification panel positioning and visibility.
- `23e7ea2` — Replaced account-switch/create-account controls in the profile popup with logout.
- `29118ae` — Moved profile editing into the profile menu and removed the redundant home login button.
- `3e08f57` — Fixed the course selector behavior.
- `2ec96da` — Fixed admin post request routing and logged-in landing-page behavior.
- `1cddd53` — Added the protected admin moderation page, server authorization, moderation SQL, and audit logging.
- `ac9a6e5` — Adjusted the application shell and logo assets.
- `d7ff4e8` — Added profile customization for course, year level, and avatar uploads.
- `ce25b39` — Added a local manual-testing sandbox and profile uniqueness validation.

## 2026-11-02

- `f52927e` — Added saved P.E.D.R.O. conversations per user with Supabase persistence and RLS.
- `4fa1f4a` — Added feed refresh behavior for newer posts and reactions.
- `1ad2313` — Rebuilt the newsfeed interactions with persistent likes, comments, post details, and chatbot optimization.
- `9728a04` through `5e9e05c` — Added and refined PDF preview, first-page rendering, scrolling, downloading, and attachment presentation.
- `d072d3a` — Applied feed and chatbot fixes and cleanup.

## 2026-11-01

- `f34b62d` — Combined the core app and chatbot codebase, established the main Vite/Express structure, and added the initial security and Supabase skills/configuration.

## Earlier foundation

- `ec2769b` — Added Supabase-backed posts and materials storage, storage metadata, protected downloads, and resource tests (`v0.447`).
- Earlier commits established the authentication flow, landing page, chatbot, quiz generation, profile/settings screens, and initial feed UI.

## Current verification notes

- Admin authorization is enforced server-side.
- Moderation actions are audited in `moderation_actions` after the Supabase SQL setup is run.
- Notifications require `src/security/database/notifications.sql` to be executed in the correct Supabase project.
- The complete commit-by-commit record remains available through `git log`.
