import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  Boxes,
  DatabaseBackup,
  DollarSign,
  FileText,
  Fingerprint,
  GraduationCap,
  Receipt,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import API from "@/services/api";
import { useLiveRefresh } from "@/services/live";
import LiveBadge from "@/components/page/LiveBadge";
import Loader from "@/components/ui/loader";
import WalletAdjustModal from "@/components/WalletAdjustModal";
import { useAuth } from "@/context/AuthContext";
import { PersonCell } from "@/components/page/DataTable";

// ─── Types ────────────────────────────────────────────────────────────────────
type CollectionRow = {
  id?: string;
  source?: string;
  channel?: string;
  amount: number;
  type: string;
  method: string;
  metadata: string;
  status: string;
  date: string;
  name: string;
  transactionRef?: string;
  allocatable?: boolean;
  payload?: Record<string, unknown>;
};

/** GET /api/admin/dashboard */
type DashboardStats = {
  students: number;
  walletTotal: number;
  fingerprintEnrolled: number;
  staff: number;
  pendingStaff: number;
  revenue: number;
  lowStock: number;
  openInvoices: number;
  invoicesOutstanding: number;
};

type RangeDays = 7 | 14 | 30;

/** GET /finance/overview (backend services/collectionsQuery.ts → collectionsOverview). */
type Overview = {
  days: number;
  series: { date: string; moneyIn: number; spend: number }[];
  totals: { moneyIn: number; spend: number; till: number; stk: number; cash: number };
  recent: CollectionRow[];
  unallocated: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const kes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const compactKes = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString();

/** Student wallet spending at the cafeteria. */
const isWalletSpend = (r: CollectionRow) => r.source === "wallet" && (r.type === "purchase" || r.type === "refund");

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ─── Small presentational pieces ──────────────────────────────────────────────
function StatCard({
  label, value, prefix, meta, icon, tone, to, linkLabel,
}: {
  label: string;
  value: string;
  prefix?: string;
  meta?: ReactNode;
  icon: ReactNode;
  tone: { bg: string; fg: string };
  to: string;
  linkLabel: string;
}) {
  return (
    <div className="db-stat">
      <div className="db-stat-top">
        <div className="min-w-0">
          <div className="db-stat-label">{label}</div>
          <div className="db-stat-value">{prefix && <small>{prefix}</small>}{value}</div>
        </div>
        <span className="db-chip" style={{ background: tone.bg, color: tone.fg }}>{icon}</span>
      </div>
      <div className="db-stat-meta">{meta}</div>
      <Link to={to} className="db-link">{linkLabel} <ArrowUpRight size={14} /></Link>
    </div>
  );
}

function Task({
  title, text, icon, tone, count, children,
}: {
  title: string;
  text: ReactNode;
  icon: ReactNode;
  tone: { bg: string; fg: string };
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="db-task">
      <div className="db-task-title">
        {title}
        {count != null && (
          <span className="db-count" style={{ background: count > 0 ? tone.bg : "var(--surface-3)", color: count > 0 ? tone.fg : "var(--muted)" }}>
            {count}
          </span>
        )}
      </div>
      <span className="db-task-icon" style={{ background: tone.bg, color: tone.fg }}>{icon}</span>
      <div className="db-task-text">{text}</div>
      {children && <div className="db-task-actions">{children}</div>}
    </div>
  );
}

const TONE = {
  navy: { bg: "#E8EEFB", fg: "#1E3A8A" },
  green: { bg: "#E9F7F0", fg: "#169A5B" },
  gold: { bg: "#FBF3DD", fg: "#9C6419" },
  red: { bg: "#FBEAEA", fg: "#D62828" },
  teal: { bg: "#E1F5F2", fg: "#0D7468" },
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  return (
    <div className="card" style={{ padding: "10px 12px", fontSize: 12.5, boxShadow: "var(--shadow-md)" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 99, background: "#1E3A8A", display: "inline-block" }} /> Money in <b style={{ marginLeft: "auto" }}>{kes(v("moneyIn"))}</b></div>
      <div className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 99, background: "#D4A017", display: "inline-block" }} /> Wallet spend <b style={{ marginLeft: "auto" }}>{kes(v("spend"))}</b></div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [range, setRange] = useState<RangeDays>(14);
  const [showWallet, setShowWallet] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoadError(null);
    try {
      // One request: the server counts and sums in the database instead of sending whole tables.
      const { data } = await API.get<DashboardStats>("/admin/dashboard");
      setStats(data);
    } catch (error: unknown) {
      const network = !!error && typeof error === "object" && (error as { code?: string }).code === "ERR_NETWORK";
      setLoadError(network ? "Can't reach the server. Check that the backend is running." : "Some dashboard data failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  /** silent: a live update; keep what's on screen while fetching and on failure. */
  const loadCollections = useCallback(async (silent = false) => {
    if (!silent) setRowsLoading(true);
    try {
      const r = await API.get<Overview>("/finance/overview", { params: { days: range } });
      setOverview(r.data);
    } catch {
      if (!silent) setOverview(null);
    } finally {
      setRowsLoading(false);
    }
  }, [range]);

  // New payments refresh the figures, chart and latest transactions without reloading the page.
  const live = useLiveRefresh(() => {
    loadCounts();
    loadCollections(true);
  });

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // ── Derived figures ──
  const studentCount = stats?.students ?? 0;
  const staffCount = stats?.staff ?? 0;
  const walletTotal = stats?.walletTotal ?? 0;
  const enrolled = stats?.fingerprintEnrolled ?? 0;
  const pendingStaff = stats?.pendingStaff ?? 0;
  const revenue = stats?.revenue ?? 0;
  const lowStock = stats ? stats.lowStock : null;
  const unallocated = overview?.unallocated ?? 0;

  const series = useMemo(
    () =>
      (overview?.series ?? []).map((d) => ({
        ...d,
        label: new Date(`${d.date}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" }),
      })),
    [overview],
  );
  const totals = overview?.totals ?? { moneyIn: 0, spend: 0, till: 0, stk: 0, cash: 0 };

  const recent = overview?.recent ?? [];

  const firstName = (user?.name || "there").split(/\s+/)[0];
  const today = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="db">
      {/* Header */}
      <div className="db-head">
        <div>
          <p className="db-eyebrow">{today}</p>
          <h1 className="db-title">{greeting()}, {firstName}</h1>
          <p className="db-sub">
            Here's how the cafeteria is doing.
            <LiveBadge live={live} />
          </p>
        </div>
        <div className="db-actions">
          <Link to="/students" className="btn btn-primary"><UserPlus size={16} /> Add student</Link>
          <button type="button" className="btn btn-primary" onClick={() => setShowWallet(true)}><Wallet size={16} /> Adjust a wallet</button>
          <Link to="/staffs" className="btn btn-ghost"><Users size={16} /> Add staff</Link>
          <Link to="/data-management" className="btn btn-ghost"><DatabaseBackup size={16} /> Backup</Link>
        </div>
      </div>

      {loadError && (
        <div className="alert-error"><AlertCircle size={16} /><span>{loadError}</span></div>
      )}

      {/* Stat cards */}
      {loading ? (
        <Loader size="sm" title="Loading dashboard…" subtitle="Fetching platform statistics" className="py-8" />
      ) : (
        <div className="db-stats">
          <StatCard
            label="Students"
            value={studentCount.toLocaleString()}
            meta={`${enrolled} with fingerprint · ${studentCount - enrolled} without`}
            icon={<GraduationCap size={21} />}
            tone={TONE.navy}
            to="/students"
            linkLabel="View students"
          />
          <StatCard
            label="Wallet balances"
            prefix="KES"
            value={Math.round(walletTotal).toLocaleString()}
            meta="Held across all student wallets"
            icon={<WalletCards size={21} />}
            tone={TONE.green}
            to="/collections?source=student_wallets"
            linkLabel="View wallet activity"
          />
          <StatCard
            label="Staff users"
            value={staffCount.toLocaleString()}
            meta={pendingStaff ? `${pendingStaff} waiting for approval` : "All accounts approved"}
            icon={<Users size={21} />}
            tone={TONE.teal}
            to="/staffs"
            linkLabel="View staff"
          />
          <StatCard
            label="Cafeteria revenue"
            prefix="KES"
            value={Math.round(revenue).toLocaleString()}
            meta="All completed sales"
            icon={<DollarSign size={21} />}
            tone={TONE.gold}
            to="/reports"
            linkLabel="View reports"
          />
        </div>
      )}

      <div className="db-main">
        <div className="db-col">
          {/* Chart */}
          <section className="db-card">
            <div className="db-card-head">
              <div>
                <h2 className="db-card-title">Money in vs wallet spend</h2>
                <p className="db-card-sub">M-Pesa and cash received, against meals paid from student wallets</p>
              </div>
              <div className="seg" role="tablist" aria-label="Date range">
                {([7, 14, 30] as RangeDays[]).map((d) => (
                  <button key={d} type="button" className={range === d ? "on" : ""} onClick={() => setRange(d)}>{d} days</button>
                ))}
              </div>
            </div>
            <div className="db-card-body">
              <div className="db-legend" style={{ marginBottom: 10 }}>
                <span><i style={{ background: "#1E3A8A" }} /> Money in · {kes(totals.moneyIn)}</span>
                <span><i style={{ background: "#D4A017" }} /> Wallet spend · {kes(totals.spend)}</span>
              </div>
              {rowsLoading ? (
                <Loader size="sm" title="Loading activity…" subtitle="Fetching payments and wallet purchases" className="py-10" />
              ) : (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dbIn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1E3A8A" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#1E3A8A" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dbSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#D4A017" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#D4A017" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#E3E8E5" strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: "#6B7670" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis tick={{ fontSize: 11.5, fill: "#6B7670" }} tickLine={false} axisLine={false} width={44} tickFormatter={compactKes} />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#D3DAD6" }} />
                      <Area type="monotone" dataKey="moneyIn" stroke="#1E3A8A" strokeWidth={2.5} fill="url(#dbIn)" />
                      <Area type="monotone" dataKey="spend" stroke="#D4A017" strokeWidth={2.5} fill="url(#dbSpend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="db-kpis">
              <div className="db-kpi"><span><Receipt size={13} /> Till (Buy Goods)</span><b>{kes(totals.till)}</b></div>
              <div className="db-kpi"><span><Smartphone size={13} /> STK push</span><b>{kes(totals.stk)}</b></div>
              <div className="db-kpi"><span><Banknote size={13} /> Cash</span><b>{kes(totals.cash)}</b></div>
              <div className="db-kpi"><span><Wallet size={13} /> Wallet spend</span><b>{kes(totals.spend)}</b></div>
            </div>
          </section>

          {/* Recent transactions */}
          <section className="db-card">
            <div className="db-card-head">
              <div>
                <h2 className="db-card-title">Latest transactions</h2>
                <p className="db-card-sub">Most recent payments and wallet purchases</p>
              </div>
              <Link to="/collections" className="db-link" style={{ border: 0, margin: 0, padding: 0 }}>Open collections <ArrowUpRight size={14} /></Link>
            </div>
            <div className="db-card-body" style={{ paddingTop: 12 }}>
              {rowsLoading ? (
                <Loader size="sm" title="Loading transactions…" subtitle="" className="py-6" />
              ) : recent.length === 0 ? (
                <div className="db-empty">No transactions yet.</div>
              ) : (
                <div className="tbl-wrap" style={{ border: "1px solid var(--border)", borderRadius: 12 }}>
                  <table className="tbl db-table">
                    <thead>
                      <tr><th>When</th><th>Who</th><th>Method</th><th>Reference</th><th style={{ textAlign: "right" }}>Amount</th></tr>
                    </thead>
                    <tbody>
                      {recent.map((r, i) => {
                        const spend = isWalletSpend(r);
                        return (
                          <tr key={r.id || i}>
                            <td>{new Date(r.date).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                            <td className="db-who">{r.name ? <PersonCell name={r.name} /> : "—"}</td>
                            <td><span className={`pill ${spend ? "pill-gold" : "pill-blue"}`}>{spend ? "Wallet purchase" : r.method}</span></td>
                            <td className="mono db-ref" title={spend ? undefined : r.transactionRef}>{spend ? "—" : r.transactionRef || "—"}</td>
                            <td className="db-amount" style={spend ? { color: "var(--amber)" } : undefined}>
                              {spend ? "−" : ""}{kes(Math.abs(r.amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right column: things that need attention */}
        <aside className="db-col">
          <section className="db-card">
            <div className="db-card-head" style={{ paddingBottom: 6 }}>
              <div>
                <h2 className="db-card-title">Needs attention</h2>
                <p className="db-card-sub">Work waiting for an admin</p>
              </div>
            </div>
            <Task
              title="Unallocated till payments"
              count={rowsLoading ? undefined : unallocated}
              tone={TONE.gold}
              icon={<Receipt size={20} />}
              text="M-Pesa payments that reached the till but aren't linked to a student wallet yet."
            >
              <Link to="/collections?source=unallocated" className="btn btn-gold">Allocate <ArrowUpRight size={13} /></Link>
            </Task>
            <Task
              title="Unpaid invoices"
              count={loading ? undefined : stats?.openInvoices ?? 0}
              tone={TONE.red}
              icon={<FileText size={20} />}
              text={stats?.openInvoices ? `KES ${Math.round(stats.invoicesOutstanding).toLocaleString()} still owed. Follow up with the waiters who served them.` : "No invoices waiting for payment."}
            >
              <Link to="/invoices?status=open" className="btn btn-ghost">Follow up <ArrowUpRight size={13} /></Link>
            </Task>
            <Task
              title="Pending approvals"
              count={loading ? undefined : pendingStaff}
              tone={TONE.navy}
              icon={<ShieldCheck size={20} />}
              text="Staff sign-ups waiting for you to approve or reject them."
            >
              <Link to="/pending-approvals" className="btn btn-primary">Review <ArrowUpRight size={13} /></Link>
            </Task>
            <Task
              title="Low stock"
              count={lowStock ?? undefined}
              tone={TONE.red}
              icon={<Boxes size={20} />}
              text="Raw ingredients at or below their reorder level."
            >
              <Link to="/inventory?tab=stock" className="btn btn-ghost">Check stock <ArrowUpRight size={13} /></Link>
            </Task>
          </section>

          <section className="db-card">
            <Task
              title="Fingerprint enrolment"
              tone={TONE.teal}
              icon={<Fingerprint size={20} />}
              text={
                studentCount
                  ? `${enrolled} of ${studentCount} students can pay with a fingerprint.`
                  : "No students yet."
              }
            >
              <div className="db-meter"><span style={{ width: `${studentCount ? Math.round((enrolled / studentCount) * 100) : 0}%` }} /></div>
              <b style={{ fontSize: 13 }}>{studentCount ? Math.round((enrolled / studentCount) * 100) : 0}%</b>
            </Task>
            <Task
              title="Backups"
              tone={TONE.green}
              icon={<DatabaseBackup size={20} />}
              text="Download a full backup before big changes, and keep a copy off the server."
            >
              <Link to="/data-management" className="btn btn-ghost">Back up now <ArrowUpRight size={13} /></Link>
            </Task>
          </section>
        </aside>
      </div>

      {showWallet && (
        <WalletAdjustModal
          onClose={() => setShowWallet(false)}
          onSuccess={() => { loadCounts(); loadCollections(); }}
        />
      )}
    </div>
  );
};

export default Dashboard;
