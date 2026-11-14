import { useCallback, useEffect, useState } from "react";
import { ChefHat, ChevronLeft, ChevronRight, Download, Flame, Printer, ShoppingBag, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { PageHeader, StatTile, StatTiles } from "@/components/page/Page";
import { displayName, kes } from "@/lib/text";

type Daily = {
  date: string;
  summary: {
    salesAmount: number; salesCount: number; previousSalesAmount: number; invoicedAmount: number; invoiceCount: number;
    collectedOnInvoices: number; revenue: number; consumptionCost: number; grossMargin: number; marginPercent: number | null;
    purchasesCost: number; expenses: number; expenseCount: number; studentSales: number; guestSales: number;
  };
  paymentMethods: { method: string; count: number; amount: number }[];
  invoicePaymentMethods: { method: string; amount: number }[];
  hourly: { hour: number; amount: number; count: number; previousAmount?: number }[];
  itemsSold: { menuItemId: string; name: string; category: string; quantity: number; revenue: number }[];
  consumption: { inventoryItemId: string; name: string; unit: string; quantity: number; cost: number; reasons: Record<string, number> }[];
  purchases: { inventoryItemId: string; name: string; unit: string; quantity: number; cost: number }[];
  production: { menuItemId: string; name: string; portions: number; expectedRevenue: number; soldPortions: number; soldAmount: number }[];
};

const METHOD_LABEL: Record<string, string> = { wallet: "Student wallet", mpesa: "M-Pesa", cash: "Cash / till", bank: "Bank", card: "Card" };
const REASON_LABEL: Record<string, string> = { production: "cooking", issue: "issued", usage: "other use", spoilage: "spoiled", adjustment: "correction", sale: "sold" };
const eatToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const shift = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);

const compactKes = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString();

/** Same look as the dashboard's chart tooltip: the hour, then each line with its colour dot. */
function HourTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string; payload: { count: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const count = payload[0]?.payload?.count ?? 0;
  return (
    <div className="card" style={{ padding: "10px 12px", fontSize: 12.5, boxShadow: "var(--shadow-md)", minWidth: 180 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 99, background: "#1E3A8A", display: "inline-block" }} /> Sales <b style={{ marginLeft: "auto" }}>{kes(v("amount"))}</b></div>
      <div className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 99, background: "#D4A017", display: "inline-block" }} /> Day before <b style={{ marginLeft: "auto" }}>{kes(v("previousAmount"))}</b></div>
      <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>{count} sale{count === 1 ? "" : "s"} this hour</div>
    </div>
  );
}

const DailyReportPage = () => {
  const [date, setDate] = useState(eatToday());
  const [data, setData] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get<Daily>("/reports/daily", { params: { date } });
      setData(data);
    } catch (e: any) {
      toast.error("Could not load the daily report", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const change = s && s.previousSalesAmount > 0 ? ((s.salesAmount - s.previousSalesAmount) / s.previousSalesAmount) * 100 : null;
  const isToday = date === eatToday();
  const longDate = new Date(`${date}T12:00:00`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [
      `Daily report,${esc(longDate)}`, "",
      "Summary", `Sales (POS),${s!.salesAmount}`, `Invoiced,${s!.invoicedAmount}`, `Ingredients used (cost),${s!.consumptionCost}`, `Gross margin,${s!.grossMargin}`, `Purchases,${s!.purchasesCost}`, `Expenses,${s!.expenses}`, "",
      "Items sold,Category,Quantity,Revenue (KES)", ...data.itemsSold.map((i) => [i.name, i.category, i.quantity, i.revenue].map(esc).join(",")), "",
      "Ingredients used,Unit,Quantity,Cost (KES),Used for", ...data.consumption.map((c) => [c.name, c.unit, c.quantity, c.cost, Object.entries(c.reasons).map(([r, q]) => `${REASON_LABEL[r] || r} ${q}`).join("; ")].map(esc).join(",")), "",
      "Batches cooked,Portions,Expected revenue (KES),Sold portions", ...data.production.map((p) => [p.name, p.portions, p.expectedRevenue, p.soldPortions].map(esc).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `daily-report-${date}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 space-y-5" id="daily-report">
      <PageHeader
        icon={ChefHat}
        eyebrow="Reports"
        title="Daily report"
        subtitle={`Sales and kitchen consumption for ${longDate}`}
        actions={
          <>
            <div className="dr-day" role="group" aria-label="Choose day">
              <button type="button" className="icon-btn" onClick={() => setDate(shift(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button>
              <input type="date" className="input" style={{ width: 160, height: 40 }} value={date} max={eatToday()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" />
              <button type="button" className="icon-btn" onClick={() => setDate(shift(date, 1))} disabled={isToday} aria-label="Next day"><ChevronRight size={18} /></button>
              {!isToday && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(eatToday())}>Today</button>}
            </div>
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!data}><Download size={16} /> CSV</button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()} disabled={!data}><Printer size={16} /> Print</button>
          </>
        }
      />

      {loading && !data ? (
        <Loader size="md" title="Building the report…" className="py-16" />
      ) : !data ? null : (
        <div className="space-y-5" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
          <StatTiles cols={4}>
            <StatTile
              label="Sales"
              value={kes(s!.salesAmount)}
              hint={change === null ? `${s!.salesCount} sales` : `${s!.salesCount} sales · ${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs day before`}
              icon={change !== null && change < 0 ? TrendingDown : TrendingUp}
              tone={change !== null && change < 0 ? "red" : "green"}
            />
            <StatTile label="Ingredients used" value={kes(s!.consumptionCost)} hint={`${data.consumption.length} items from the store`} icon={Flame} tone="gold" />
            <StatTile
              label="Gross margin"
              value={kes(s!.grossMargin)}
              hint={s!.marginPercent === null ? "No sales" : `${s!.marginPercent.toFixed(0)}% of revenue${s!.invoicedAmount ? `, incl. ${kes(s!.invoicedAmount)} invoiced` : ""}`}
              icon={TrendingUp}
              tone="navy"
            />
            <StatTile label="Bought" value={kes(s!.purchasesCost)} hint={s!.expenses ? `+ ${kes(s!.expenses)} expenses` : "Stock purchases received"} icon={Truck} tone="teal" />
          </StatTiles>

          <div className="dr-grid">
            <section className="card">
              <div className="card-head"><span className="card-title">Sales by hour</span><span className="muted" style={{ fontSize: 12.5 }}>{s!.studentSales} student · {s!.guestSales} guest sales</span></div>
              <div style={{ padding: "14px 16px 6px" }}>
                <div className="db-legend" style={{ marginBottom: 10 }}>
                  <span><i style={{ background: "#1E3A8A" }} /> Sales · {kes(s!.salesAmount)}</span>
                  <span><i style={{ background: "#D4A017" }} /> Day before · {kes(s!.previousSalesAmount)}</span>
                </div>
                <div style={{ width: "100%", height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart
                      data={data.hourly.map((h) => ({ ...h, previousAmount: h.previousAmount ?? 0, label: `${String(h.hour).padStart(2, "0")}:00` }))}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="drSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1E3A8A" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#1E3A8A" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="drPrev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#D4A017" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#D4A017" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#E3E8E5" strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: "#6B7670" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis tick={{ fontSize: 11.5, fill: "#6B7670" }} tickLine={false} axisLine={false} width={44} tickFormatter={compactKes} />
                      <Tooltip content={<HourTooltip />} cursor={{ stroke: "#D3DAD6" }} />
                      <Area type="monotone" dataKey="previousAmount" stroke="#D4A017" strokeWidth={2.5} fill="url(#drPrev)" />
                      <Area type="monotone" dataKey="amount" stroke="#1E3A8A" strokeWidth={2.5} fill="url(#drSales)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
            <section className="card">
              <div className="card-head"><span className="card-title">How it was paid</span></div>
              <ul className="dr-methods">
                {data.paymentMethods.length === 0 && <li className="muted">No sales.</li>}
                {data.paymentMethods.map((m) => (
                  <li key={m.method}>
                    <span>{METHOD_LABEL[m.method] || m.method}<small>{m.count} sales</small></span>
                    <b>{kes(m.amount)}</b>
                    <i style={{ width: `${s!.salesAmount ? (m.amount / s!.salesAmount) * 100 : 0}%` }} />
                  </li>
                ))}
                {s!.invoicedAmount > 0 && (
                  <li><span>Invoiced (pay later)<small>{s!.invoiceCount} invoices</small></span><b>{kes(s!.invoicedAmount)}</b></li>
                )}
                {s!.collectedOnInvoices > 0 && (
                  <li><span>Collected on invoices<small>{data.invoicePaymentMethods.map((p) => METHOD_LABEL[p.method] || p.method).join(", ")}</small></span><b>{kes(s!.collectedOnInvoices)}</b></li>
                )}
              </ul>
            </section>
          </div>

          <div className="dr-grid even">
            <section className="dt">
              <div className="dt-toolbar"><b className="section-title"><ShoppingBag size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> What was sold</b><span className="dt-count">{data.itemsSold.length} items</span></div>
              {data.itemsSold.length === 0 ? <div className="dt-empty"><b>No sales</b>Nothing was sold on this day.</div> : (
                <div className="dt-scroll"><table>
                  <thead><tr><th>Item</th><th className="hide-sm">Category</th><th className="num">Qty</th><th className="num">Revenue</th><th className="num hide-sm">Share</th></tr></thead>
                  <tbody>{data.itemsSold.map((i) => (
                    <tr key={i.menuItemId}>
                      <td><b style={{ color: "var(--ink)", fontWeight: 650 }}>{displayName(i.name)}</b></td>
                      <td className="hide-sm"><span className="pill pill-gray">{i.category}</span></td>
                      <td className="num">{i.quantity.toLocaleString()}</td>
                      <td className="num"><span className="dt-amount">{kes(i.revenue)}</span></td>
                      <td className="num hide-sm">{s!.salesAmount ? `${((i.revenue / s!.salesAmount) * 100).toFixed(0)}%` : "-"}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>

            <section className="dt">
              <div className="dt-toolbar"><b className="section-title"><Flame size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> What was used to cook</b><span className="dt-count">{kes(s!.consumptionCost)}</span></div>
              {data.consumption.length === 0 ? <div className="dt-empty"><b>Nothing taken from the store</b>No recipe deductions or issues were recorded.</div> : (
                <div className="dt-scroll"><table>
                  <thead><tr><th>Ingredient</th><th className="num">Used</th><th className="hide-sm">For</th><th className="num">Cost</th></tr></thead>
                  <tbody>{data.consumption.map((c) => (
                    <tr key={c.inventoryItemId}>
                      <td><b style={{ color: "var(--ink)", fontWeight: 650 }}>{displayName(c.name)}</b></td>
                      <td className="num">{c.quantity.toLocaleString()} {c.unit}</td>
                      <td className="hide-sm" style={{ fontSize: 12.5 }}>{Object.entries(c.reasons).map(([r, q]) => `${REASON_LABEL[r] || r} ${q}`).join(" · ")}</td>
                      <td className="num"><span className="dt-amount">{kes(c.cost)}</span></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
          </div>

          {(data.production.length > 0 || data.purchases.length > 0) && (
            <div className="dr-grid even">
              {data.production.length > 0 && (
                <section className="dt">
                  <div className="dt-toolbar"><b className="section-title"><ChefHat size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> Batches cooked</b></div>
                  <div className="dt-scroll"><table>
                    <thead><tr><th>Dish</th><th className="num">Portions</th><th className="num">Sold</th><th className="num">Expected</th></tr></thead>
                    <tbody>{data.production.map((p, idx) => (
                      <tr key={`${p.menuItemId}-${idx}`}>
                        <td><b style={{ color: "var(--ink)", fontWeight: 650 }}>{displayName(p.name)}</b></td>
                        <td className="num">{p.portions}</td>
                        <td className="num">{p.soldPortions} <span className="dt-muted">({p.portions ? Math.round((p.soldPortions / p.portions) * 100) : 0}%)</span></td>
                        <td className="num"><span className="dt-amount">{kes(p.expectedRevenue)}</span></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </section>
              )}
              {data.purchases.length > 0 && (
                <section className="dt">
                  <div className="dt-toolbar"><b className="section-title"><Truck size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> Bought into the store</b></div>
                  <div className="dt-scroll"><table>
                    <thead><tr><th>Item</th><th className="num">Quantity</th><th className="num">Cost</th></tr></thead>
                    <tbody>{data.purchases.map((p) => (
                      <tr key={p.inventoryItemId}><td><b style={{ color: "var(--ink)", fontWeight: 650 }}>{displayName(p.name)}</b></td><td className="num">{p.quantity.toLocaleString()} {p.unit}</td><td className="num"><span className="dt-amount">{kes(p.cost)}</span></td></tr>
                    ))}</tbody>
                  </table></div>
                </section>
              )}
            </div>
          )}

          <p className="fm-note">
            Ingredient costs use the purchase price recorded on each delivery, or the item's latest unit cost. Recipe items are deducted
            when a batch is cooked; issues and spoilage come from Procurement.
          </p>
        </div>
      )}
    </div>
  );
};

export default DailyReportPage;
