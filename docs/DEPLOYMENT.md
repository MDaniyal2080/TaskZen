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
  - Healthcheck: set Railway Healthcheck Path to `/api/v1/health` for accurate container health reporting.
  - Proxies: app trusts `X-Forwarded-*` headers in production; no extra config needed.
  
  ### WebSocket connection/auth details
  - Base URL: set `NEXT_PUBLIC_WS_URL` to your backend origin with `/realtime` (e.g., `https://<railway>/realtime`). The client ensures the `/realtime` suffix if missing.
  - Path: Socket.IO path is `/socket.io`.
  - Allowed origins: CORS/WS allowlist comes from `FRONTEND_URL` and `CLIENT_URL` envs.
  - Authentication tokens accepted by the server (`server/src/modules/auth/guards/ws-jwt.guard.ts`):
    - `handshake.auth.token` (preferred)
    - `?token=...` query parameter
    - `Authorization: Bearer <JWT>` header
  - The client (`client/src/store/socket-store.ts`) sends the JWT in both `auth` and `query`, sets `withCredentials: true`, `path: '/socket.io'`, and uses transports `['polling','websocket']`.
  - Example:
    ```js
    import { io } from 'socket.io-client';
    const token = '<JWT>';
    const socket = io('https://<railway>/realtime', {
      path: '/socket.io',
      withCredentials: true,
      auth: { token },
      query: { token },
      transports: ['polling','websocket'],
    });
    ```

## 4) Netlify (Frontend)
- Site settings → Environment:
  - `NEXT_PUBLIC_API_URL=https://<your-railway-app-domain>/api/v1`
  - `NEXT_PUBLIC_WS_URL=https://<your-railway-app-domain>/realtime`
- Build:
  - Base directory: `client/`
  - Build command: `npm run build`
  - Publish: `.next` (auto-detected by Netlify for Next.js)
- Use the final Netlify URL for `FRONTEND_URL` and `CLIENT_URL` on the server.
  
  Security headers and rewrites (already configured in `client/next.config.js`):
  - Security headers sent on all routes: `X-Content-Type-Options=nosniff`, `X-Frame-Options=DENY`, `Referrer-Policy=no-referrer`. In production only, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
  - Rewrites: `/api/v1/*` and `/uploads/*` are proxied to your backend origin. The origin is inferred from `NEXT_PUBLIC_API_URL` (or `NEXT_PUBLIC_WS_URL` fallback), so keep those envs accurate.
  - Images: allowed domains include `localhost` and `res.cloudinary.com`. If you use S3, add your bucket domain to `images.domains`.

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

## 7) CI/CD (GitHub Actions)
- Connect your GitHub repository to both Railway (server) and Netlify (client) for auto-deploys on push to `main`.
- Optional: add a CI workflow to lint/build both apps before the platforms deploy.

Example GitHub Actions workflow (save as `.github/workflows/ci.yml`):

```yaml
name: CI
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - name: Install client deps
        run: npm ci
        working-directory: client
      - name: Install server deps
        run: npm ci
        working-directory: server
      - name: Lint client
        run: npm run lint
        working-directory: client
      - name: Lint server
        run: npm run lint
        working-directory: server
      - name: Build client
        run: npm run build
        working-directory: client
      - name: Build server
        run: npm run build
        working-directory: server
```

Note: Railway and Netlify will still perform their own builds/deploys. This CI is for fast feedback.

## 8) Custom domains and SSL
- Netlify (frontend): add your custom domain in Site settings → Domain management. Ensure HTTPS is enabled.
- Railway (backend): add a custom domain (optional). If you do, update Netlify env:
  - `NEXT_PUBLIC_API_URL=https://<your-backend-domain>/api/v1`
  - `NEXT_PUBLIC_WS_URL=https://<your-backend-domain>/realtime`
- Update server env to match the final frontend origin exactly (no trailing slash):
  - `FRONTEND_URL=https://<your-frontend-domain>`
  - `CLIENT_URL=https://<your-frontend-domain>`
 - SSL: both Netlify and Railway auto-provision TLS certs for managed/custom domains. Allow some minutes for DNS + cert issuance.

## 9) Prisma migrations in production
- Application uses pooled `DATABASE_URL` and runs with PgBouncer; migrations should use `DATABASE_URL_UNPOOLED`.
- In Railway, the start process (see section above) should run `prisma migrate deploy` against the unpooled URL before starting the app.
- Never run `prisma migrate reset` in production. Use `migrate deploy` with committed migrations.

## 10) Monitoring and logging
- Check Railway logs for the API (watch for Prisma slow query warnings >500ms).
- Check Netlify deploy and function logs for the frontend.
- Add uptime checks for:
  - Backend health endpoint: `GET /api/v1/health` (returns 200 + JSON)
  - Frontend Netlify site URL
- Consider structured logging and an external log sink (e.g., Logtail, Datadog) as you scale.

## 11) Rollback strategy
- Railway: redeploy a previous successful build from the Deployments tab.
- Netlify: use Instant Rollback to restore a prior deploy for the site.
- Keep DB migrations backward-compatible when possible to simplify rollbacks.

## 12) Troubleshooting
- CORS/WS failures: confirm `FRONTEND_URL`/`CLIENT_URL` match your Netlify site (https; no trailing slash)
- 503/maintenance: check System Settings feature flags and `SETTINGS_FETCH_TIMEOUT_MS`
- Slow DB queries: inspect Railway logs (Prisma outputs >500ms warnings), add indexes if needed
- WebSocket not cross-instance: ensure only one replica or add Redis adapter
 - WebSocket handshake failures:
   - Ensure `NEXT_PUBLIC_WS_URL` points to your backend origin using https and the `/realtime` namespace.
   - Verify CORS allowlist on server matches your exact frontend origin.
   - If using a custom backend domain, update both `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`.
+  - Emergency degraded boot: if `ALLOW_BOOT_WITHOUT_DB=true` is set, check that it's disabled after use; not recommended for normal production.

## 13) Appendix: Environment variables reference
- Server (Railway) production example: `docs/env/ENV.server.production.example.md`
- Client (Netlify) production example: `docs/env/ENV.client.production.example.md`
