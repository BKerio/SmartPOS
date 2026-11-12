import dotenv from 'dotenv';
import path from 'path';

// Always load backend/.env (from src/lib or dist/lib), even when started from the repo root.
// Imported first by server.ts so every module sees the variables at load time.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
// Then the Neon variables (object storage credentials, branch) that `neon deploy` / `neon env pull`
// write to backend/.env.local (run `neon` commands from backend/). Values already set above, or in the
// real environment, win.
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });

export const PORT = Number(process.env.PORT) || 5000;
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://192.168.100.91:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter((o, i, arr) => o && arr.indexOf(o) === i);
