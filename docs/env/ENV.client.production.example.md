# Client (Netlify) Production Environment Example

Set these in Netlify → Site settings → Environment. Values are embedded at build time.

```bash
# Backend API (NestJS on Railway)
NEXT_PUBLIC_API_URL=https://<your-railway-app-domain>/api/v1

# WebSocket base (Socket.IO). https or wss are accepted.
NEXT_PUBLIC_WS_URL=https://<your-railway-app-domain>/realtime
```
