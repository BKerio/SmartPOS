import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Receipt, FileJson, X, Copy, Check, Search, Filter, Wallet, UserPlus, AlertTriangle, ClipboardPlus, Phone, GraduationCap } from "lucide-react";
import FormModal, { FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { useLiveRefresh } from "@/services/live";
import LiveBadge from "@/components/page/LiveBadge";
import Loader from "@/components/ui/loader";
import { toast } from "@/services/toast";
import StudentPicker, { type StudentOption } from "@/components/StudentPicker";
import WalletAdjustModal from "@/components/WalletAdjustModal";
import { PageHeader, StatTiles, StatTile } from "@/components/page/Page";
import { PersonCell } from "@/components/page/DataTable";

type CollectionRow = {
  id?: string;
  source?: string;
  channel?: string;
  mpesaNumber: string;
  date: string;
  name: string;
  admNo: string;
  method: string;
  amount: number;
  attemptedAmount?: number;
  status: string;
  type: string;
  metadata: string;
  transactionRef?: string;
  walletCredited?: boolean;
  allocatable?: boolean;
  payload?: Record<string, unknown>;
};

type CollectionsSummary = {
  tillInflow: number;
  walletTopUps: number;
  cashSales: number;
  usage: number;
  recordCount: number;
  uniqueTillPayments?: number;
};

/** Shape of a paginated /finance/collections response (see backend services/collectionsQuery.ts). */
type CollectionsPageMeta = {
  page: number;
  limit: number;
  pages: number;
  total: number;
  totalAll: number;
  totals: { tillInflow: number; walletTopUps: number; cashSales: number; usage: number };
  sourceCounts: Record<SourceFilter, number>;
  summary: CollectionsSummary;
};

const PAGE_SIZE = 50;

function Pager({ page, pages, total, pageSize, loading, onPage }: {
  page: number; pages: number; total: number; pageSize: number; loading: boolean; onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
      <span className="text-gray-500">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="text-gray-500 tnum">Page {page} of {pages.toLocaleString()}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

type KopoSearchResult = {
  id: string;
  amount: number;
  phone: string;
  status: string;
  purpose: string;
  transactionReference: string;
  date: string;
  studentName: string | null;
  studentRegNo: string | null;
  allocatable: boolean;
};

const formatKes = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

const statusBadge = (status: string) => {
  const s = (status || "").toLowerCase();
  if (["success", "received", "complete", "completed", "paid"].includes(s)) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (["failed", "error", "reversed", "cancelled", "superseded"].includes(s)) {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-amber-100 text-amber-800";
};

type StatusFilter = "all" | "success" | "pending" | "failed";
type SourceFilter =
  | "all"
  | "till"
  | "stk"
  | "student_wallets"
  | "wallet_topup"
  | "wallet_usage"
  | "guest"
  | "cash"
  | "unallocated";

const SOURCE_FILTERS: { value: SourceFilter; label: string; hint: string }[] = [
  { value: "all", label: "All", hint: "Every collection record" },
  { value: "till", label: "Till (Buy Goods)", hint: "Lipa na M-Pesa till payments" },
  { value: "stk", label: "STK Push", hint: "Parent/guest STK payments" },
  { value: "student_wallets", label: "Student wallets", hint: "Top-ups and cafeteria usage" },
  { value: "wallet_topup", label: "Wallet top-ups", hint: "Money added to student wallets" },
  { value: "wallet_usage", label: "Wallet usage", hint: "Cafeteria purchases from wallets" },
  { value: "unallocated", label: "Unallocated till", hint: "Till money not yet assigned" },
  { value: "guest", label: "Guest POS", hint: "Guest M-Pesa & cash sales" },
  { value: "cash", label: "Cash only", hint: "Guest cash POS" },
];

const isWalletTopUpRow = (row: CollectionRow) =>
  (row.source === "kopo" && row.type === "wallet_topup") ||
  (row.source === "wallet" && row.type === "deposit");

const rowChannel = (row: CollectionRow): string => {
  const fromPayload = typeof row.payload?.channel === "string" ? row.payload.channel : "";
  if (fromPayload) return fromPayload;
  if (row.channel) return row.channel;
  if (row.source === "pos_cash") return "cash";
  if (row.source === "pos_mpesa" || (row.source === "kopo" && row.type === "pos_sale")) return "stk";
  if (row.source === "wallet") return "wallet";
  if (row.source === "kopo" && row.type === "wallet_topup") {
    return /till → student wallet|manual allocation/i.test(`${row.method} ${row.metadata}`)
      ? "wallet"
      : "stk";
  }
  if (row.source === "kopo") return "till";
  return "other";
};

const channelBadge = (channel: string) => {
  switch (channel) {
    case "till":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "stk":
      return "bg-indigo-50 text-indigo-700 border-indigo-100";
    case "wallet":
      return "bg-sky-50 text-sky-700 border-sky-100";
    case "cash":
      return "bg-amber-50 text-amber-800 border-amber-100";
    default:
      return "bg-gray-50 text-gray-600 border-gray-100";
  }
};

const channelLabel = (channel: string) => {
  switch (channel) {
    case "till":
      return "Till";
    case "stk":
      return "STK";
    case "wallet":
      return "Wallet";
    case "cash":
      return "Cash";
    default:
      return channel || "Other";
  }
};

const PayloadModal = ({
  rows,
  selectedId,
  onClose,
  onSelect,
}: {
  rows: CollectionRow[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.admNo, r.metadata, r.method, r.status, r.transactionRef, r.mpesaNumber]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const selected =
    rows.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  // The full KopoKopo JSON isn't part of the list (it's large); fetch it for the row being viewed.
  const [rawById, setRawById] = useState<Record<string, unknown>>({});
  const needsRaw = Boolean(selected?.id && selected.source === "kopo" && selected.payload?.kopoRawAvailable);
  useEffect(() => {
    const id = selected?.id;
    if (!needsRaw || !id || id in rawById) return;
    let cancelled = false;
    API.get<{ rawPayload: unknown }>(`/finance/collections/kopo/${id}/raw`)
      .then(({ data }) => !cancelled && setRawById((m) => ({ ...m, [id]: data.rawPayload })))
      .catch(() => !cancelled && setRawById((m) => ({ ...m, [id]: "Could not load the KopoKopo response." })));
    return () => {
      cancelled = true;
    };
  }, [needsRaw, selected?.id, rawById]);

  const json = selected?.payload
    ? JSON.stringify(
        (() => {
          const { kopoRawAvailable, ...rest } = selected.payload as Record<string, unknown>;
          if (!kopoRawAvailable) return rest;
          return { ...rest, kopokopo: selected.id && selected.id in rawById ? rawById[selected.id] : "Loading…" };
        })(),
        null,
        2,
      )
    : "No payload available for this record.";

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-brand flex items-center gap-2">
              <FileJson size={18} /> Transaction payloads
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {rows.length} records · metadata and Kopokopo responses
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <div className="md:w-2/5 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col min-h-0">
            <div className="p-3 border-b border-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, adm no, ref..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand outline-none"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 max-h-64 md:max-h-none">
              {filtered.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">No matches</p>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id || r.date}
                    type="button"
                    onClick={() => r.id && onSelect(r.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${
                      selected?.id === r.id ? "bg-page border-l-4 border-l-brand" : ""
                    }`}
                  >
                    <p className="font-semibold text-sm text-brand truncate">
                      {r.name || r.method || "Transaction"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.admNo ? `${r.admNo} · ` : ""}
                      {new Date(r.date).toLocaleString()}
                    </p>
                    <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full capitalize ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {selected && (
              <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/80 text-xs text-gray-600 shrink-0">
                <span className="font-semibold text-brand">{selected.name || "—"}</span>
                {selected.admNo && <span> · {selected.admNo}</span>}
                <span> · {selected.method}</span>
              </div>
            )}
            <div className="flex-1 overflow-auto p-4 bg-slate-950">
              <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap break-words">{json}</pre>
            </div>
            <div className="p-3 border-t border-gray-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={copyJson}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-brand border border-brand/20 rounded-lg hover:bg-brand/5"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const AllocateModal = ({
  payment,
  onClose,
  onSuccess,
}: {
  payment: { id: string; amount: number; transactionRef?: string; mpesaNumber?: string; date?: string };
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAllocate = async () => {
    if (!student) {
      toast.warning("Select a student", "Search and pick the student to top up");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await API.post(`/kopokopo/${payment.id}/allocate`, { studentId: student.id });
      toast.success(
        "Wallet topped up",
        `${data.studentName} (${data.studentRegNo}) · ${formatKes(data.amount)} · New balance ${formatKes(data.newBalance)}`,
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Allocation failed";
      toast.error("Could not allocate", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      icon={UserPlus}
      title="Allocate to a student"
      subtitle="Credit this till payment to a student's wallet."
      steps={[
        { id: "payment", label: "Payment", done: true },
        { id: "student", label: "Student", done: !!student },
      ]}
      statusLabel="Allocating"
      statusDetail={`${formatKes(payment.amount)}${student ? ` → ${student.name}` : ""}`}
      submitLabel="Top up wallet"
      submittingLabel="Topping up…"
      submitIcon={Wallet}
      submitting={submitting}
      submitDisabled={!student}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); handleAllocate(); }}
    >
      <FormSection id="payment" icon={Receipt} title="Payment">
        <div className="fm-summary">
          <b>{formatKes(payment.amount)}</b>
          <div className="col" style={{ gap: 2, marginLeft: "auto", textAlign: "right" }}>
            {payment.transactionRef && <span className="mono fm-hint">M-Pesa {payment.transactionRef}</span>}
            {payment.mpesaNumber && <span className="fm-hint">{payment.mpesaNumber}</span>}
            {payment.date && <span className="fm-hint">{new Date(payment.date).toLocaleString()}</span>}
          </div>
        </div>
      </FormSection>
      <FormSection id="student" icon={GraduationCap} title="Student">
        <StudentPicker selected={student} onSelect={setStudent} onClear={() => setStudent(null)} />
      </FormSection>
    </FormModal>
  );
};

const FindPaymentModal = ({
  onClose,
  onAllocate,
  onRegister,
}: {
  onClose: () => void;
  onAllocate: (payment: KopoSearchResult) => void;
  onRegister: (prefill?: { code?: string; amount?: string }) => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KopoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await API.get<KopoSearchResult[]>("/kopokopo/search", { params: { q } });
        setResults(data);
      } catch {
        setResults([]);
        toast.error("Search failed", "Could not search payments");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <FormModal
      icon={Search}
      title="Find an M-Pesa payment"
      subtitle="Search by M-Pesa code, phone number or reference, then allocate it to a student."
      statusLabel="Search"
      statusDetail={query.trim() ? `${results.length} result${results.length === 1 ? "" : "s"}` : ""}
      submitLabel="Register from SMS instead"
      submitIcon={ClipboardPlus}
      cancelLabel="Close"
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); onRegister(query.trim() ? { code: query.trim().toUpperCase() } : undefined); }}
    >
      <FormSection id="search" icon={Search} title="Search">
        <div className="field">
          <FieldLabel htmlFor="fp-q" hint="At least 2 characters">M-Pesa code, phone or reference</FieldLabel>
          <div className="input-icon">
            <input id="fp-q" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. QGH7XABCD or 2547…" autoFocus autoComplete="off" />
            <Search />
          </div>
        </div>
        {searching && <p className="fm-note">Searching…</p>}
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <div className="fm-preview">
            <div className="col" style={{ gap: 4 }}>
              <b>No payment found for <span className="mono">{query.trim()}</span></b>
              <span>
                Till payments only appear automatically when KopoKopo's webhooks reach the server. Register it from the
                M-Pesa SMS with the button below, then allocate it to a student.
              </span>
            </div>
          </div>
        )}
        {results.length > 0 && (
          <div className="fm-cards-scroll">
            <div className="fm-cards fm-cards-2">
              {results.map((r) => (
                <button key={r.id} type="button" className="fm-card" disabled={!r.allocatable} onClick={() => onAllocate(r)} style={r.allocatable ? undefined : { opacity: 0.5, cursor: "not-allowed" }}>
                  <span className="fm-card-tile" aria-hidden="true">KES</span>
                  <span className="fm-card-text">
                    <b>{formatKes(r.amount)} · {r.allocatable ? "Unallocated" : r.status}</b>
                    <span className="mono">{r.transactionReference || r.id}</span>
                    <span>{r.phone || "—"} · {new Date(r.date).toLocaleString()}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </FormSection>
    </FormModal>
  );
};

const RegisterManualModal = ({
  onClose,
  onSuccess,
  prefill,
}: {
  onClose: () => void;
  onSuccess: (payment: { id: string; amount: number; transactionReference: string }) => void;
  prefill?: { code?: string; amount?: string };
}) => {
  const [code, setCode] = useState(prefill?.code || "");
  const [amount, setAmount] = useState(prefill?.amount || "");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    const ref = code.trim().toUpperCase();
    const amt = Number(amount);
    if (!ref || ref.length < 8) {
      toast.warning("M-Pesa code required", "Enter the code from the M-Pesa SMS (e.g. UG7QOA5LRC)");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.warning("Amount required", "Enter the amount paid at the till");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await API.post("/kopokopo/register-manual", {
        transactionReference: ref,
        amount: amt,
        phone: phone.trim() || undefined,
      });
      toast.success("Payment registered", "You can now allocate it to a student");
      onSuccess({
        id: data.payment.id,
        amount: data.payment.amount,
        transactionReference: data.payment.transactionReference,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Registration failed";
      toast.error("Could not register", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      icon={ClipboardPlus}
      title="Register a till payment"
      subtitle="Enter the details from the parent's M-Pesa confirmation SMS."
      steps={[
        { id: "payment", label: "Payment", done: code.trim().length >= 8 && Number(amount) > 0 },
        { id: "payer", label: "Payer", done: !!phone.trim() },
      ]}
      statusLabel="Manual payment"
      statusDetail={code.trim() ? `${code.trim()}${Number(amount) > 0 ? ` · ${formatKes(Number(amount))}` : ""}` : ""}
      submitLabel="Register payment"
      submittingLabel="Registering…"
      submitting={submitting}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); handleRegister(); }}
    >
      <FormSection id="payment" icon={Receipt} title="Payment">
        <p className="fm-note">
          Use this when a parent paid with <b>Lipa na M-Pesa → Buy Goods</b> to till <b>3611959</b> but the payment didn't appear automatically.
        </p>
        <div className="fm-grid-2">
          <div className="field">
            <FieldLabel htmlFor="rm-code" required hint="From the SMS">M-Pesa code</FieldLabel>
            <input id="rm-code" className="input mono" placeholder="e.g. UG7QOA5LRC" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} minLength={8} required />
          </div>
          <div className="field">
            <FieldLabel htmlFor="rm-amount" required hint="KES">Amount</FieldLabel>
            <input id="rm-amount" type="number" min={1} className="input" placeholder="e.g. 500" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>
      </FormSection>
      <FormSection id="payer" icon={Phone} title="Payer">
        <div className="field">
          <FieldLabel htmlFor="rm-phone" hint="Optional">Parent's M-Pesa number</FieldLabel>
          <div className="input-icon">
            <input id="rm-phone" className="input" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Phone />
          </div>
        </div>
      </FormSection>
    </FormModal>
  );
};

const CollectionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceFromUrl = searchParams.get("source") as SourceFilter | null;
  const initialSource: SourceFilter =
    sourceFromUrl && SOURCE_FILTERS.some((f) => f.value === sourceFromUrl)
      ? sourceFromUrl
      : "all";

  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [meta, setMeta] = useState<CollectionsPageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [selectedPayloadId, setSelectedPayloadId] = useState<string | null>(null);
  const [allocatePayment, setAllocatePayment] = useState<{
    id: string;
    amount: number;
    transactionRef?: string;
    mpesaNumber?: string;
    date?: string;
  } | null>(null);
  const [findPaymentOpen, setFindPaymentOpen] = useState(false);
  const [walletAdjustOpen, setWalletAdjustOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerPrefill, setRegisterPrefill] = useState<{ code?: string; amount?: string }>();
  const [webhookStatus, setWebhookStatus] = useState<{
    paymentsToday: number;
    hoursSinceLastPayment: number | null;
    webhookLikelyStale: boolean;
    tillNumber: string;
  } | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    source: initialSource,
    status: "all" as StatusFilter,
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    const src = searchParams.get("source") as SourceFilter | null;
    if (src && SOURCE_FILTERS.some((f) => f.value === src) && src !== filters.source) {
      setFilters((f) => ({ ...f, source: src }));
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (filters.source === "all") next.delete("source");
    else next.set("source", filters.source);
    setSearchParams(next, { replace: true });
  }, [filters.source]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search is sent to the server, so wait for typing to pause before asking.
  const [search, setSearch] = useState(filters.search);
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(filters.search), 300);
    return () => window.clearTimeout(t);
  }, [filters.search]);

  // Any filter change starts again from page 1.
  useEffect(() => {
    setPage(1);
  }, [filters.source, filters.status, filters.startDate, filters.endDate, search]);

  /** Fetches one filtered page; the server does the filtering, totals and counts. */
  const seenIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const fetchRows = useCallback(
    /** fresh: wait for exact figures. silent: a live update, no loading state and new rows highlighted. */
    async (fresh = false, silent = false) => {
      if (!silent) setLoading(true);
      const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.source !== "all") params.source = filters.source;
      if (filters.status !== "all") params.status = filters.status;
      if (search.trim()) params.search = search.trim();
      if (fresh) params.fresh = "1";
      try {
        const { data } = await API.get<CollectionsPageMeta & { rows: CollectionRow[] }>("/finance/collections", { params });
        const next = data.rows || [];
        if (silent) {
          const arrived = next.map((r) => r.id).filter((id): id is string => !!id && !seenIds.current.has(id));
          if (arrived.length) {
            setNewIds(new Set(arrived));
            window.setTimeout(() => setNewIds(new Set()), 4_000);
          }
        }
        seenIds.current = new Set(next.map((r) => r.id).filter((id): id is string => !!id));
        setRows(next);
        setMeta(data);
      } catch {
        /* keep the previous page on screen */
      } finally {
        setLoading(false);
      }
    },
    [page, filters.startDate, filters.endDate, filters.source, filters.status, search],
  );

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // New payments appear without reloading the page. Date-filtered views ask for exact figures, since
  // only the unfiltered report is rebuilt ahead of time.
  const live = useLiveRefresh(() => fetchRows(Boolean(filters.startDate || filters.endDate), true));

  useEffect(() => {
    API.get("/kopokopo/webhook-status")
      .then((r) => setWebhookStatus(r.data))
      .catch(() => setWebhookStatus(null));
  }, [meta?.totalAll]);

  const openRegister = (prefill?: { code?: string; amount?: string }) => {
    setRegisterPrefill(prefill);
    setRegisterOpen(true);
    setFindPaymentOpen(false);
  };

  const handleRegistered = (payment: { id: string; amount: number; transactionReference: string }) => {
    fetchRows(true);
    setAllocatePayment({
      id: payment.id,
      amount: payment.amount,
      transactionRef: payment.transactionReference,
    });
  };

  // The server already applied source, status and search; this is the current page.
  const filteredRows = rows;

  const hasActiveFilters =
    filters.search !== "" ||
    filters.source !== "all" ||
    filters.status !== "all" ||
    filters.startDate !== "" ||
    filters.endDate !== "";

  const clearFilters = () => {
    setFilters({
      search: "",
      source: "all",
      status: "all",
      startDate: "",
      endDate: "",
    });
  };

  const openAllocate = (row: CollectionRow) => {
    if (!row.id || !row.allocatable) return;
    setAllocatePayment({
      id: row.id,
      amount: row.amount || row.attemptedAmount || 0,
      transactionRef: row.transactionRef,
      mpesaNumber: row.mpesaNumber,
      date: row.date,
    });
  };

  const handleFindPaymentAllocate = (payment: KopoSearchResult) => {
    setFindPaymentOpen(false);
    setAllocatePayment({
      id: payment.id,
      amount: payment.amount,
      transactionRef: payment.transactionReference,
      mpesaNumber: payment.phone,
      date: payment.date,
    });
  };

  const openPayloads = (rowId?: string) => {
    setSelectedPayloadId(rowId ?? filteredRows.find((r) => r.id)?.id ?? null);
    setPayloadOpen(true);
  };

  const totals = {
    topUps: meta?.totals.tillInflow ?? 0,
    walletTopUps: meta?.totals.walletTopUps ?? 0,
    cashSales: meta?.totals.cashSales ?? 0,
    usage: meta?.totals.usage ?? 0,
  };
  const total = meta?.total ?? 0;
  const totalAll = meta?.totalAll ?? 0;

  return (
    <div className="p-4 md:p-8 bg-page min-h-screen font-sans space-y-6">
      {webhookStatus && (webhookStatus.webhookLikelyStale || webhookStatus.paymentsToday === 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-amber-900 space-y-1">
            <p className="font-semibold">Manual till payments may not appear automatically</p>
            <p>
              Till <strong>{webhookStatus.tillNumber}</strong> payments only sync when KopoKopo webhooks reach your server.
              {webhookStatus.hoursSinceLastPayment != null
                ? ` Last recorded payment was ${webhookStatus.hoursSinceLastPayment}h ago.`
                : " No payments recorded yet."}
              {" "}Use <strong>Register till payment</strong> with the M-Pesa code from the SMS, then allocate to the student.
            </p>
          </div>
        </div>
      )}

      <PageHeader
        icon={Receipt}
        eyebrow="Finance"
        title={<>Collections <LiveBadge live={live} /></>}
        subtitle="Till M-Pesa, guest cash and STK sales, wallet top-ups and wallet spending"
        actions={
          <>
            <button type="button" onClick={() => fetchRows(true)} className="btn btn-ghost" title="Reload from the database">Refresh</button>
            <button type="button" onClick={() => setWalletAdjustOpen(true)} className="btn btn-ghost"><Wallet size={16} /> Update wallet</button>
            <button type="button" onClick={() => openPayloads()} disabled={filteredRows.length === 0} className="btn btn-ghost"><FileJson size={16} /> Payloads</button>
            <button type="button" onClick={() => openRegister()} className="btn btn-gold"><ClipboardPlus size={16} /> Register till payment</button>
            <button type="button" onClick={() => setFindPaymentOpen(true)} className="btn btn-primary"><Search size={16} /> Find M-Pesa payment</button>
          </>
        }
      />
      <StatTiles cols={5}>
        <StatTile label="Till inflow (unique)" value={formatKes(totals.topUps)} tone="green" title="Unique M-Pesa till receipts" />
        <StatTile label="Wallet top-ups" value={formatKes(totals.walletTopUps)} tone="navy" title="Allocated / manual wallet top-ups" />
        <StatTile label="Cash POS" value={formatKes(totals.cashSales)} tone="gold" title="Guest cash POS" />
        <StatTile label="Wallet usage" value={formatKes(totals.usage)} tone="red" title="Wallet cafeteria purchases" />
        <StatTile
          label="Records"
          value={total.toLocaleString()}
          hint={hasActiveFilters && total !== totalAll ? `of ${totalAll.toLocaleString()} total` : "matching the filters"}
        />
      </StatTiles>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-brand" />
            <span className="font-semibold text-brand">Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-gray-500 hover:text-brand"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {SOURCE_FILTERS.map((opt) => {
            const active = filters.source === opt.value;
            const count = meta?.sourceCounts[opt.value] ?? 0;
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.hint}
                onClick={() => setFilters((f) => ({ ...f, source: opt.value }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-brand border-gray-200 hover:border-brand/40"
                }`}
              >
                {opt.label}
                <span className={`ml-1 ${active ? "text-blue-200" : "text-gray-400"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search name, adm no, ref, phone..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand outline-none"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand outline-none"
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand outline-none"
            title="From date"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand outline-none"
            title="To date"
          />
        </div>
        {meta && totalAll > 0 && (
          <p className="text-xs text-gray-500">
            {total.toLocaleString()} of {totalAll.toLocaleString()} records
            {filters.startDate || filters.endDate
              ? ` · ${filters.startDate || "…"} to ${filters.endDate || "…"}`
              : ""}
          </p>
        )}
      </div>

      {loading && !meta ? (
        <Loader size="sm" title="Loading collections..." subtitle="Fetching till and wallet records" className="py-8" />
      ) : totalAll === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">No collections found</div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">
          No records match your filters.{" "}
          <button type="button" onClick={clearFilters} className="text-brand font-semibold hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
          <table className="w-full text-sm min-w-[1020px]">
            <thead className="text-gray-500 uppercase text-xs bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4">No</th>
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Adm No</th>
                <th className="text-left py-3 px-4">M-Pesa Number</th>
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-left py-3 px-4">Method</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Metadata</th>
                <th className="text-right py-3 px-4">Amount</th>
                <th className="text-center py-3 px-4">Actions</th>
                <th className="text-center py-3 px-4">Payload</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const failedUnsettled =
                  r.source === "kopo" &&
                  r.amount === 0 &&
                  (r.attemptedAmount ?? 0) > 0;

                return (
                  <tr key={`${r.id || r.transactionRef || r.date}-${idx}`} className={`border-t border-gray-100 align-top${r.id && newIds.has(r.id) ? " row-new" : ""}`}>
                    <td className="py-3 px-4 text-gray-500">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="py-3 px-4">{r.name ? <PersonCell name={r.name} /> : <span className="text-gray-400">-</span>}</td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">{r.admNo || "-"}</td>
                    <td className="py-3 px-4">{r.mpesaNumber || "-"}</td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {new Date(r.date).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      <div className="space-y-1">
                        <span
                          className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-semibold border ${channelBadge(rowChannel(r))}`}
                        >
                          {channelLabel(rowChannel(r))}
                        </span>
                        <p>{r.method || "-"}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${statusBadge(r.status)}`}>
                        {r.status || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs max-w-xs">
                      <p className="line-clamp-2" title={r.metadata}>{r.metadata || "-"}</p>
                      {r.transactionRef && (
                        <p className="text-[10px] text-gray-400 mt-1 font-mono truncate" title={r.transactionRef}>
                          Ref: {r.transactionRef}
                        </p>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${
                      r.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {r.amount !== 0 ? (
                        <>
                          {r.amount >= 0 ? "+" : "−"} {formatKes(Math.abs(r.amount))}
                        </>
                      ) : failedUnsettled ? (
                        <span className="text-gray-400 font-normal text-xs">
                          {formatKes(r.attemptedAmount || 0)} (not settled)
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.allocatable ? (
                        <button
                          type="button"
                          onClick={() => openAllocate(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                        >
                          <UserPlus size={14} />
                          Allocate
                        </button>
                      ) : r.walletCredited && isWalletTopUpRow(r) ? (
                        <span className="text-[10px] text-emerald-600 font-semibold">Credited</span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => r.id && openPayloads(r.id)}
                        disabled={!r.payload}
                        title="View metadata payload"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-brand border border-brand/20 rounded-lg hover:bg-brand/5 disabled:opacity-30"
                      >
                        <FileJson size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={meta?.page ?? page} pages={meta?.pages ?? 1} total={total} pageSize={PAGE_SIZE} loading={loading} onPage={setPage} />
        </div>
      )}

      {payloadOpen && (
        <PayloadModal
          rows={filteredRows.filter((r) => r.payload)}
          selectedId={selectedPayloadId}
          onClose={() => setPayloadOpen(false)}
          onSelect={setSelectedPayloadId}
        />
      )}

      {allocatePayment && (
        <AllocateModal
          payment={allocatePayment}
          onClose={() => setAllocatePayment(null)}
          onSuccess={() => fetchRows(true)}
        />
      )}

      {findPaymentOpen && (
        <FindPaymentModal
          onClose={() => setFindPaymentOpen(false)}
          onAllocate={handleFindPaymentAllocate}
          onRegister={openRegister}
        />
      )}

      {registerOpen && (
        <RegisterManualModal
          prefill={registerPrefill}
          onClose={() => {
            setRegisterOpen(false);
            setRegisterPrefill(undefined);
          }}
          onSuccess={handleRegistered}
        />
      )}

      {walletAdjustOpen && (
        <WalletAdjustModal
          onClose={() => setWalletAdjustOpen(false)}
          onSuccess={() => fetchRows(true)}
          title="Update student wallet"
          subtitle="Credit or debit a student wallet (cash, corrections, etc.)"
        />
      )}
    </div>
  );
};

export default CollectionsPage;
