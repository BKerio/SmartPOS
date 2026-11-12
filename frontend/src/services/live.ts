import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { resolveSocketUrl } from "@/services/kopokopoPayment";

/*
 * Live updates from the server over one shared socket.io connection.
 *
 * The server emits "collections:updated" once a new payment (M-Pesa, wallet, POS) has been folded into
 * the Collections report, so pages refetch exactly when there is something new: no polling while the
 * socket is up. If the socket drops (proxy, flaky network), useLiveRefresh falls back to a quiet refetch
 * every `fallbackMs`, and always refetches when the tab becomes visible again.
 */
let socket: Socket | null = null;
let users = 0;
const statusListeners = new Set<(connected: boolean) => void>();

function acquire(): Socket {
  if (!socket) {
    socket = io(resolveSocketUrl(), { transports: ["websocket", "polling"], reconnectionDelayMax: 10_000 });
    socket.on("connect", () => statusListeners.forEach((fn) => fn(true)));
    socket.on("disconnect", () => statusListeners.forEach((fn) => fn(false)));
  }
  users++;
  return socket;
}

function release() {
  users = Math.max(0, users - 1);
  if (users === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Calls `refresh` whenever the server reports new payments (and as a fallback, see above).
 * Returns whether the live connection is up, for a "Live" indicator.
 */
export function useLiveRefresh(
  refresh: () => void,
  { event = "collections:updated", fallbackMs = 30_000, enabled = true }: { event?: string; fallbackMs?: number; enabled?: boolean } = {},
): boolean {
  const [connected, setConnected] = useState(false);
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    const s = acquire();
    setConnected(s.connected);
    const onStatus = (up: boolean) => setConnected(up);
    statusListeners.add(onStatus);
    // Collapse bursts (several payments in a row) into one refetch.
    let timer: number | undefined;
    const onEvent = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => latest.current(), 250);
    };
    s.on(event, onEvent);
    // Catch up on anything missed while disconnected (reconnects only, not the first connect).
    s.io.on("reconnect", onEvent);
    return () => {
      window.clearTimeout(timer);
      s.off(event, onEvent);
      s.io.off("reconnect", onEvent);
      statusListeners.delete(onStatus);
      release();
    };
  }, [event, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => document.visibilityState === "visible" && latest.current();
    document.addEventListener("visibilitychange", onVisible);
    // Fallback polling only while the socket is down and the tab is visible.
    const id = window.setInterval(() => {
      if (!connected && document.visibilityState === "visible") latest.current();
    }, fallbackMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [connected, fallbackMs, enabled]);

  return connected;
}
