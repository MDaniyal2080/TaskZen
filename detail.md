# TaskZen – Minimal Kanban Task App (Details)

This document contains full details about the TaskZen project: tech stack, features, environment, and development notes. For quick setup and run steps, see README.md.

## Monorepo Structure

- `client/` – Next.js 14 app (App Router) with Tailwind, React Query, Zustand
- `server/` – NestJS 10 REST API at `/api/v1`, Prisma 5, PostgreSQL, Socket.IO
- `shared/` – Shared types

## Tech Stack

- Frontend: Next.js 14, React 18, TailwindCSS, @tanstack/react-query v5, Zustand
- Backend: NestJS 10, Prisma 5, PostgreSQL, Socket.IO, Swagger, Winston logging
- Auth: JWT (Bearer), CSRF protection for form endpoints (login/register)
- Realtime: Socket.IO namespace `/realtime` (path `/socket.io`)
- Files: Local `/uploads` served by server; Next.js rewrite proxies `/uploads/*` to backend

## Features (Highlights)

- Kanban boards with lists, cards, labels, comments, attachments, checklist, due dates, priorities
- Drag and drop with real-time updates and presence/typing indicators
- Admin panel: dashboard, analytics, moderation, revenue, settings
- Activities log with CSV export
- User settings including UI preferences and notifications
- Authentication with JWT, route guards, and role-based access (board roles, admin)

## Environment Variables

See example files for full list and defaults:

- Client: `client/.env.example`
  - `NEXT_PUBLIC_API_URL` (e.g., `http://localhost:3001/api/v1`)
  - `NEXT_PUBLIC_WS_URL` (e.g., `http://localhost:3001/realtime`)

- Server: `server/.env.example` (selected keys below)
  - Database: `DATABASE_URL`
  - Server: `PORT=3001`, `NODE_ENV`
  - CORS/URLs: `FRONTEND_URL`, `CLIENT_URL`
  - Auth: `JWT_SECRET`, `JWT_EXPIRES_IN`
  - Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (optional)
  - Storage: `UPLOAD_PATH`/`UPLOAD_DIR`, AWS S3 (optional) keys
  - Cache/Rate limiting: `REDIS_URL` (optional)
  - Misc: security/login attempt, analytics tokens (optional)

Next.js rewrites `/uploads/:path*` to the backend origin derived from `NEXT_PUBLIC_API_URL` (fallback to `NEXT_PUBLIC_WS_URL`). See `client/next.config.js`.

## Authentication & CSRF

- Bearer JWT in `Authorization: Bearer <token>` for authenticated API calls
- CSRF is enforced for login/register form posts
  - `GET /auth/csrf` issues a token and sets a `csrf-token` cookie
  - Client must send `x-csrf-token` header (matches cookie) on `POST /auth/login` and `POST /auth/register`
- With JWT present in Authorization header, CSRF checks are skipped for API routes

## Admin & Roles

- Admin API under `/admin/*` (JWT + ADMIN role)
- Admin pages:
  - `/admin`, `/admin/analytics`, `/admin/revenue`, `/admin/moderation`, `/admin/settings`
- Board roles: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` with backend enforcement (e.g., VIEWER read-only on cards)

## Revenue & Billing Status

- No real payment provider integration yet
- Transactions are DB-backed now (Prisma `Transaction` model)
  - Server endpoint `/admin/revenue/transactions` returns paginated, filtered data
  - Seed script populates ~120–150 transactions for demo
- Revenue metrics computed from Pro users and transactions; mock/stub fields may exist in analytics

## Database & Prisma

- Make sure PostgreSQL is running and `DATABASE_URL` is set
- Common commands (run inside `server/`):
  - Generate client: `npx prisma generate`
  - Migrate dev: `npx prisma migrate dev --name init`
  - Seed demo/admin: `npm run db:seed`
  - Inspect data: `npx prisma studio`

Seed creates or ensures an admin user: `admin@gmail.com / admin@gmail.com`, purges demo data, and ensures default system settings. See `server/prisma/seed.ts`.

## Realtime Notes

- Client Socket.IO connects to `NEXT_PUBLIC_WS_URL` (namespace `/realtime`, path `/socket.io`)
- Client code auto-rewrites localhost/127.0.0.1 to the current hostname when accessed across LAN
- Polling fallback is enabled to help with websocket upgrade failures

## Local URLs

- API base: `http://localhost:3001/api/v1`
- Swagger docs: `http://localhost:3001/api/docs`
- Web app: `http://localhost:3000`
- Uploads (proxied by Next.js): `/uploads/...`

## Scripts

- Server (`server/package.json`): `start:dev`, `build`, `start:prod`, `db:migrate`, `db:generate`, `db:seed`
- Client (`client/package.json`): `dev`, `build`, `start`, `lint`

## Notes & Limits

- Rate limiting, CORS, validation, sanitization, logging are enabled on the server
- Some analytics fields are placeholders; UI is hardened to render 0s safely
- Replace email/billing providers before production
