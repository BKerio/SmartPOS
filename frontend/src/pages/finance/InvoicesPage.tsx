import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Banknote, Download, FileText, Pencil, Plus, Printer, Search, Trash2, Wallet, X, XCircle } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { Avatar, PersonCell, TablePager } from "@/components/page/DataTable";
import InvoiceFormModal, { type EditableInvoice } from "@/components/invoices/InvoiceFormModal";
import InvoicePaymentModal from "@/components/invoices/InvoicePaymentModal";
import { useAuth } from "@/context/AuthContext";
import { downloadInvoicePdf, printInvoicePdf } from "@/lib/invoicePdf";
import { displayName, kes } from "@/lib/text";

type Status = "open" | "unpaid" | "partial" | "paid" | "cancelled" | "all";
type InvoiceRow = {
  id: string; invoiceNo: string; customerName: string; customerPhone?: string | null; waiterId: string; waiterName: string;
  createdByName: string; status: string; totalAmount: number; paidAmount: number; balance: number; dueDate?: string | null;
  createdAt: string; itemCount: number; overdue: boolean; notes?: string | null;
};
type ListResponse = {
  rows: InvoiceRow[]; page: number; limit: number; total: number;
  summary: { openCount: number; outstanding: number; overdueCount: number; overdueAmount: number; collectedThisMonth: number };
  byWaiter: { waiterId: string; waiterName: string; openCount: number; outstanding: number }[];
};
type InvoiceDetail = InvoiceRow & {
  items: { id: string; menuItemId: string | null; description: string; quantity: number; unitPrice: number; total: number }[];
  payments: { id: string; amount: number; method: string; reference?: string | null; receivedByName: string; createdAt: string }[];
};

const PAGE_SIZE = 25;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS_PILL: Record<string, string> = { unpaid: "pill-red", partial: "pill-amber", paid: "pill-green", cancelled: "pill-gray" };
const STATUS_LABEL: Record<string, string> = { unpaid: "Unpaid", partial: "Part paid", paid: "Paid", cancelled: "Cancelled" };

const InvoicesPage = () => {
  const { user } = useAuth();
  const canRaise = user?.role === "admin" || user?.role === "restaurant";
  const canCancel = user?.role === "admin" || user?.role === "finance";
  const canDelete = user?.role === "admin";
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "open");
  const [waiterId, setWaiterId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [editing, setEditing] = useState<EditableInvoice | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setPage(1), [status, waiterId, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get<ListResponse>("/invoices", {
        params: { status, page, limit: PAGE_SIZE, ...(waiterId ? { waiterId } : {}), ...(search ? { search } : {}) },
      });
      setData(data);
    } catch (e: any) {
      toast.error("Could not load invoices", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  }, [status, page, waiterId, search]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    try {
      const { data } = await API.get<InvoiceDetail>(`/invoices/${id}`);
      setDetail(data);
    } catch (e: any) {
      toast.error("Could not open invoice", e.response?.data?.message);
    }
  };

  const startEdit = async (id: string) => {
    try {
      const { data } = await API.get<InvoiceDetail>(`/invoices/${id}`);
      setEditing(data);
    } catch (e: any) {
      toast.error("Could not open invoice", e.response?.data?.message);
    }
  };

  const deleteInvoice = async (inv: InvoiceRow) => {
    const ok = await toast.confirm(`Delete ${inv.invoiceNo}?`, {
      description:
        inv.status === "cancelled"
          ? "It will be removed for good. This can't be undone."
          : "Use this only for an invoice raised by mistake. The items go back into stock and the invoice is removed for good.",
      confirmLabel: "Delete invoice",
      danger: true,
    });
    if (!ok) return;
    try {
      await API.delete(`/invoices/${inv.id}`);
      toast.success(`${inv.invoiceNo} deleted`, inv.status === "cancelled" ? undefined : "Stock returned");
      setDetail(null);
      load();
    } catch (e: any) {
      toast.error("Could not delete", e.response?.data?.message);
    }
  };

  const cancelInvoice = async (inv: InvoiceRow) => {
    const ok = await toast.confirm(`Cancel ${inv.invoiceNo}?`, { description: "Only unpaid invoices can be cancelled. Stock already served is not returned.", confirmLabel: "Cancel invoice", danger: true });
    if (!ok) return;
    try {
      await API.post(`/invoices/${inv.id}/cancel`, {});
      toast.success("Invoice cancelled");
      setDetail(null);
      load();
    } catch (e: any) {
      toast.error("Could not cancel", e.response?.data?.message);
    }
  };

  // Same thermal-roll style as the POS receipt (lib/invoicePdf.ts).
  const [pdfBusy, setPdfBusy] = useState<null | "print" | "download">(null);
  const invoicePdf = async (inv: InvoiceDetail, action: "print" | "download") => {
    setPdfBusy(action);
    try {
      const data = { ...inv, createdByName: inv.createdByName, waiterName: inv.waiterName };
      if (action === "print") await printInvoicePdf(data);
      else await downloadInvoicePdf(data);
    } catch (e: any) {
      toast.error(action === "print" ? "Could not print" : "Could not download", e?.message);
    } finally {
      setPdfBusy(null);
    }
  };

  const s = data?.summary;
  const rows = data?.rows ?? [];

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={FileText}
        eyebrow="Sales"
        title="Sales invoices"
        subtitle="Food served on credit. Every invoice names the waiter who served it, so unpaid ones can be followed up."
        actions={canRaise ? <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={16} /> New invoice</button> : undefined}
      />

      <StatTiles cols={4}>
        <StatTile label="Outstanding" value={kes(s?.outstanding ?? 0)} hint={`${s?.openCount ?? 0} unpaid invoices`} icon={Wallet} tone="red" />
        <StatTile label="Overdue" value={kes(s?.overdueAmount ?? 0)} hint={`${s?.overdueCount ?? 0} past their pay-by date`} icon={AlertTriangle} tone="gold" />
        <StatTile label="Collected this month" value={kes(s?.collectedThisMonth ?? 0)} hint="Payments received on invoices" icon={Banknote} tone="green" />
        <StatTile label="Waiters to follow up" value={data?.byWaiter.length ?? 0} hint="With unpaid invoices" icon={FileText} tone="navy" />
      </StatTiles>

      <div className="iv-grid">
        <section className="dt">
          <div className="dt-toolbar">
            <label className="dt-search">
              <Search size={16} />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search invoice no., customer or phone" aria-label="Search invoices" />
            </label>
            <Segmented
              label="Status"
              value={status}
              options={[
                { value: "open", label: "Unpaid" },
                { value: "paid", label: "Paid" },
                { value: "cancelled", label: "Cancelled" },
                { value: "all", label: "All" },
              ]}
              onChange={setStatus}
            />
            {waiterId && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWaiterId("")}>
                <X size={14} /> {displayName(data?.byWaiter.find((w) => w.waiterId === waiterId)?.waiterName || "Waiter")}
              </button>
            )}
            <span className="dt-count">{(data?.total ?? 0).toLocaleString()} invoices</span>
          </div>

          {loading && !data ? (
            <Loader size="sm" title="Loading invoices..." className="py-10" />
          ) : rows.length === 0 ? (
            <div className="dt-empty">
              <b>{status === "open" ? "Nothing outstanding" : "No invoices"}</b>
              {status === "open" ? "Every invoice has been paid." : "Try another filter."}
            </div>
          ) : (
            <>
              <div className="dt-scroll" style={{ opacity: loading ? 0.6 : 1 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Served by</th>
                      <th className="hide-sm">Pay by</th>
                      <th className="num">Total</th>
                      <th className="num">Balance</th>
                      <th>Status</th>
                      <th className="act">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="click" onClick={() => openDetail(r.id)}>
                        <td>
                          <span className="dt-mono" style={{ fontWeight: 600 }}>{r.invoiceNo}</span>
                          <div className="dt-muted" style={{ fontSize: 12 }}>{fmtDate(r.createdAt)} · {r.itemCount} item{r.itemCount === 1 ? "" : "s"}</div>
                        </td>
                        <td><PersonCell name={r.customerName} sub={r.customerPhone || "No phone"} /></td>
                        <td>
                          <div className="dt-person"><Avatar name={r.waiterName} size="sm" /><span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{displayName(r.waiterName)}</span></div>
                        </td>
                        <td className="hide-sm">
                          <span style={{ color: r.overdue ? "var(--red)" : "var(--ink-2)", fontWeight: r.overdue ? 700 : 400 }}>{fmtDate(r.dueDate)}</span>
                          {r.overdue && <div style={{ fontSize: 11.5, color: "var(--red)" }}>Overdue</div>}
                        </td>
                        <td className="num"><span className="dt-amount">{kes(r.totalAmount)}</span></td>
                        <td className="num"><span className="dt-amount" style={{ color: r.balance > 0 && r.status !== "cancelled" ? "var(--red)" : "var(--muted)" }}>{kes(r.balance)}</span></td>
                        <td><span className={`pill ${STATUS_PILL[r.status] || "pill-gray"}`}><span className="dot" />{STATUS_LABEL[r.status] || r.status}</span></td>
                        <td className="act" onClick={(e) => e.stopPropagation()}>
                          <div className="iv-acts">
                            {["unpaid", "partial"].includes(r.status) && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaying(r)}><Banknote size={14} /> Pay</button>
                            )}
                            {canRaise && r.status !== "cancelled" && (
                              <button type="button" className="icon-btn" title="Edit invoice" aria-label={`Edit ${r.invoiceNo}`} onClick={() => startEdit(r.id)}><Pencil size={15} /></button>
                            )}
                            {canDelete && r.paidAmount === 0 && (
                              <button type="button" className="icon-btn danger" title="Delete invoice" aria-label={`Delete ${r.invoiceNo}`} onClick={() => deleteInvoice(r)}><Trash2 size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} label="invoices" />
            </>
          )}
        </section>

        <aside className="card">
          <div className="card-head"><span className="card-title">Owed per waiter</span></div>
          {(data?.byWaiter.length ?? 0) === 0 ? (
            <div className="dt-empty" style={{ padding: 24 }}>No unpaid invoices.</div>
          ) : (
            <ul className="iv-waiters">
              {data!.byWaiter.map((w) => (
                <li key={w.waiterId}>
                  <button type="button" className={waiterId === w.waiterId ? "on" : ""} onClick={() => { setWaiterId(waiterId === w.waiterId ? "" : w.waiterId); setStatus("open"); }}>
                    <Avatar name={w.waiterName} />
                    <span className="min-w-0">
                      <b>{displayName(w.waiterName)}</b>
                      <small>{w.openCount} unpaid</small>
                    </span>
                    <strong>{kes(w.outstanding)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {showNew && (
        <InvoiceFormModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); setStatus("open"); load(); }}
        />
      )}
      {editing && (
        <InvoiceFormModal
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={(inv) => { setEditing(null); load(); if (detail?.id === inv.id) openDetail(inv.id); }}
        />
      )}
      {paying && (
        <InvoicePaymentModal
          invoice={paying}
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); setDetail(null); load(); }}
        />
      )}
      {detail && (
        <>
          <div className="drawer-back" onClick={() => setDetail(null)} />
          <div className="drawer iv-drawer" role="dialog" aria-label={`Invoice ${detail.invoiceNo}`}>
            <div className="iv-drawer-head">
              <div>
                <span className="dt-mono" style={{ fontSize: 13 }}>{detail.invoiceNo}</span>
                <h2>{displayName(detail.customerName)}</h2>
                <span className={`pill ${STATUS_PILL[detail.status] || "pill-gray"}`}><span className="dot" />{STATUS_LABEL[detail.status] || detail.status}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setDetail(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="iv-drawer-body" id="invoice-print">
              <div className="iv-print-only">
                <h1>Better Forks Restaurant Limited</h1>
                <p>Sales invoice {detail.invoiceNo}</p>
              </div>
              <dl className="pf-list" style={{ padding: 0 }}>
                <div><dt>Customer</dt><dd>{displayName(detail.customerName)}{detail.customerPhone ? ` · ${detail.customerPhone}` : ""}</dd></div>
                <div><dt>Served by</dt><dd>{displayName(detail.waiterName)}</dd></div>
                <div><dt>Raised</dt><dd>{fmtDate(detail.createdAt)} by {displayName(detail.createdByName)}</dd></div>
                <div><dt>Pay by</dt><dd style={detail.overdue ? { color: "var(--red)" } : undefined}>{fmtDate(detail.dueDate)}</dd></div>
                {detail.notes && <div><dt>Notes</dt><dd style={{ whiteSpace: "pre-line" }}>{detail.notes}</dd></div>}
              </dl>
              <table className="iv-items">
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr key={i.id}><td>{displayName(i.description)}</td><td className="num">{i.quantity}</td><td className="num">{i.unitPrice.toLocaleString()}</td><td className="num">{i.total.toLocaleString()}</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>Total</td><td className="num">{kes(detail.totalAmount)}</td></tr>
                  <tr><td colSpan={3}>Paid</td><td className="num">{kes(detail.paidAmount)}</td></tr>
                  <tr className="due"><td colSpan={3}>Balance</td><td className="num">{kes(detail.balance)}</td></tr>
                </tfoot>
              </table>
              {detail.payments.length > 0 && (
                <>
                  <h3 className="section-title" style={{ marginTop: 18 }}>Payments</h3>
                  <ul className="pa-tx" style={{ padding: 0 }}>
                    {detail.payments.map((p) => (
                      <li key={p.id} style={{ padding: "10px 0" }}>
                        <span className="pg-chip tone-green"><Banknote size={15} /></span>
                        <div className="min-w-0">
                          <b>{p.method === "mpesa" ? "M-Pesa" : p.method[0].toUpperCase() + p.method.slice(1)}{p.reference ? ` · ${p.reference}` : ""}</b>
                          <span>{new Date(p.createdAt).toLocaleString("en-KE")} · {displayName(p.receivedByName)}</span>
                        </div>
                        <strong className="in">{kes(p.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="iv-drawer-foot">
              <button type="button" className="btn btn-ghost" onClick={() => invoicePdf(detail, "print")} disabled={!!pdfBusy}><Printer size={16} /> {pdfBusy === "print" ? "Preparing…" : "Print"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => invoicePdf(detail, "download")} disabled={!!pdfBusy} title="Download PDF"><Download size={16} /> {pdfBusy === "download" ? "Preparing…" : "PDF"}</button>
              {canRaise && detail.status !== "cancelled" && (
                <button type="button" className="btn btn-ghost" onClick={() => startEdit(detail.id)}><Pencil size={16} /> Edit</button>
              )}
              {canDelete && detail.paidAmount === 0 && (
                <button type="button" className="btn btn-ghost" style={{ color: "var(--red)" }} onClick={() => deleteInvoice(detail)}><Trash2 size={16} /> Delete</button>
              )}
              {canCancel && detail.status === "unpaid" && (
                <button type="button" className="btn btn-ghost" style={{ color: "var(--red)" }} onClick={() => cancelInvoice(detail)}><XCircle size={16} /> Cancel</button>
              )}
              {["unpaid", "partial"].includes(detail.status) && (
                <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setPaying(detail)}><Banknote size={16} /> Record payment</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InvoicesPage;
