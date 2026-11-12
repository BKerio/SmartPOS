// pm2 process definition for the API on the server (used by scripts/deploy.sh).
//   pm2 startOrReload ecosystem.config.cjs --update-env
// Settings come from backend/.env (and backend/.env.local), loaded by src/lib/env.ts at start-up.
module.exports = {
  apps: [
    {
      name: 'smartpos-backend',
      cwd: __dirname,
      script: 'dist/server.js',
      instances: 1, // one process: the in-memory caches and socket.io rooms assume a single instance
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
      kill_timeout: 8000,
      restart_delay: 2000,
      time: true,
    },
  ],
};
