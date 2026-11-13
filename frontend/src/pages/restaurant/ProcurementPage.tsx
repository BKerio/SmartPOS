import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, PackageCheck, Search, Truck } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { Avatar, TablePager } from "@/components/page/DataTable";
import FormModal, { ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import { useAuth } from "@/context/AuthContext";
import { displayName, kes } from "@/lib/text";

type Item = { id: string; name: string; unit: string; stockLevel: number; reorderLevel: number; unitCost: number; category: string };
type Supplier = { id: string; name: string };
type Movement = {
  id: string; type: "IN" | "OUT"; reason: string; quantity: number; unitCost: number; value: number; createdAt: string;
  reference?: string | null; notes?: string | null; issuedTo?: string | null; recordedBy: string;
  inventoryItem: { id: string; name: string; unit: string }; supplier?: { id: string; name: string } | null;
};
type Ledger = { rows: Movement[]; total: number; totals: { receivedCount: number; receivedValue: number; issuedCount: number; issuedValue: number } };
type StockCard = {
  item: Item; opening: number; closing: number;
  rows: { id: string; createdAt: string; type: string; reason: string; quantity: number; unitCost: number; supplier: string | null; issuedTo: string | null; reference: string | null; recordedBy: string; balance: number }[];
};

const PAGE_SIZE = 25;
const eatToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 3 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const fmtWhen = (d: string) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const REASON_LABEL: Record<string, string> = { purchase: "Purchase", issue: "Issued", production: "Cooked (recipe)", usage: "Usage", spoilage: "Spoilage", adjustment: "Adjustment", sale: "Sold" };

const ProcurementPage = () => {
  const { user } = useAuth();
  const canRecord = user?.role === "admin" || user?.role === "restaurant";
  const [tab, setTab] = useState<"ledger" | "card">("ledger");
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(eatToday());
  const [type, setType] = useState<"all" | "IN" | "OUT">("all");
  const [itemId, setItemId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [card, setCard] = useState<StockCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"receive" | "issue" | null>(null);

  const loadRefs = useCallback(() => {
    API.get<Item[]>("/inventory/items").then((r) => setItems(r.data)).catch(() => {});
    API.get<Supplier[]>("/inventory/suppliers").then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);
  useEffect(loadRefs, [loadRefs]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setPage(1), [from, to, type, itemId, search]);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get<Ledger>("/procurement/ledger", {
        params: { from, to, page, limit: PAGE_SIZE, ...(type !== "all" ? { type } : {}), ...(itemId ? { itemId } : {}), ...(search ? { search } : {}) },
      });
      setLedger(data);
    } catch (e: any) {
      toast.error("Could not load procurement", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, type, itemId, search, page]);

  const loadCard = useCallback(async () => {
    if (!itemId) { setCard(null); return; }
    setLoading(true);
    try {
      const { data } = await API.get<StockCard>(`/procurement/stock-card/${itemId}`, { params: { from, to } });
      setCard(data);
    } catch (e: any) {
      toast.error("Could not load stock card", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  }, [itemId, from, to]);

  useEffect(() => { if (tab === "ledger") loadLedger(); else loadCard(); }, [tab, loadLedger, loadCard]);

  const lowStock = useMemo(() => items.filter((i) => i.stockLevel <= i.reorderLevel).length, [items]);
  const stockValue = useMemo(() => items.reduce((s, i) => s + i.stockLevel * i.unitCost, 0), [items]);
  const t = ledger?.totals;

  const refreshAfterWrite = () => { setModal(null); loadRefs(); if (tab === "ledger") loadLedger(); else loadCard(); };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={Truck}
        eyebrow="Kitchen"
        title="Procurement"
        subtitle="What was bought into the store, and what was issued out of it, with costs and who handled it."
        actions={canRecord ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModal("issue")}><ArrowUpFromLine size={16} /> Issue stock</button>
            <button type="button" className="btn btn-primary" onClick={() => setModal("receive")}><ArrowDownToLine size={16} /> Receive purchase</button>
          </>
        ) : undefined}
      />

      <StatTiles cols={4}>
        <StatTile label="Bought in period" value={kes(t?.receivedValue ?? 0)} hint={`${t?.receivedCount ?? 0} deliveries`} icon={ArrowDownToLine} tone="green" />
        <StatTile label="Issued in period" value={kes(t?.issuedValue ?? 0)} hint={`${t?.issuedCount ?? 0} issues and recipe deductions`} icon={ArrowUpFromLine} tone="gold" />
        <StatTile label="Low stock" value={lowStock} hint="At or below reorder level" icon={Boxes} tone={lowStock ? "red" : "green"} />
        <StatTile label="Store value now" value={kes(stockValue)} hint={`${items.length} items at current cost`} icon={PackageCheck} tone="navy" />
      </StatTiles>

      <section className="dt">
        <div className="dt-toolbar">
          <Segmented label="View" value={tab} options={[{ value: "ledger", label: "Bought & issued" }, { value: "card", label: "Stock card" }]} onChange={setTab} />
          <input type="date" className="input" style={{ width: 150, height: 40 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <input type="date" className="input" style={{ width: 150, height: 40 }} value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <select className="input" style={{ width: 200, height: 40 }} value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item">
            <option value="">{tab === "card" ? "Choose an item…" : "All items"}</option>
            {items.map((i) => <option key={i.id} value={i.id}>{displayName(i.name)}</option>)}
          </select>
          {tab === "ledger" && (
            <>
              <Segmented label="Type" value={type} options={[{ value: "all", label: "All" }, { value: "IN", label: "Bought" }, { value: "OUT", label: "Issued" }]} onChange={setType} />
              <label className="dt-search" style={{ flexBasis: 220 }}>
                <Search size={16} />
                <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Invoice, notes, issued to" aria-label="Search" />
              </label>
            </>
          )}
        </div>

        {tab === "ledger" ? (
          loading && !ledger ? (
            <Loader size="sm" title="Loading procurement..." className="py-10" />
          ) : !ledger || ledger.rows.length === 0 ? (
            <div className="dt-empty"><b>Nothing recorded</b>No purchases or issues match these filters.</div>
          ) : (
            <>
              <div className="dt-scroll" style={{ opacity: loading ? 0.6 : 1 }}>
                <table>
                  <thead>
                    <tr>
                      <th>When</th><th>Item</th><th>Movement</th><th className="num">Quantity</th>
                      <th className="num hide-sm">Unit cost</th><th className="num">Value</th><th>From / to</th><th className="hide-sm">Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((m) => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(m.createdAt)}</td>
                        <td><b style={{ color: "var(--ink)", fontWeight: 650 }}>{displayName(m.inventoryItem.name)}</b></td>
                        <td>
                          <span className={`pill ${m.type === "IN" ? "pill-green" : "pill-amber"}`}>
                            {m.type === "IN" ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />} {REASON_LABEL[m.reason] || m.reason}
                          </span>
                        </td>
                        <td className="num"><span className="dt-amount" style={{ color: m.type === "IN" ? "var(--color-status-success, #169A5B)" : "var(--amber)" }}>{m.type === "IN" ? "+" : "−"}{m.quantity.toLocaleString()} {m.inventoryItem.unit}</span></td>
                        <td className="num hide-sm">{m.unitCost ? m.unitCost.toLocaleString() : "-"}</td>
                        <td className="num"><span className="dt-amount">{kes(m.value)}</span></td>
                        <td>
                          {m.type === "IN" ? (
                            <span>{m.supplier ? displayName(m.supplier.name) : "-"}{m.reference && <div className="dt-muted dt-mono" style={{ fontSize: 11.5 }}>{m.reference}</div>}</span>
                          ) : (
                            <span>{m.issuedTo || (m.reason === "production" ? "Kitchen (recipe)" : "-")}{m.notes && <div className="dt-muted" style={{ fontSize: 11.5, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.notes}</div>}</span>
                          )}
                        </td>
                        <td className="hide-sm"><div className="dt-person"><Avatar name={m.recordedBy} size="sm" /><span style={{ color: "var(--ink-2)" }}>{displayName(m.recordedBy)}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePager page={page} pageSize={PAGE_SIZE} total={ledger.total} onPage={setPage} label="movements" />
            </>
          )
        ) : !itemId ? (
          <div className="dt-empty"><b>Choose an item</b>The stock card shows every movement for one item with a running balance.</div>
        ) : loading && !card ? (
          <Loader size="sm" title="Loading stock card..." className="py-10" />
        ) : card ? (
          <>
            <div className="pc-card-head">
              <div><span>Opening balance</span><b>{card.opening.toLocaleString()} {card.item.unit}</b></div>
              <div><span>Bought</span><b style={{ color: "var(--color-status-success, #169A5B)" }}>+{card.rows.filter((r) => r.type === "IN").reduce((s, r) => s + r.quantity, 0).toLocaleString()}</b></div>
              <div><span>Issued</span><b style={{ color: "var(--amber)" }}>−{card.rows.filter((r) => r.type === "OUT").reduce((s, r) => s + r.quantity, 0).toLocaleString()}</b></div>
              <div><span>Closing balance</span><b>{card.closing.toLocaleString()} {card.item.unit}</b></div>
            </div>
            {card.rows.length === 0 ? (
              <div className="dt-empty"><b>No movements in this period</b>Pick a wider date range.</div>
            ) : (
              <div className="dt-scroll">
                <table>
                  <thead><tr><th>When</th><th>Movement</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th><th>From / to</th><th className="hide-sm">Recorded by</th></tr></thead>
                  <tbody>
                    {card.rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(r.createdAt)}</td>
                        <td><span className={`pill ${r.type === "IN" ? "pill-green" : "pill-amber"}`}>{REASON_LABEL[r.reason] || r.reason}</span></td>
                        <td className="num">{r.type === "IN" ? r.quantity.toLocaleString() : ""}</td>
                        <td className="num">{r.type === "OUT" ? r.quantity.toLocaleString() : ""}</td>
                        <td className="num"><span className="dt-amount">{r.balance.toLocaleString()}</span></td>
                        <td>{r.type === "IN" ? r.supplier || "-" : r.issuedTo || (r.reason === "production" ? "Kitchen (recipe)" : "-")}</td>
                        <td className="hide-sm">{displayName(r.recordedBy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>

      {modal && (
        <MovementModal kind={modal} items={items} suppliers={suppliers} defaultItemId={itemId} onClose={() => setModal(null)} onSaved={refreshAfterWrite} />
      )}
    </div>
  );
};

/** Receive a purchase into the store, or issue stock out of it. */
function MovementModal({ kind, items, suppliers, defaultItemId, onClose, onSaved }: {
  kind: "receive" | "issue"; items: Item[]; suppliers: Supplier[]; defaultItemId: string; onClose: () => void; onSaved: () => void;
}) {
  const [itemId, setItemId] = useState(defaultItemId);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [issuedTo, setIssuedTo] = useState("Kitchen");
  const [reason, setReason] = useState("issue");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const item = items.find((i) => i.id === itemId);
  const receive = kind === "receive";

  useEffect(() => { if (receive && item && !unitCost) setUnitCost(String(item.unitCost || "")); }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (receive) await API.post("/procurement/receive", { inventoryItemId: itemId, quantity, unitCost, supplierId, reference, notes });
      else await API.post("/procurement/issue", { inventoryItemId: itemId, quantity, issuedTo, reason, notes });
      toast.success(receive ? "Purchase recorded" : "Stock issued", `${quantity} ${item?.unit ?? ""} of ${displayName(item?.name)}`);
      onSaved();
    } catch (err: any) {
      toast.error(receive ? "Could not record purchase" : "Could not issue stock", err.response?.data?.message);
    } finally {
      setSaving(false);
    }
  };

  const total = Number(quantity) * Number(unitCost || 0);
  return (
    <FormModal
      icon={receive ? ArrowDownToLine : ArrowUpFromLine}
      title={receive ? "Receive a purchase" : "Issue stock"}
      subtitle={receive ? "Record goods delivered into the store, with the supplier and what they cost." : "Record stock leaving the store, and who or where it went to."}
      statusLabel={receive ? "Purchase" : "Issue"}
      statusDetail={item ? `${displayName(item.name)} · ${item.stockLevel} ${item.unit} in store` : ""}
      submitLabel={receive ? `Receive${total > 0 ? ` · ${kes(total)}` : ""}` : "Issue stock"}
      submitting={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormSection id="item" icon={Boxes} title="Item">
        <div className="field">
          <FieldLabel htmlFor="mv-item" required>Item</FieldLabel>
          <select id="mv-item" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            <option value="">Choose an item…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{displayName(i.name)} ({i.stockLevel} {i.unit} in store)</option>)}
          </select>
        </div>
        <div className="fm-grid-2">
          <div className="field">
            <FieldLabel htmlFor="mv-qty" required hint={item?.unit}>Quantity</FieldLabel>
            <input id="mv-qty" type="number" min="0.001" step="any" max={!receive && item ? item.stockLevel : undefined} className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            {!receive && item && Number(quantity) > item.stockLevel && <span className="field-error">Only {item.stockLevel} {item.unit} in store.</span>}
          </div>
          {receive ? (
            <div className="field">
              <FieldLabel htmlFor="mv-cost" hint={`KES per ${item?.unit || "unit"}`}>Unit cost</FieldLabel>
              <input id="mv-cost" type="number" min="0" step="0.01" className="input" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <FieldLabel htmlFor="mv-to" required>Issued to</FieldLabel>
              <input id="mv-to" className="input" placeholder="e.g. Kitchen, Chef Mary, Staff room" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} required />
            </div>
          )}
        </div>
      </FormSection>
      <FormSection id="details" icon={receive ? Truck : ClipboardList} title={receive ? "Delivery" : "Reason"}>
        {receive ? (
          <div className="fm-grid-2">
            <div className="field">
              <FieldLabel htmlFor="mv-supplier" required>Supplier</FieldLabel>
              <select id="mv-supplier" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">Choose a supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{displayName(s.name)}</option>)}
              </select>
            </div>
            <div className="field">
              <FieldLabel htmlFor="mv-ref" hint="Optional">Invoice / delivery no.</FieldLabel>
              <input id="mv-ref" className="input mono" placeholder="e.g. INV-2026-042" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="field">
            <ChoicePills
              label="Reason"
              value={reason}
              options={[{ value: "issue", label: "Issued for cooking" }, { value: "usage", label: "Other use" }, { value: "spoilage", label: "Spoiled / wasted" }, { value: "adjustment", label: "Count correction" }]}
              onChange={setReason}
            />
          </div>
        )}
        <div className="field">
          <FieldLabel htmlFor="mv-notes" hint="Optional">Notes</FieldLabel>
          <input id="mv-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </FormSection>
    </FormModal>
  );
}

export default ProcurementPage;
