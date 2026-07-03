import API from "@/services/api";
import { io, Socket } from "socket.io-client";

export type StkPurpose = "wallet_topup" | "pos_sale" | "general";

export type StkPushOptions = {
  phone: string;
  amount: number;
  description?: string;
  studentId?: string;
  purpose?: StkPurpose;
  items?: { menuItemId: string; quantity: number }[];
  useAuth?: boolean;
};

export type StkPaymentResult = {
  status: string;
  amount?: number;
  currency?: string;
  reference?: string;
  transactionReference?: string;
  phone?: string;
  walletCredited?: boolean;
  posCompleted?: boolean;
  posReceiptNo?: string;
  posTransactionId?: string;
  purpose?: string;
};

function resolveSocketUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const socketUrl = (import.meta.env.VITE_SOCKET_URL || "").toString();
  if (socketUrl) return socketUrl;
  if (apiUrl && !apiUrl.startsWith("/")) return apiUrl.replace(/\/?api\/?$/, "");
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }
  return window.location.origin;
}

export async function initiateStkPushAndWait(
  opts: StkPushOptions,
  onAwaiting?: () => void,
): Promise<StkPaymentResult> {
  const payload: Record<string, unknown> = {
    phone: opts.phone,
    amount: opts.amount,
    description: opts.description,
  };
  if (opts.studentId) payload.studentId = opts.studentId;
  if (opts.purpose) payload.purpose = opts.purpose;
  if (opts.items) payload.items = opts.items;

  const requestConfig = opts.useAuth === false ? { skipAuthRedirect: true as const } : undefined;
  const { data: pushData } = await API.post("/kopokopo/stkpush", payload, requestConfig);
  const paymentLocation = pushData?.location as string | undefined;
  if (!paymentLocation) throw new Error("No payment location returned");

  onAwaiting?.();

  return new Promise((resolve, reject) => {
    const socket: Socket = io(resolveSocketUrl(), { transports: ["polling", "websocket"] });
    let settled = false;

    const finish = (result: StkPaymentResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      window.clearTimeout(hardTimeout);
      window.clearInterval(pollInterval);
      socket.off("kopokopo_update");
      socket.disconnect();
    };

    socket.emit("join_kopokopo", { location: paymentLocation });
    socket.on("kopokopo_update", (data: StkPaymentResult) => {
      const status = (data?.status || "").toLowerCase();
      if (status && status !== "pending") finish(data);
    });

    const pollInterval = window.setInterval(async () => {
      try {
        const { data } = await API.get<StkPaymentResult>("/kopokopo/status", {
          params: { location: paymentLocation },
          ...requestConfig,
        });
        const status = (data?.status || "").toLowerCase();
        if (status && status !== "pending") finish(data);
      } catch {
        /* ignore poll errors */
      }
    }, 5000);

    const hardTimeout = window.setTimeout(() => {
      fail(new Error("Payment timed out. Check your M-Pesa messages and try again."));
    }, 180_000);
  });
}
