import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  DatabaseBackup,
  Download,
  FileJson,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { PageHeader, StatTile, StatTiles } from "@/components/page/Page";
import { AcCard, errorText } from "@/components/account/Account";

type TableCount = { table: string; model: string; rows: number };
type Summary = { totalRows: number; tables: TableCount[] };

type LoadedBackup = {
  fileName: string;
  size: number;
  text: string;
  exportedAt?: string;
  exportedBy?: { name?: string; email?: string };
  version?: number;
  tables: { table: string; rows: number }[];
};

type SnapshotCheck = {
  fileName: string;
  size: number;
  exportedAt?: string;
  totalRows: number;
  tables: { table: string; rows: number }[];
  settingsIncluded: boolean;
};

type RestoreMode = "merge" | "replace";

type RestoreResult = {
  mode: RestoreMode;
  dryRun: boolean;
  tables: { table: string; inBackup: number; inserted: number; deleted: number }[];
  skippedTables: string[];
  droppedColumns: Record<string, string[]>;
  settingsRestored: boolean;
};

// ── Plain-language names for the database tables, grouped the way the business thinks about them ──
const TABLES: Record<string, { label: string; group: string }> = {
  admins: { label: "Administrators", group: "People" },
  users: { label: "Staff accounts", group: "People" },
  parents: { label: "Parents", group: "People" },
  students: { label: "Students", group: "People" },
  staff_attendance: { label: "Staff attendance", group: "People" },
  pos_transactions: { label: "Sales", group: "Sales & payments" },
  pos_transaction_items: { label: "Sale line items", group: "Sales & payments" },
  wallet_transactions: { label: "Wallet transactions", group: "Sales & payments" },
  kopo_payments: { label: "M-Pesa payments", group: "Sales & payments" },
  sales_invoices: { label: "Sales invoices", group: "Sales & payments" },
  sales_invoice_items: { label: "Invoice line items", group: "Sales & payments" },
  invoice_payments: { label: "Invoice payments", group: "Sales & payments" },
  expenses: { label: "Expenses", group: "Sales & payments" },
  menu_categories: { label: "Menu categories", group: "Kitchen & stock" },
  menu_items: { label: "Menu items", group: "Kitchen & stock" },
  menu_item_ingredients: { label: "Recipe ingredients", group: "Kitchen & stock" },
  production_batches: { label: "Cooked batches", group: "Kitchen & stock" },
  inventory_items: { label: "Store items", group: "Kitchen & stock" },
  stock_movements: { label: "Stock movements", group: "Kitchen & stock" },
  suppliers: { label: "Suppliers", group: "Kitchen & stock" },
  audit_events: { label: "Audit log entries", group: "System" },
  password_resets: { label: "Password reset codes", group: "System" },
};
const GROUP_ORDER = ["People", "Sales & payments", "Kitchen & stock", "System", "Other"];
const labelOf = (table: string) => TABLES[table]?.label ?? table.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const groupOf = (table: string) => TABLES[table]?.group ?? "Other";

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const fmtNum = (n: number) => n.toLocaleString();
const fmtWhen = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "unknown";

const LAST_BACKUP_KEY = "smartpos:last-backup";
const readLastBackup = (): { at: string; rows: number; size: number } | null => {
  try {
    return JSON.parse(localStorage.getItem(LAST_BACKUP_KEY) || "null");
  } catch {
    return null;
  }
};

/** Throws if the downloaded file is truncated, malformed, or is missing any table the database has. */
const verifySnapshot = (text: string, expectedTables: string[]) => {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The download was cut off before it finished (incomplete file). Try again.");
  }
  if (parsed?.format !== "smartpos-backup" || typeof parsed.tables !== "object") {
    throw new Error("The server did not return a SmartPOS backup.");
  }
  const tables = Object.entries(parsed.tables as Record<string, { rows?: unknown[]; rowCount?: number }>).map(([table, t]) => {
    if (!Array.isArray(t?.rows)) throw new Error(`"${labelOf(table)}" has no rows in the backup.`);
    if (typeof t.rowCount === "number" && t.rowCount !== t.rows.length) {
      throw new Error(`"${labelOf(table)}" is incomplete (${t.rows.length} of ${t.rowCount} records).`);
    }
    return { table, rows: t.rows.length };
  });
  const missing = expectedTables.filter((name) => !(name in parsed.tables));
  if (missing.length) throw new Error(`Backup is missing: ${missing.map(labelOf).join(", ")}`);
  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  if (typeof parsed.totalRows === "number" && parsed.totalRows !== totalRows) {
    throw new Error(`Record count mismatch (${totalRows} in file, server reported ${parsed.totalRows}).`);
  }
  return {
    exportedAt: parsed.exportedAt as string | undefined,
    totalRows,
    tables,
    settingsIncluded: Boolean(parsed.settings && typeof parsed.settings === "object"),
  };
};

const DataManagement = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [lastBackup, setLastBackup] = useState(readLastBackup);

  const [downloading, setDownloading] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [snapshot, setSnapshot] = useState<SnapshotCheck | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [backup, setBackup] = useState<LoadedBackup | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState<null | "dry" | "real">(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const { data } = await API.get<Summary>("/admin/backup/summary");
      setSummary(data);
    } catch (e: any) {
      toast.error("Could not count your data", errorText(e));
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, TableCount[]>();
    for (const t of summary?.tables ?? []) {
      const g = groupOf(t.table);
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      name: g,
      tables: map.get(g)!,
      total: map.get(g)!.reduce((s, t) => s + t.rows, 0),
    }));
  }, [summary]);

  const downloadBackup = async () => {
    setDownloading(true);
    setDownloadedBytes(0);
    setSnapshot(null);
    try {
      // Fresh table list so the check covers tables added since the page loaded.
      const expectedTables = await API.get<Summary>("/admin/backup/summary", { params: { fresh: 1 } })
        .then(({ data }) => {
          setSummary(data);
          return data.tables.map((t) => t.table);
        })
        .catch(() => summary?.tables.map((t) => t.table) ?? []);

      const res = await API.get("/admin/backup/export", {
        responseType: "blob",
        timeout: 0,
        onDownloadProgress: (e) => setDownloadedBytes(e.loaded),
      });
      const disposition = String(res.headers["content-disposition"] || "");
      const name = disposition.match(/filename="?([^"]+)"?/)?.[1] || `smartpos-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const blob = res.data as Blob;
      // Verify before saving so a truncated or partial snapshot is never kept as a "backup".
      const check = verifySnapshot(await blob.text(), expectedTables);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSnapshot({ fileName: name, size: blob.size, ...check });
      const record = { at: check.exportedAt || new Date().toISOString(), rows: check.totalRows, size: blob.size };
      try {
        localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(record));
      } catch {
        /* private mode: just don't remember it */
      }
      setLastBackup(record);
      toast.success("Backup downloaded and checked", `${fmtNum(check.totalRows)} records · ${fmtBytes(blob.size)}`);
    } catch (e: any) {
      let message = errorText(e);
      if (e.response?.data instanceof Blob) {
        try {
          message = JSON.parse(await e.response.data.text()).message;
        } catch {
          /* keep axios message */
        }
      }
      toast.error("Backup failed", message);
    } finally {
      setDownloading(false);
    }
  };

  const onPickFile = async (file: File | undefined) => {
    setResult(null);
    setBackup(null);
    setConfirmText("");
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.format !== "smartpos-backup" || typeof parsed.tables !== "object") {
        toast.error("Not a SmartPOS backup", "Choose a .json file downloaded from this page");
        return;
      }
      setBackup({
        fileName: file.name,
        size: file.size,
        text,
        exportedAt: parsed.exportedAt,
        exportedBy: parsed.exportedBy,
        version: parsed.version,
        tables: Object.entries(parsed.tables as Record<string, { rows?: unknown[] }>).map(([table, t]) => ({
          table,
          rows: Array.isArray(t?.rows) ? t.rows.length : 0,
        })),
      });
    } catch {
      toast.error("Can't read that file", "It isn't a valid backup file");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const runRestore = async (dryRun: boolean) => {
    if (!backup) return;
    if (!dryRun) {
      const ok = await toast.confirm(mode === "replace" ? "Replace ALL data with this backup?" : "Import missing records from this backup?", {
        description:
          mode === "replace"
            ? "Everything currently in the system is deleted and replaced. This can't be undone."
            : "Existing records stay as they are. Only records that aren't in the system are added.",
        confirmLabel: mode === "replace" ? "Replace everything" : "Import",
        danger: mode === "replace",
      });
      if (!ok) return;
    }

    setRunning(dryRun ? "dry" : "real");
    setUploadPct(0);
    setResult(null);
    try {
      // Splice the file text in as-is instead of re-serialising a potentially huge object.
      const body = `{"mode":${JSON.stringify(mode)},"dryRun":${dryRun},"confirm":${JSON.stringify(confirmText.trim())},"backup":${backup.text}}`;
      const { data } = await API.post<RestoreResult>("/admin/backup/import", body, {
        headers: { "Content-Type": "application/json" },
        transformRequest: [(d) => d],
        timeout: 0,
        onUploadProgress: (e) => e.total && setUploadPct(Math.round((e.loaded / e.total) * 100)),
      });
      setResult(data);
      const inserted = data.tables.reduce((s, t) => s + t.inserted, 0);
      if (dryRun) {
        toast.success("Test run passed", `${fmtNum(inserted)} records would be added. Nothing was changed.`);
      } else {
        toast.success("Restore complete", `${fmtNum(inserted)} records added`);
        setConfirmText("");
        loadSummary();
        if (mode === "replace") toast.info("Accounts were replaced", "If your login isn't in the backup, sign in again.");
      }
    } catch (e: any) {
      toast.error(dryRun ? "Test run failed" : "Restore failed", errorText(e));
    } finally {
      setRunning(null);
    }
  };

  const currentRows = (table: string) => summary?.tables.find((t) => t.table === table)?.rows;
  const backupTotal = backup?.tables.reduce((s, t) => s + t.rows, 0) ?? 0;
  const canRunReal = mode === "merge" || confirmText.trim() === "RESTORE";
  const tablesNotInBackup = backup
    ? (summary?.tables ?? []).filter((t) => !backup.tables.some((b) => b.table === t.table || b.table === t.model))
    : [];
  const tested = Boolean(result?.dryRun && result.mode === mode);
  const step = !backup ? 1 : result && !result.dryRun ? 4 : tested ? 3 : 2;
  const largest = summary?.tables.reduce<TableCount | null>((m, t) => (!m || t.rows > m.rows ? t : m), null);
  const backupAgeDays = lastBackup ? Math.floor((Date.now() - new Date(lastBackup.at).getTime()) / 86_400_000) : null;

  return (
    <div className="ac-page">
      <PageHeader
        icon={DatabaseBackup}
        eyebrow="System"
        title="Backup & restore"
        subtitle="Keep a safe copy of everything in SmartPOS, and bring it back if something goes wrong."
        actions={
          <button type="button" className="btn btn-primary" onClick={downloadBackup} disabled={downloading}>
            {downloading ? <Loader2 size={16} className="ac-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            {downloading ? `Preparing… ${downloadedBytes ? fmtBytes(downloadedBytes) : ""}` : "Download backup"}
          </button>
        }
      />

      <StatTiles>
        <StatTile icon={DatabaseBackup} tone="navy" label="Records stored" value={summary ? fmtNum(summary.totalRows) : "…"} hint={summary ? `${summary.tables.length} kinds of data` : "Counting"} />
        <StatTile icon={FileJson} tone="teal" label="Biggest set" value={largest ? fmtNum(largest.rows) : "…"} hint={largest ? labelOf(largest.table) : ""} />
        <StatTile
          icon={backupAgeDays !== null && backupAgeDays < 7 ? CheckCircle2 : AlertTriangle}
          tone={backupAgeDays === null || backupAgeDays >= 7 ? "gold" : "green"}
          label="Last backup (this browser)"
          value={lastBackup ? (backupAgeDays === 0 ? "Today" : `${backupAgeDays} day${backupAgeDays === 1 ? "" : "s"} ago`) : "None yet"}
          hint={lastBackup ? `${fmtNum(lastBackup.rows)} records · ${fmtBytes(lastBackup.size)}` : "Download one to keep a safe copy"}
        />
      </StatTiles>

      {snapshot && (
        <div className="ac-note ok" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>
            <b>{snapshot.fileName}</b> is complete and checked: {fmtNum(snapshot.totalRows)} records across {snapshot.tables.length} kinds of data
            {snapshot.settingsIncluded ? ", plus system settings" : ""}, taken {fmtWhen(snapshot.exportedAt)} ({fmtBytes(snapshot.size)}).
          </span>
        </div>
      )}
      <div className="ac-note warn">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>
          Backup files include password and wallet-PIN hashes and fingerprint data. Keep them somewhere private, such as an encrypted drive or a
          restricted cloud folder, and never send them to anyone.
        </span>
      </div>

      <AcCard
        icon={DatabaseBackup}
        title="What's in your system"
        description="Everything below goes into a backup file."
        flush
        footer={
          <>
            <span className="ac-foot-hint">{summary ? `${fmtNum(summary.totalRows)} records in total` : ""}</span>
            <button type="button" className="btn btn-ghost" onClick={loadSummary} disabled={loadingSummary}>
              <RefreshCw size={15} className={loadingSummary ? "ac-spin" : ""} aria-hidden="true" /> {loadingSummary ? "Counting…" : "Recount"}
            </button>
          </>
        }
      >
        {!summary ? (
          <p className="ac-empty">{loadingSummary ? "Counting records…" : "Couldn't count your data."}</p>
        ) : (
          <div className="bk-groups">
            {groups.map((g) => (
              <section key={g.name} className="bk-group" aria-label={g.name}>
                <h3>{g.name} <b>{fmtNum(g.total)}</b></h3>
                <ul>
                  {g.tables.map((t) => (
                    <li key={t.table} title={t.table}>
                      <span>{labelOf(t.table)}</span>
                      <b>{fmtNum(t.rows)}</b>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </AcCard>

      <AcCard icon={Upload} title="Restore from a backup" description="Load a backup file, test it, then restore. Everything runs as one step on the server: if any record fails, nothing changes.">
        <ol className="bk-steps" aria-label="Restore steps">
          {["Choose file", "Pick how", "Test run", "Restore"].map((label, i) => (
            <li key={label} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined}>
              <i>{step > i + 1 ? <CheckCircle2 size={14} /> : i + 1}</i>
              {label}
            </li>
          ))}
        </ol>

        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => onPickFile(e.target.files?.[0])} />
        <button
          type="button"
          className={`bk-drop${dragging ? " drag" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!running) onPickFile(e.dataTransfer.files?.[0]);
          }}
          disabled={Boolean(running)}
        >
          <span className="ico"><FileJson size={22} /></span>
          <span className="min-w-0">
            <b>{backup ? backup.fileName : "Choose a SmartPOS backup file"}</b>
            <small>
              {backup
                ? `${fmtBytes(backup.size)} · ${fmtNum(backupTotal)} records · taken ${fmtWhen(backup.exportedAt)}${backup.exportedBy?.name ? ` by ${backup.exportedBy.name}` : ""}`
                : "Drop the .json file here, or click to browse"}
            </small>
          </span>
          {backup && <span className="change">Change file</span>}
        </button>

        {backup && (
          <>
            <div role="radiogroup" aria-label="How to restore" className="bk-modes">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "merge"}
                className="bk-mode"
                onClick={() => {
                  setMode("merge");
                  setResult(null);
                }}
              >
                <span className="radio" aria-hidden="true" />
                <span>
                  <b>Add missing records (safe)</b>
                  <small>Keeps everything you have now and adds back anything that was deleted. Use this to recover lost records.</small>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "replace"}
                className="bk-mode danger"
                onClick={() => {
                  setMode("replace");
                  setResult(null);
                }}
              >
                <span className="radio" aria-hidden="true" />
                <span>
                  <b>Replace everything</b>
                  <small>Deletes all current data, then loads the backup exactly. Only for disaster recovery or moving servers.</small>
                </span>
              </button>
            </div>

            {mode === "replace" && (
              <div className="ac-note danger">
                <AlertTriangle size={16} aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 8px" }}>
                    This permanently deletes all current data, including staff and admin accounts. Download a fresh backup first. If your
                    account isn't in this backup you'll need to sign in with one that is.
                  </p>
                  <label htmlFor="dm-confirm" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Type RESTORE to confirm</label>
                  <input id="dm-confirm" className="input mono" placeholder="RESTORE" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" spellCheck={false} style={{ maxWidth: 240, background: "#fff" }} />
                </div>
              </div>
            )}

            {tablesNotInBackup.length > 0 && (
              <div className="ac-note warn">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  This backup has no {tablesNotInBackup.map((t) => labelOf(t.table).toLowerCase()).join(", ")} (it's probably from an older version).{" "}
                  {mode === "replace" ? "Replacing will leave those empty." : "Adding missing records leaves your current ones untouched."}
                </span>
              </div>
            )}

            {result && (
              <div className={`ac-note ${result.dryRun ? "info" : "ok"}`} role="status">
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>
                  {result.dryRun
                    ? `Test run passed: this backup can be restored and would add ${fmtNum(result.tables.reduce((s, t) => s + t.inserted, 0))} records. Nothing was changed.`
                    : `Restore finished: ${fmtNum(result.tables.reduce((s, t) => s + t.inserted, 0))} records added${result.settingsRestored ? ", and system settings restored" : ""}.`}
                  {Object.entries(result.droppedColumns).map(([table, cols]) => (
                    <span key={table} style={{ display: "block", marginTop: 4 }}>Ignored unknown fields in {labelOf(table)}: {cols.join(", ")}</span>
                  ))}
                </span>
              </div>
            )}
          </>
        )}
      </AcCard>

      {backup && (
        <AcCard
          title="Backup contents"
          description="Compare what's in the file with what's in the system now."
          flush
          footer={
            <>
              <span className="ac-foot-hint">
                {running
                  ? uploadPct < 100
                    ? `Uploading ${uploadPct}%…`
                    : "Working on the server. This can take a few minutes…"
                  : tested
                    ? "Test run passed. Ready to restore."
                    : "Run a test first: it checks everything without changing anything."}
              </span>
              <div className="ac-foot-actions">
                <button type="button" className="btn btn-ghost" onClick={() => runRestore(true)} disabled={Boolean(running)}>
                  {running === "dry" ? <Loader2 size={16} className="ac-spin" aria-hidden="true" /> : <FlaskConical size={16} aria-hidden="true" />}
                  {running === "dry" ? "Testing…" : "Test run"}
                </button>
                <button
                  type="button"
                  className={`btn ${mode === "replace" ? "btn-danger" : "btn-primary"}`}
                  onClick={() => runRestore(false)}
                  disabled={Boolean(running) || !canRunReal}
                  title={!canRunReal ? "Type RESTORE above to enable" : undefined}
                >
                  {running === "real" ? <Loader2 size={16} className="ac-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                  {running === "real" ? "Restoring…" : mode === "replace" ? "Replace everything" : "Add missing records"}
                </button>
              </div>
            </>
          }
        >
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="num">In file</th>
                  <th className="num">In system now</th>
                  {result && <th className="num">{result.dryRun ? "Would add" : "Added"}</th>}
                </tr>
              </thead>
              <tbody>
                {backup.tables.map((t) => {
                  const r = result?.tables.find((x) => x.table === t.table);
                  const unknown = result?.skippedTables.includes(t.table);
                  return (
                    <tr key={t.table}>
                      <td>
                        {labelOf(t.table)}
                        {unknown && <span className="ac-chip warn" style={{ marginLeft: 8 }}>ignored: not recognised</span>}
                        <small>{t.table}</small>
                      </td>
                      <td className="num">{fmtNum(t.rows)}</td>
                      <td className="num">{fmtNum(currentRows(t.table) ?? 0)}</td>
                      {result && <td className="num"><b>{r ? fmtNum(r.inserted) : "—"}</b></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AcCard>
      )}

      <details className="ac-card bk-guide">
        <summary>
          <span className="ac-card-icon" aria-hidden="true"><DatabaseBackup size={18} /></span>
          Moving SmartPOS to a new database server (for IT)
          <ChevronRight size={18} className="chev" aria-hidden="true" />
        </summary>
        <ol>
          <li>Download a backup from this page.</li>
          <li>
            Point <code>DATABASE_URL</code> and <code>DIRECT_URL</code> in <code>backend/.env</code> at the new database, then run{" "}
            <code>npx prisma db push</code> to create the tables.
          </li>
          <li>
            From <code>backend/</code>, run <code>npm run db:restore -- backup.json --mode=replace --yes</code>, or start the app, sign in with
            the seeded admin and use <b>Replace everything</b> here.
          </li>
        </ol>
      </details>
    </div>
  );
};

export default DataManagement;
