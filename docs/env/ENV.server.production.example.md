# Server (Railway) Production Environment Example

Copy these into Railway → Variables. Replace placeholders with real values.

```bash
# Core
NODE_ENV=production
# PORT is provided by Railway; no need to set unless overriding

# Database (Neon)
DATABASE_URL=postgresql://<user>:<pass>@<neon-pooler-host>/<db>?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://<user>:<pass>@<neon-direct-host>/<db>?sslmode=require

# Auth
JWT_SECRET=<strong-random-secret>
SESSION_SECRET=<strong-random-secret>

# CORS / WebSocket allowlist (must be your Netlify URL, https, no trailing slash)
FRONTEND_URL=https://<your-netlify-site>.netlify.app
CLIENT_URL=https://<your-netlify-site>.netlify.app

# Rate limiting (per node)
ENABLE_RATE_LIMITING=true
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=100
SEARCH_RATE_LIMIT_TTL=60
SEARCH_RATE_LIMIT_LIMIT=30

# Timeouts
SETTINGS_FETCH_TIMEOUT_MS=3000
DB_CONNECT_TIMEOUT_MS=8000

# Swagger
ENABLE_SWAGGER=false

# Optional: Redis cache (and for Socket.IO adapter when scaling)
# REDIS_URL=redis://default:<password>@<host>:<port>/<db>
# REDIS_HOST=<host>
# REDIS_PORT=6379
# REDIS_PASSWORD=<password>
# REDIS_DB=0

# Optional: AWS S3 for uploads (recommended in production)
# AWS_ACCESS_KEY_ID=<key>
# AWS_SECRET_ACCESS_KEY=<secret>
# AWS_REGION=<region>
# AWS_S3_BUCKET=<bucket>
# AWS_S3_BASE_URL=https://<bucket>.s3.<region>.amazonaws.com
```
