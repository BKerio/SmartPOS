import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { clearAuthSession } from "@/services/authStorage";

declare module "axios" {
  export interface AxiosRequestConfig {
    skipAuthRedirect?: boolean;
  }
}

const defaultBaseUrl = import.meta.env.PROD
  ? "https://api.smartpos.com/api"
  : "http://localhost:5000/api";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || defaultBaseUrl,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      clearAuthSession();
      if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

/*
 * ── Instant page switches ────────────────────────────────────────────────────────────────────────
 * Pages fetch their data on mount. Coming back to a page you just looked at shouldn't wait for the
 * network again, so GET responses for the shared list endpoints are kept briefly in memory and replayed
 * when a page mounts right after a navigation. Anything else (Refresh buttons, polling, a page that
 * re-fetches after a save) always goes to the server, and any successful change made from this browser
 * clears the whole cache, so you never see your own edit missing.
 * Identical GETs in flight at the same moment share one request.
 */
const CLIENT_CACHE_MS = 60_000;
const NAVIGATION_WINDOW_MS = 2_000;
const CLIENT_CACHEABLE = [
  /^\/students$/,
  /^\/parents$/,
  /^\/users$/,
  /^\/inventory\/(items|suppliers|movements)$/,
  /^\/pos\/(receipts|sales\/summary)$/,
  /^\/finance\/(summary|expenses|overview)$/,
  /^\/audit\/events/,
  /^\/invoices(\/waiters)?$/,
  /^\/reports\/daily$/,
  /^\/procurement\/ledger$/,
  /^\/admin\/(dashboard|backup\/summary)$/,
];

type CachedResponse = { at: number; response: AxiosResponse };
const clientCache = new Map<string, CachedResponse>();
const inFlight = new Map<string, Promise<AxiosResponse>>();
let navigatedAt = 0;

/** Called on every route change (see App.tsx): requests in the next moment may be served from memory. */
export function markNavigation(): void {
  navigatedAt = Date.now();
}

export function clearApiCache(): void {
  clientCache.clear();
}

const baseAdapter = axios.getAdapter(API.defaults.adapter ?? axios.defaults.adapter);

function cacheKey(config: InternalAxiosRequestConfig): string | null {
  const url = String(config.url || "");
  if (!CLIENT_CACHEABLE.some((re) => re.test(url))) return null;
  const token = localStorage.getItem("token") || "";
  return `${token.slice(-24)}|${url}|${JSON.stringify(config.params ?? {})}`;
}

API.defaults.adapter = async (config) => {
  const method = (config.method || "get").toLowerCase();
  if (method !== "get") {
    const response = await baseAdapter(config);
    clientCache.clear();
    return response;
  }

  const key = cacheKey(config);
  if (!key) return baseAdapter(config);

  const cached = clientCache.get(key);
  const justNavigated = Date.now() - navigatedAt < NAVIGATION_WINDOW_MS;
  if (cached && justNavigated && Date.now() - cached.at < CLIENT_CACHE_MS) {
    // The adapter returns the raw body; axios parses it afterwards, so every caller gets its own copy.
    return { ...cached.response, config };
  }

  const pending = inFlight.get(key);
  if (pending) return { ...(await pending), config };

  const request = baseAdapter(config)
    .then((response) => {
      if (response.status === 200) clientCache.set(key, { at: Date.now(), response });
      return response;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

/** Warm the cache for a page about to be opened (sidebar hover). Errors are ignored. */
export function prefetch(url: string): void {
  API.get(url).catch(() => {});
}

export default API;
