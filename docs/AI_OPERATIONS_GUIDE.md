# TaskZen AI Operations Guide (Production Readiness)

Purpose: A precise, machine-friendly playbook so any AI/engineer can safely configure, deploy, and update TaskZen for production. All paths/envs are grounded in this repository.

Repo layout:
- Client (Next.js): `client/`
- Server (NestJS/Prisma): `server/`
- Prisma schema: `server/prisma/schema.prisma`
- Key docs: `docs/DEPLOYMENT.md`, `docs/env/ENV.*.example.md`, `docs/SMOKE_TESTS.md`

Global invariants (do not change without code audit):
- API prefix: `/api/v1` (set in `server/src/main.ts`)
- WebSocket namespace: `/realtime` (Socket.IO path `/socket.io`)
- Prisma uses pooled URL for runtime and direct URL for migrations.

---

## 0) Variables Dictionary (fill per environment)

Required (Server):
- NODE_ENV = "production"
- DATABASE_URL = "postgresql://<user>:<pass>@<pooled-host>/<db>?sslmode=require"
- DATABASE_URL_UNPOOLED = "postgresql://<user>:<pass>@<direct-host>/<db>?sslmode=require"
- JWT_SECRET = "<strong-random>"
- SESSION_SECRET = "<strong-random>"
- FRONTEND_URL = "https://<frontend-domain>"        # exact origin; no trailing slash
- CLIENT_URL = "https://<frontend-domain>"          # duplicate allowlist

Recommended (Server):
- ENABLE_RATE_LIMITING = true
- RATE_LIMIT_TTL = 60
- RATE_LIMIT_LIMIT = 100
- SEARCH_RATE_LIMIT_TTL = 60
- SEARCH_RATE_LIMIT_LIMIT = 30
- SETTINGS_FETCH_TIMEOUT_MS = 3000   # clamped 1000–15000; prefer 3000–5000 in prod
- DB_CONNECT_TIMEOUT_MS = 8000
- ENABLE_SWAGGER = false

Optional (Server):
- REDIS_URL = "redis://default:<password>@<host>:<port>/<db>"
- AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET, AWS_S3_BASE_URL

Required (Client):
- NEXT_PUBLIC_API_URL = "https://<backend-domain>/api/v1"
- NEXT_PUBLIC_WS_URL = "https://<backend-domain>/realtime"

---

## 1) Environment Setup (Dev/Staging/Prod)

- Create three isolated environments with distinct resources:
  - Postgres (e.g., Neon). Produce two connection strings: pooled (PgBouncer) and direct.
  - Redis (optional; for shared cache/WS adapter when scaling).
  - S3/object storage (optional; recommended for uploads in prod).
- Keep secrets in the hosting provider’s secret manager (do not commit).

References:
- `server/.env.example`
- `docs/env/ENV.server.production.example.md`
- `client/.env.example`
- `docs/env/ENV.client.production.example.md`

---

## 2) Database & Prisma

Source of truth: `server/prisma/schema.prisma`
- datasource `db`: `url=env("DATABASE_URL")`, `directUrl=env("DATABASE_URL_UNPOOLED")`

Procedure (per environment):
1. Set `DATABASE_URL` to pooled (“-pooler”) URL with `sslmode=require`.
2. Set `DATABASE_URL_UNPOOLED` to direct URL with `sslmode=require`.
3. In `server/`:
   ```bash
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   ```
Notes:
- Never run `prisma migrate reset` in production.
- Migrations must be committed to the repo before deploy.

---

## 3) Backend API (NestJS)

Paths & behavior: `server/src/main.ts`
- Global prefix `/api/v1`.
- WebSocket namespace `/realtime`; Socket.IO path `/socket.io`.
- CORS allowlist merges defaults + `FRONTEND_URL`/`CLIENT_URL`. In production, non-allowlisted origins are blocked.
- Security: Helmet, compression, cookie parser; `x-powered-by` disabled.
- Static uploads served at `/uploads/` from `UPLOAD_PATH`/`UPLOAD_DIR`.

Build & start (see `server/package.json`):
```bash
# in server/
npm ci
npm run build
npm run start:railway   # runs prisma migrate deploy, then node dist/main
```

Server env checklist (production):
- Set required and recommended variables from Section 0.
- Keep `ENABLE_SWAGGER=false`.
- Ensure `FRONTEND_URL` and `CLIENT_URL` exactly equal your frontend origin (https; no trailing slash).
- Tune `SETTINGS_FETCH_TIMEOUT_MS` to 3000–5000ms.

Performance notes (already implemented in code):
- System settings fetch: in-flight dedupe and immediate cache propagation on update.
- Admin analytics: short-lived TTL caches with in-flight dedupe; batched Prisma transactions.

Scaling WebSockets:
- Single instance: no additional work.
- Multi-instance: add a Socket.IO Redis adapter in code and set `REDIS_URL` (out-of-scope for this doc; plan a change request).

Healthcheck:
- Preferred path: `GET /api/v1/health` (verify implemented in your build; if not, use an existing status endpoint).

---

## 4) Frontend (Next.js)

Config: `client/next.config.js`
- Security headers added globally; HSTS only in production.
- Rewrites: `/api/v1/*` and `/uploads/*` proxy to backend origin inferred from `NEXT_PUBLIC_API_URL` (fallback to `NEXT_PUBLIC_WS_URL`).
- Images: allowed domains include `localhost` and hosts parsed from env URLs.

Build & deploy:
```bash
# in client/
npm ci
npm run build
# Deploy with your platform (Netlify/Vercel). Ensure envs are set BEFORE build.
```

Client env checklist (production):
- `NEXT_PUBLIC_API_URL=https://<backend-domain>/api/v1`
- `NEXT_PUBLIC_WS_URL=https://<backend-domain>/realtime`
- Use HTTPS. Mismatched or HTTP values will break rewrites/WS.

---

## 5) Domains, TLS, and CORS

- Attach custom domain(s) to frontend (and backend if publicly exposed).
- Enforce HTTPS; enable HSTS after validation.
- Set `FRONTEND_URL` and `CLIENT_URL` on the backend to the exact frontend origin (no trailing slash).
- Test that `fetch('/api/v1/health')` works from the frontend origin without CORS errors.

---

## 6) Object Storage (Optional, Recommended for Prod)

- Create S3 bucket (private by default). Configure CORS to allow your frontend origin.
- Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_S3_BASE_URL`.
- Prefer presigned uploads. Avoid relying on ephemeral disk in hosted environments.

---

## 7) Redis (Optional)

- Provision a Redis instance (e.g., Upstash/Redis Cloud).
- Set `REDIS_URL` (or discrete host/port/password/db vars).
- Use for shared cache across instances and for Socket.IO adapter if you add it.

---

## 8) CI/CD (Minimal Baseline)

- Client: install → typecheck → lint → build → preview deploy on PR; production deploy on main.
- Server: install → typecheck → lint → tests (unit/e2e) → build. On deploy: run `prisma migrate deploy` then start.
- See `docs/DEPLOYMENT.md` for a sample GitHub Actions workflow.

---

## 9) Post-Deploy Smoke Tests

Run `docs/SMOKE_TESTS.md`. Highlights:
- API reachability: direct backend and via frontend proxy `/api/v1/health`.
- CORS from frontend origin.
- WebSocket realtime: two clients viewing same board; moving lists/cards syncs instantly.
- Uploads work and URLs resolve (prefer S3).
- Logs: check Prisma slow queries (>500ms), WS/CORS errors.

---

## 10) Common Change Requests (AI Task Blocks)

A) Change frontend or backend domain
- Inputs: `<FRONTEND_DOMAIN>`, `<BACKEND_DOMAIN>`
- Update:
  - Server env: `FRONTEND_URL=https://<FRONTEND_DOMAIN>`, `CLIENT_URL=https://<FRONTEND_DOMAIN>`
  - Client env: `NEXT_PUBLIC_API_URL=https://<BACKEND_DOMAIN>/api/v1`, `NEXT_PUBLIC_WS_URL=https://<BACKEND_DOMAIN>/realtime`
- Rebuild & redeploy both apps.
- Validate: CORS OK, API proxy OK, WS connects to `/realtime`.

B) Increase rate limits
- Inputs: `RATE_LIMIT_TTL`, `RATE_LIMIT_LIMIT`, `SEARCH_RATE_LIMIT_*`
- Update server env values; restart backend.
- Validate: heavy but legitimate traffic is no longer throttled.

C) Tighten timeouts due to slow DB
- Inputs: `SETTINGS_FETCH_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS`
- Update server envs; restart.
- Validate: fewer timeouts; watch logs for slow queries to add indexes if needed.

D) Switch uploads to S3
- Inputs: AWS credentials, bucket, region, base URL
- Set AWS envs (Section 6), redeploy server and client (update `images.domains` if needed).
- Validate: new uploads go to S3; links resolve; no 403 from bucket CORS.

E) Scale WebSockets across instances
- Inputs: `REDIS_URL`
- Plan: add Socket.IO Redis adapter in code, configure `REDIS_URL`, deploy multiple replicas.
- Validate: clients on different instances receive events; no reconnect loops.

---

## 11) Safety & Security

- Keep `ENABLE_SWAGGER=false` in production.
- Validate all DTOs (global `ValidationPipe` configured in `server/src/main.ts`).
- Helmet + compression are enabled; do not disable in prod.
- Rotate `JWT_SECRET`/`SESSION_SECRET` periodically.
- Do not store secrets in the repo or client-side code.

---

## 12) Rollback & DR

- DB: enable automatic backups and (ideally) point-in-time recovery. Test restore to staging periodically.
- Frontend/Backend: use your platform’s rollback features to revert to a known-good build.
- Keep migrations backward-compatible where possible to ease rollbacks.

---

## 13) Quick Commands Reference

Prisma (server/):
```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Server build/start (server/):
```bash
npm run build
npm run start:railway
```

Client build (client/):
```bash
npm run build
```

---

## 14) Pointers to Source of Truth

- API prefix, security, CORS logic: `server/src/main.ts`
- Prisma datasource URLs: `server/prisma/schema.prisma`
- Next.js rewrites, headers, images: `client/next.config.js`
- Env examples: `docs/env/ENV.server.production.example.md`, `docs/env/ENV.client.production.example.md`
- Deployment overview: `docs/DEPLOYMENT.md`
- Smoke tests: `docs/SMOKE_TESTS.md`

This document is intentionally concise, actionable, and idempotent for AI execution. Always validate changes with smoke tests after deploy.
