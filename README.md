# SmartPOS

School cafeteria point-of-sale: student wallets, M-Pesa (KopoKopo) payments, kiosk ordering,
fingerprint enrolment, inventory, finance and staff attendance.

| Folder | Stack |
|---|---|
| `backend/` | Fastify 5, TypeScript, Prisma 6 (PostgreSQL), socket.io |
| `frontend/` | React + Vite + Tailwind |

## Backend

```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, KopoKopo, Supabase storage, SMS/mail
npm install
npx prisma db push          # create/update tables
npm run dev                 # http://localhost:5000 (reloads on change)
```

Production:

```bash
npm ci
npm run build               # prisma generate + tsc -> dist/
npm start                   # node dist/server.js
```

Requires **Node.js 20+**.

### Layout

```
backend/
  src/
    server.ts               starts the server (loads .env first via lib/env)
    app.ts                  Fastify setup: body parsing, CORS, hooks, error handling, route registration
    lib/                    env, socket.io, request types
    middleware/auth.ts      JWT auth hooks: ensureAuthenticated / ensureAdmin / ensureFinanceOrAdmin
    modules/<name>/         one route plugin per API area, mounted at /api/<name>
    services/               business logic shared across modules (wallets, KopoKopo, fingerprints, backup, ...)
  prisma/                   schema.prisma and seed.ts
  scripts/                  one-off maintenance scripts (run with `npx tsx scripts/<file>.ts`)
```

### Conventions

- Protect a route with an auth hook: `app.get('/x', { onRequest: ensureAdmin }, handler)`.
  Auth hooks run on `onRequest`, so unauthorised requests are rejected before their body is read.
- Errors use `{ error: string }` (auth, 404, bad JSON); most handlers return `{ message: string }`.
- JSON is the only body type parsed. `/api/menu/upload-image` takes `multipart/form-data` (field `image`).
- `/api/kopokopo/*` requests keep the raw body (`req.rawBody`) for webhook signature checks.
- socket.io runs on the same port; route handlers reach it through `req.server.io`.

### Database backup and restore

```bash
npm run db:backup                                    # -> backups/smartpos-backup-<timestamp>.json
npm run db:restore -- backup.json --dry-run          # validate only
npm run db:restore -- backup.json --mode=replace --yes
```

The same is available in the admin UI under Backup & Restore.

## Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_URL etc.
npm install
npm run dev                 # http://localhost:5173
npm run build               # -> dist/
```

## Migrating from the Express backend

The API is unchanged: same URLs, request bodies, responses and status codes, so the frontend works
without edits. It was checked against the Express backend side by side (73 requests compared). The only
intended differences:

- Invalid JSON bodies get `400 { "error": "..." }` instead of an HTML error page with a stack trace.
- `req.ip` is the real client address behind nginx (`X-Forwarded-For` is trusted from loopback only).
- Preflight requests from origins that aren't allowed get 404 instead of 204; neither response has CORS headers, so browsers block both.
- The start command is now `npm run build && npm start` (compiled JavaScript) instead of `ts-node`.
