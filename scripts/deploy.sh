#!/usr/bin/env bash
# Production deploy for SmartPOS (Fastify backend + Vite frontend), run on the server.
#
#   GitHub Actions: .github/workflows/deploy.yml syncs the code first, then runs this with SKIP_PULL=1.
#   By hand:        cd /home/pceaserver/SmartPOS && bash scripts/deploy.sh
#
# Order is chosen so a failure part-way leaves the live site running the previous version:
#   1. sync code (unless SKIP_PULL=1)       5. build backend
#   2. install backend deps                 6. build frontend into dist-next, then swap it in
#   3. back up the database (pg_dump)       7. restart the API under pm2 (new start command)
#   4. apply schema changes (additive only) 8. health check, or fail the deploy loudly
#
# Server-only files are never in git and are left alone: backend/.env, backend/.env.local, frontend/.env.
# Options (environment variables):
#   SKIP_PULL=1        code is already at the right commit (the workflow does this)
#   SKIP_DB_BACKUP=1   don't pg_dump first (not recommended)
#   ALLOW_DESTRUCTIVE_SCHEMA=1  apply schema changes that drop tables/columns (after a manual review!)
set -euo pipefail

APP_DIR="${APP_DIR:-/home/pceaserver/SmartPOS}"
BRANCH="${DEPLOY_BRANCH:-master}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
PM2_NAME="smartpos-backend"

log() { echo -e "\n==> $*"; }
fail() { echo -e "\nERROR: $*" >&2; exit 1; }

cd "$APP_DIR"
log "SmartPOS deploy ($(git rev-parse --short HEAD 2>/dev/null || echo '?') on ${BRANCH}) in ${APP_DIR}"

[[ -f backend/.env ]] || fail "backend/.env is missing. Create it on the server before deploying."

# ── 0. Enough disk for installs, builds and a database dump ──────────────────────────────────
free_mb=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
(( free_mb >= 700 )) || fail "Only ${free_mb} MB free on disk; need at least 700 MB. Free some space (old logs, ~/backups) first."

# ── 1. Code ────────────────────────────────────────────────────────────────────────────────
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  log "Fetch latest from GitHub"
  git fetch origin
  git reset --hard "origin/${BRANCH}"
fi
log "Deploying $(git log -1 --format='%h %s')"

# ── 2. Backend dependencies ────────────────────────────────────────────────────────────────
log "Backend: install dependencies"
cd "$APP_DIR/backend"
npm ci --no-audit --no-fund

# DATABASE_URL as the backend sees it (backend/.env), minus Prisma-only query params pg_dump rejects.
DB_URL=$(node -e '
  require("dotenv").config({ path: ".env", quiet: true });
  const u = new URL(process.env.DATABASE_URL);
  for (const p of ["schema", "connection_limit", "pool_timeout", "pgbouncer", "connect_timeout", "statement_cache_size"]) u.searchParams.delete(p);
  process.stdout.write(u.toString());
')

# ── 3. Database backup ─────────────────────────────────────────────────────────────────────
if [[ "${SKIP_DB_BACKUP:-0}" != "1" ]]; then
  log "Back up the database before changing anything"
  mkdir -p "$BACKUP_DIR"
  dump="$BACKUP_DIR/smartpos-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump --format=custom --no-owner --file="$dump" "$DB_URL" || fail "Database backup failed; nothing was changed. (Set SKIP_DB_BACKUP=1 only if you have another backup.)"
  echo "    saved $dump ($(du -h "$dump" | cut -f1))"
  # keep the 5 newest
  ls -1t "$BACKUP_DIR"/smartpos-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

# ── 4. Schema ──────────────────────────────────────────────────────────────────────────────
log "Database schema: check what would change"
npx prisma generate >/dev/null
schema_sql=$(npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script)
if echo "$schema_sql" | grep -qiE '^\s*-- This is an empty migration'; then
  echo "    no changes"
else
  echo "$schema_sql" | grep -E '^\s*(CREATE|ALTER|DROP)' | sed 's/^/    /' | head -40
  if echo "$schema_sql" | grep -qiE 'DROP (TABLE|COLUMN|TYPE|SCHEMA)|ALTER COLUMN .* (SET DATA )?TYPE|TRUNCATE'; then
    [[ "${ALLOW_DESTRUCTIVE_SCHEMA:-0}" == "1" ]] || fail "This schema change would drop or retype data (see above). Review it, then re-run with ALLOW_DESTRUCTIVE_SCHEMA=1. Nothing was changed."
  fi
  # Only additive changes reach this point. Prisma still asks for --accept-data-loss when it adds a
  # unique constraint, even on a brand-new empty column, so it is passed here after the check above.
  npx prisma db push --skip-generate --accept-data-loss
fi

# ── 5. Backend build ───────────────────────────────────────────────────────────────────────
log "Backend: build"
npm run build

# ── 6. Frontend build (swapped in only when it succeeds, so the site never serves a half build) ──
log "Frontend: install + build"
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
rm -rf dist-next
npx vite build --outDir dist-next --emptyOutDir
rm -rf dist-old
[[ -d dist ]] && mv dist dist-old
mv dist-next dist
rm -rf dist-old

# ── 7. Restart the API ─────────────────────────────────────────────────────────────────────
log "Restart backend (PM2)"
cd "$APP_DIR/backend"
current=$(pm2 jlist 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    try { const p = JSON.parse(s).find(x => x.name === process.argv[1]); process.stdout.write(p ? String(p.pm2_env.pm_exec_path) : ""); } catch { }
  });' "$PM2_NAME")
if [[ -n "$current" && "$current" != *"dist/server.js" ]]; then
  # Old system was started as `bash -c "npx ts-node index.ts"`; replace it with the new definition.
  echo "    replacing old process definition ($current)"
  pm2 delete "$PM2_NAME"
fi
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

# ── 8. Health check ────────────────────────────────────────────────────────────────────────
log "Health check"
port=$(node -e 'require("dotenv").config({ path: ".env", quiet: true }); process.stdout.write(process.env.PORT || "5000")')
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    echo "    API is up on port ${port}"
    pm2 status "$PM2_NAME"
    log "Deploy complete: $(git -C "$APP_DIR" log -1 --format='%h %s')"
    echo "Site: https://betterfork.millenium.co.ke"
    exit 0
  fi
  sleep 2
done

echo "Last API log lines:" >&2
pm2 logs "$PM2_NAME" --lines 60 --nostream >&2 || true
fail "The API did not answer /health within 60 s. The database backup is in $BACKUP_DIR."
