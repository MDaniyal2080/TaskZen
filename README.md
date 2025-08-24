# TaskZen – Minimal Kanban Task App

## Requirements

- Node.js 18+
- npm 9+ (bundled with Node)
- PostgreSQL 13+

Optional:
- Redis 6+ (for caching/rate limiting; not required for local dev)

## Setup

1) Copy environment files

Windows (PowerShell):
```powershell
# From repo root
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env.local
```

macOS/Linux:
```bash
# From repo root
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

2) Install dependencies
```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

3) Prepare database (server)
```bash
# Run inside server/
npx prisma generate
npx prisma migrate dev --name init
# Optional tools
npx prisma studio
# Optional seed (creates admin user admin@gmail.com / admin@gmail.com)
npm run db:seed
```

## Run

Start each app in its own terminal:
```bash
# Server (in server/, http://localhost:3001)
npm run start:dev

# Client (in client/, http://localhost:3000)
npm run dev
```

