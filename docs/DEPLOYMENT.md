# TaskZen Production Deployment (Neon + Railway + Netlify)

This guide prepares TaskZen for a secure, reliable production launch.

## 1) Prerequisites
- Neon PostgreSQL project created
- Railway project (backend) created
- Netlify site (frontend) created
- Production secrets ready:
  - Neon pooled (PgBouncer) URL → `DATABASE_URL`
  - Neon direct (unpooled) URL → `DATABASE_URL_UNPOOLED`
  - Final Railway backend URL (https)
  - Final Netlify frontend URL (https)
  - `JWT_SECRET`, `SESSION_SECRET` (strong random strings)

## 2) Neon PostgreSQL
- Create a database and generate two connection strings:
  - Pooled (PgBouncer) → use for Prisma `DATABASE_URL`
  - Direct (unpooled) → use for `DATABASE_URL_UNPOOLED` (migrate engine)
- Ensure `sslmode=require` is present.
- Keep both URLs safe; you will paste them into Railway env vars.

## 3) Railway (Backend API + WebSocket)
- Environment variables (Project → Variables):
  - Required:
    - `NODE_ENV=production`
    - `DATABASE_URL=postgresql://<user>:<pass>@<neon-pooler-host>/<db>?sslmode=require`
    - `DATABASE_URL_UNPOOLED=postgresql://<user>:<pass>@<neon-direct-host>/<db>?sslmode=require`
    - `FRONTEND_URL=https://<your-netlify-site>.netlify.app`
    - `CLIENT_URL=https://<your-netlify-site>.netlify.app`
    - `JWT_SECRET=<strong-secret>`
    - `SESSION_SECRET=<strong-secret>`
  - Recommended:
    - `ENABLE_RATE_LIMITING=true`
    - `RATE_LIMIT_TTL=60`
    - `RATE_LIMIT_LIMIT=100`
    - `SEARCH_RATE_LIMIT_TTL=60`
    - `SEARCH_RATE_LIMIT_LIMIT=30`
    - `SETTINGS_FETCH_TIMEOUT_MS=3000` (3–5s is good)
    - `DB_CONNECT_TIMEOUT_MS=8000`
    - `ENABLE_SWAGGER=false`
  - Optional:
    - `REDIS_URL=<redis-url>` (and/or `REDIS_HOST/PORT/PASSWORD/DB`)
    - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET[, AWS_S3_BASE_URL]`
- Build/Start commands (Project → Deploy):
  - Build: `npm run build`
  - Start: `npm run start:railway` (this runs Prisma migrate deploy using `DATABASE_URL_UNPOOLED`, then starts the app)
- Notes:
  - API prefix is `/api/v1`
  - Socket.IO namespace is `/realtime` (path `/socket.io`)
  - If scaling to multiple instances, add a Socket.IO Redis adapter first. Until then, keep replicas=1.

## 4) Netlify (Frontend)
- Site settings → Environment:
  - `NEXT_PUBLIC_API_URL=https://<your-railway-app-domain>/api/v1`
  - `NEXT_PUBLIC_WS_URL=https://<your-railway-app-domain>/realtime`
- Build:
  - Base directory: `client/`
  - Build command: `npm run build`
  - Publish: `.next` (auto-detected by Netlify for Next.js)
- Use the final Netlify URL for `FRONTEND_URL` and `CLIENT_URL` on the server.

## 5) Post-deploy smoke tests
See `docs/SMOKE_TESTS.md` for detailed steps:
- API reachability (direct and via Netlify)
- CORS from the Netlify origin
- WebSocket real-time events across two clients
- Uploads (consider S3 in prod)
- Logs: watch Prisma warnings (>500ms) and CORS/WS errors

## 6) Security and reliability checklist
- Rotate `JWT_SECRET`/`SESSION_SECRET` before launch
- Keep `ENABLE_SWAGGER=false` in production
- Verify security headers in `client/next.config.js`
- Enable rate limiting (`ENABLE_RATE_LIMITING=true`)
- Consider Redis for cache and Socket.IO adapter when scaling
- Prefer S3 for file uploads over ephemeral disk

## 7) Troubleshooting
- CORS/WS failures: confirm `FRONTEND_URL`/`CLIENT_URL` match your Netlify site (https; no trailing slash)
- 503/maintenance: check System Settings feature flags and `SETTINGS_FETCH_TIMEOUT_MS`
- Slow DB queries: inspect Railway logs (Prisma outputs >500ms warnings), add indexes if needed
- WebSocket not cross-instance: ensure only one replica or add Redis adapter
