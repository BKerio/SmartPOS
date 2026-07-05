import { useCallback, useEffect, useMemo, useState } from "react";
import { Receipt, FileJson, X, Copy, Check, Search, Filter } from "lucide-react";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import { toast } from "@/services/toast";

type CollectionRow = {
  id?: string;
  source?: string;
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
  payload?: Record<string, unknown>;
};

const formatKes = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

const statusBadge = (status: string) => {
  const s = (status || "").toLowerCase();
  if (["success", "received", "complete", "completed", "paid"].includes(s)) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (["failed", "error", "reversed", "cancelled"].includes(s)) {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-amber-100 text-amber-800";
};

type StatusFilter = "all" | "success" | "pending" | "failed";
type SourceFilter = "all" | "till" | "guest" | "wallet_topup" | "wallet_usage";

const statusBucket = (status: string): StatusFilter => {
  const s = (status || "").toLowerCase();
  if (["success", "received", "complete", "completed", "paid"].includes(s)) return "success";
  if (["failed", "error", "reversed", "cancelled"].includes(s)) return "failed";
  return "pending";
};

const isWalletTopUpRow = (row: CollectionRow) =>
  (row.source === "kopo" && row.type === "wallet_topup") ||
  (row.source === "wallet" && row.type === "deposit");

const isWalletUsageRow = (row: CollectionRow) =>
  row.source === "wallet" && (row.type === "purchase" || row.type === "refund");

const matchesSource = (row: CollectionRow, source: SourceFilter): boolean => {
  if (source === "all") return true;
  if (source === "wallet_topup") return isWalletTopUpRow(row);
  if (source === "wallet_usage") return isWalletUsageRow(row);
  if (source === "guest") {
    return row.source === "pos_mpesa" || (row.source === "kopo" && row.type === "pos_sale");
  }
  if (source === "till") {
    return row.source === "kopo" && row.type !== "wallet_topup";
  }
  return true;
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

  const json = selected?.payload
    ? JSON.stringify(selected.payload, null, 2)
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
            <h3 className="font-bold text-[#0A1F44] flex items-center gap-2">
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
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0A1F44] outline-none"
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
                      selected?.id === r.id ? "bg-[#E8F4FD] border-l-4 border-l-[#0A1F44]" : ""
                    }`}
                  >
                    <p className="font-semibold text-sm text-[#0A1F44] truncate">
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
                <span className="font-semibold text-[#0A1F44]">{selected.name || "—"}</span>
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0A1F44] border border-[#0A1F44]/20 rounded-lg hover:bg-[#0A1F44]/5"
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

const CollectionsPage = () => {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [selectedPayloadId, setSelectedPayloadId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    source: "all" as SourceFilter,
    status: "all" as StatusFilter,
    startDate: "",
    endDate: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;

    try {
      const r = await API.get<CollectionRow[]>("/finance/collections", { params });
      setRows(r.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    let list = rows;

    if (filters.source !== "all") {
      list = list.filter((r) => matchesSource(r, filters.source));
    }

    if (filters.status !== "all") {
      list = list.filter((r) => statusBucket(r.status) === filters.status);
    }

    const q = filters.search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.name, r.admNo, r.metadata, r.method, r.status, r.transactionRef, r.mpesaNumber, r.type]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    return list;
  }, [rows, filters.search, filters.source, filters.status]);

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

  const openPayloads = (rowId?: string) => {
    setSelectedPayloadId(rowId ?? filteredRows.find((r) => r.id)?.id ?? null);
    setPayloadOpen(true);
  };

  const totals = useMemo(() => {
    const topUps = filteredRows
      .filter((r) => isWalletTopUpRow(r) || r.source === "pos_mpesa" || (r.source === "kopo" && r.amount > 0 && r.type !== "wallet_topup"))
      .reduce((s, r) => s + Math.abs(r.amount), 0);
    const walletTopUps = filteredRows.filter(isWalletTopUpRow).reduce((s, r) => s + r.amount, 0);
    const usage = filteredRows
      .filter((r) => r.type === "purchase")
      .reduce((s, r) => s + Math.abs(r.amount), 0);
    const tillAttempts = filteredRows.filter((r) => r.source === "kopo" || r.source === "pos_mpesa").length;
    return { topUps, walletTopUps, usage, tillAttempts };
  }, [filteredRows]);

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans space-y-6">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Receipt /> Collections Report
          </h2>
          <p className="text-blue-200 text-sm mt-1">
            Till M-Pesa, wallet top-ups, guest POS STK, and wallet cafeteria usage
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-3">
          <button
            type="button"
            onClick={() => openPayloads()}
            disabled={filteredRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            <FileJson size={16} /> View all payloads
          </button>
          <div className="text-right space-y-1">
            <p className="text-blue-200 text-xs">
              Till inflows / Wallet top-ups / Usage · Till records
              {hasActiveFilters && filteredRows.length !== rows.length ? (
                <span className="ml-1">({filteredRows.length} shown)</span>
              ) : null}
            </p>
            <p className="text-lg font-bold">
              <span className="text-emerald-300">{formatKes(totals.topUps)}</span>
              <span className="text-blue-200"> · </span>
              <span className="text-sky-300">{formatKes(totals.walletTopUps)}</span>
              <span className="text-blue-200"> · </span>
              <span className="text-rose-300">{formatKes(totals.usage)}</span>
              <span className="text-blue-200"> · </span>
              <span className="text-white">{totals.tillAttempts}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-[#0A1F44]" />
            <span className="font-semibold text-[#0A1F44]">Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-gray-500 hover:text-[#0A1F44]"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search name, adm no, ref, phone..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0A1F44] outline-none"
            />
          </div>
          <select
            value={filters.source}
            onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as SourceFilter }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none"
          >
            <option value="all">All sources</option>
            <option value="till">Till M-Pesa</option>
            <option value="wallet_topup">Wallet top-ups</option>
            <option value="wallet_usage">Wallet usage</option>
            <option value="guest">Guest POS</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none"
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
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none"
            title="From date"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none"
            title="To date"
          />
        </div>
        {!loading && rows.length > 0 && (
          <p className="text-xs text-gray-500">
            Showing {filteredRows.length} of {rows.length} records
            {filters.startDate || filters.endDate
              ? ` · ${filters.startDate || "…"} to ${filters.endDate || "…"}`
              : ""}
          </p>
        )}
      </div>

      {loading ? (
        <Loader size="sm" title="Loading collections..." subtitle="Fetching till and wallet records" className="py-8" />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">No collections found</div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">
          No records match your filters.{" "}
          <button type="button" onClick={clearFilters} className="text-[#0A1F44] font-semibold hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
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
                  <tr key={`${r.id || r.transactionRef || r.date}-${idx}`} className="border-t border-gray-100 align-top">
                    <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-semibold text-[#0A1F44]">{r.name || "-"}</td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">{r.admNo || "-"}</td>
                    <td className="py-3 px-4">{r.mpesaNumber || "-"}</td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {new Date(r.date).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{r.method || "-"}</td>
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
                      <button
                        type="button"
                        onClick={() => r.id && openPayloads(r.id)}
                        disabled={!r.payload}
                        title="View metadata payload"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0A1F44] border border-[#0A1F44]/20 rounded-lg hover:bg-[#0A1F44]/5 disabled:opacity-30"
                      >
                        <FileJson size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    </div>
  );
};

export default CollectionsPage;
