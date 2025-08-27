# Post-deployment Smoke Tests

Run these after deploying the backend (Railway) and frontend (Netlify).

## 1) API reachability
- Direct (Railway):
  - Open: `https://<railway>/api/v1/health` or `.../status` (whichever exists)
- Via Netlify proxy:
  - Open: `https://<netlify>/api/v1/health` – should proxy to backend without CORS errors

## 2) CORS validation
- From the Netlify site, log in and hit any API.
- In browser devtools Console, run:
```js
fetch('/api/v1/status', { credentials: 'include' })
  .then(r => r.status)
  .catch(console.error)
```
- Expect 200 or appropriate auth status; no CORS errors.

## 3) WebSocket real-time
- Open the same board on two browsers (or two devices) while logged in.
- Move a card/list in one. The other should update instantly via Socket.IO events.
- In DevTools → Network → WS, confirm connection to `/realtime` and no disconnect loops.

## 4) Uploads
- If using local uploads, remember Railway file system is ephemeral.
- Prefer S3: verify upload succeeds and URLs resolve.

## 5) Logs and performance
- Railway logs: watch for Prisma warnings (>500ms) and any 4xx/5xx spikes.
- If timeouts occur, increase `SETTINGS_FETCH_TIMEOUT_MS` to 5000.
- Adjust rate limits if legitimate traffic is throttled.

## 6) Common issues
- CORS blocked: ensure `FRONTEND_URL` and `CLIENT_URL` exactly match the Netlify origin (https, no trailing slash).
- WS not working behind multiple instances: run a single replica or add a Socket.IO Redis adapter.
- DB connection errors: verify Neon URLs and `sslmode=require`.
