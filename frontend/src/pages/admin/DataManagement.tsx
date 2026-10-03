import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

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

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

const fmtNum = (n: number) => n.toLocaleString();

const card = "bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6";

/** Throws if the downloaded file is truncated, malformed, or is missing any table the database has. */
const verifySnapshot = (text: string, expectedTables: string[]) => {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The download was cut off before it finished (incomplete JSON). Try again.");
  }
  if (parsed?.format !== "smartpos-backup" || typeof parsed.tables !== "object") {
    throw new Error("The server did not return a SmartPOS backup.");
  }

  const tables = Object.entries(parsed.tables as Record<string, { rows?: unknown[]; rowCount?: number }>).map(
    ([table, t]) => {
      if (!Array.isArray(t?.rows)) throw new Error(`Table "${table}" has no rows in the backup.`);
      if (typeof t.rowCount === "number" && t.rowCount !== t.rows.length) {
        throw new Error(`Table "${table}" is incomplete (${t.rows.length} of ${t.rowCount} rows).`);
      }
      return { table, rows: t.rows.length };
    },
  );

  const missing = expectedTables.filter((name) => !(name in parsed.tables));
  if (missing.length) throw new Error(`Backup is missing tables: ${missing.join(", ")}`);

  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  if (typeof parsed.totalRows === "number" && parsed.totalRows !== totalRows) {
    throw new Error(`Row total mismatch (${totalRows} in file, server reported ${parsed.totalRows}).`);
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

  const [downloading, setDownloading] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [snapshot, setSnapshot] = useState<SnapshotCheck | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
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
      toast.error("Failed to load data summary", e.response?.data?.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const downloadBackup = async () => {
    setDownloading(true);
    setDownloadedBytes(0);
    setSnapshot(null);
    try {
      // Fresh table list from the server so the check covers tables added since the page loaded.
      const expectedTables = await API.get<Summary>("/admin/backup/summary")
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
      const name =
        disposition.match(/filename="?([^"]+)"?/)?.[1] ||
        `smartpos-backup-${new Date().toISOString().slice(0, 10)}.json`;

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
      toast.success(
        "Backup downloaded & verified",
        `${name} - ${fmtNum(check.totalRows)} rows across ${check.tables.length} tables (${fmtBytes(blob.size)})`,
      );
    } catch (e: any) {
      let message = e.message;
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
      toast.error("Invalid file", "The file is not valid JSON");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const runRestore = async (dryRun: boolean) => {
    if (!backup) return;
    if (!dryRun) {
      const ok = await toast.confirm(
        mode === "replace" ? "Replace ALL data with this backup?" : "Import missing records from this backup?",
        {
          confirmLabel: mode === "replace" ? "Replace data" : "Import",
        },
      );
      if (!ok) return;
    }

    setRunning(dryRun ? "dry" : "real");
    setUploadPct(0);
    setResult(null);
    try {
      // Splice the file text in as-is instead of re-serialising a potentially huge object.
      const body =
        `{"mode":${JSON.stringify(mode)},"dryRun":${dryRun},"confirm":${JSON.stringify(confirmText.trim())},` +
        `"backup":${backup.text}}`;
      const { data } = await API.post<RestoreResult>("/admin/backup/import", body, {
        headers: { "Content-Type": "application/json" },
        transformRequest: [(d) => d],
        timeout: 0,
        onUploadProgress: (e) => e.total && setUploadPct(Math.round((e.loaded / e.total) * 100)),
      });
      setResult(data);
      const inserted = data.tables.reduce((s, t) => s + t.inserted, 0);
      if (dryRun) {
        toast.success("Validation passed", `${fmtNum(inserted)} rows would be inserted. Nothing was changed.`);
      } else {
        toast.success("Restore complete", `${fmtNum(inserted)} rows inserted`);
        setConfirmText("");
        loadSummary();
        if (mode === "replace") {
          toast.info("Accounts were replaced", "If your login no longer exists in the backup, sign in again.");
        }
      }
    } catch (e: any) {
      toast.error(dryRun ? "Validation failed" : "Restore failed", e.response?.data?.message || e.message);
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

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DatabaseBackup size={28} /> Backup &amp; Restore
          </h1>
          <p className="text-blue-200 text-sm mt-1">
            Download all system data as JSON for safekeeping or migration, and restore it into this or any other
            PostgreSQL database running SmartPOS.
          </p>
        </div>

        {/* ── Export ─────────────────────────────────────────────── */}
        <section className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#0A1F44]">Download backup</p>
              <p className="text-sm text-gray-500 mt-1">
                A complete snapshot of every table{summary ? ` - ${fmtNum(summary.totalRows)} rows` : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadBackup}
              disabled={downloading}
              className="px-5 py-2.5 bg-[#0A1F44] hover:bg-[#0A1F44]/90 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Download size={16} />
              {downloading
                ? `Preparing… ${downloadedBytes ? fmtBytes(downloadedBytes) : ""}`
                : "Download JSON backup"}
            </button>
          </div>

          {snapshot && (
            <div className="flex gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <p>
                <b>{snapshot.fileName}</b> verified - complete point-in-time snapshot of{" "}
                {fmtNum(snapshot.totalRows)} rows across all {snapshot.tables.length} tables
                {snapshot.settingsIncluded ? " plus system settings" : ""}
                {snapshot.exportedAt ? `, taken ${new Date(snapshot.exportedAt).toLocaleString()}` : ""} (
                {fmtBytes(snapshot.size)}).
              </p>
            </div>
          )}

          <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <p>
              Backups contain password hashes, wallet PIN hashes and fingerprint templates. Store them somewhere
              private (encrypted drive or restricted cloud folder) and never share them.
            </p>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase">Current data</span>
              <button
                type="button"
                onClick={loadSummary}
                className="text-gray-400 hover:text-[#0A1F44]"
                title="Refresh counts"
              >
                <RefreshCw size={14} className={loadingSummary ? "animate-spin" : ""} />
              </button>
            </div>
            {loadingSummary && !summary ? (
              <Loader size="sm" title="Counting records..." className="py-6" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-100">
                {summary?.tables.map((t) => (
                  <div key={t.table} className="bg-white px-4 py-2.5">
                    <p className="text-[11px] text-gray-400 font-mono truncate">{t.table}</p>
                    <p className="font-semibold text-[#0A1F44]">{fmtNum(t.rows)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Import ─────────────────────────────────────────────── */}
        <section className={`${card} space-y-4`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0A1F44]">Restore / import</p>
            <p className="text-sm text-gray-500 mt-1">
              Load a backup file. Everything runs in a single transaction - if any row fails, nothing is changed.
            </p>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={Boolean(running)}
            className="w-full border-2 border-dashed border-gray-200 hover:border-[#0A1F44]/40 rounded-xl py-6 text-sm text-gray-500 flex flex-col items-center gap-2 disabled:opacity-50"
          >
            <FileJson size={28} className="text-[#0A1F44]/60" />
            {backup ? (
              <span>
                <b className="text-[#0A1F44]">{backup.fileName}</b> · {fmtBytes(backup.size)} - click to choose
                another
              </span>
            ) : (
              <span>Choose a SmartPOS backup (.json)</span>
            )}
          </button>

          {backup && (
            <>
              <div className="text-sm text-gray-600 grid sm:grid-cols-3 gap-2">
                <p>
                  <span className="text-gray-400">Exported:</span>{" "}
                  {backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : "unknown"}
                </p>
                <p>
                  <span className="text-gray-400">By:</span>{" "}
                  {backup.exportedBy?.name || backup.exportedBy?.email || "unknown"}
                </p>
                <p>
                  <span className="text-gray-400">Rows:</span> {fmtNum(backupTotal)} in {backup.tables.length} tables
                </p>
              </div>

              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">Table</th>
                      <th className="px-4 py-2 text-right">In backup</th>
                      <th className="px-4 py-2 text-right">Currently</th>
                      {result && <th className="px-4 py-2 text-right">{result.dryRun ? "Would insert" : "Inserted"}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {backup.tables.map((t) => {
                      const r = result?.tables.find((x) => x.table === t.table);
                      const unknown = result?.skippedTables.includes(t.table);
                      return (
                        <tr key={t.table} className="border-t border-gray-50">
                          <td className="px-4 py-2 font-mono text-xs">
                            {t.table}
                            {unknown && <span className="ml-2 text-amber-600 font-sans">(ignored - unknown table)</span>}
                          </td>
                          <td className="px-4 py-2 text-right">{fmtNum(t.rows)}</td>
                          <td className="px-4 py-2 text-right text-gray-400">{fmtNum(currentRows(t.table) ?? 0)}</td>
                          {result && (
                            <td className="px-4 py-2 text-right font-semibold text-[#0A1F44]">
                              {r ? fmtNum(r.inserted) : "-"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {tablesNotInBackup.length > 0 && (
                <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>
                    This backup doesn't include {tablesNotInBackup.map((t) => t.table).join(", ")} (probably an older
                    backup).{" "}
                    {mode === "replace"
                      ? `Replace will leave ${tablesNotInBackup.length === 1 ? "that table" : "those tables"} empty.`
                      : "Merge leaves their current data untouched."}
                  </p>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                {(
                  [
                    {
                      value: "merge",
                      title: "Merge (safe)",
                      text: "Keep existing data and add records from the backup that don't exist yet. Use to recover deleted records.",
                    },
                    {
                      value: "replace",
                      title: "Replace everything",
                      text: "Delete ALL current data, then load the backup exactly. Use for disaster recovery or a fresh database.",
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-xl border p-4 ${
                      mode === opt.value
                        ? opt.value === "replace"
                          ? "border-red-300 bg-red-50/60"
                          : "border-[#0A1F44]/40 bg-[#0A1F44]/5"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="restore-mode"
                        checked={mode === opt.value}
                        onChange={() => {
                          setMode(opt.value);
                          setResult(null);
                        }}
                      />
                      <span className="font-semibold text-[#0A1F44] text-sm">{opt.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 pl-5">{opt.text}</p>
                  </label>
                ))}
              </div>

              {mode === "replace" && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                  <p className="text-sm text-red-700 flex items-center gap-2 font-semibold">
                    <AlertTriangle size={16} /> This permanently deletes all current data
                  </p>
                  <p className="text-xs text-red-600">
                    Download a backup of the current data first. Admin and staff accounts are also replaced - if yours
                    isn't in the backup you'll need to sign in with an account that is. Type <b>RESTORE</b> to enable.
                  </p>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="RESTORE"
                    className="w-full sm:w-60 px-3 py-2 border border-red-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              )}

              {result && (
                <div
                  className={`rounded-xl border p-3 text-sm flex gap-2 ${
                    result.dryRun ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"
                  }`}
                >
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>
                      {result.dryRun
                        ? "Validation passed - the backup can be restored. Nothing was changed."
                        : `Restore finished (${result.mode}).`}
                      {!result.dryRun && result.settingsRestored && " System settings were restored too."}
                    </p>
                    {Object.entries(result.droppedColumns).map(([table, cols]) => (
                      <p key={table} className="text-xs text-amber-700">
                        Ignored unknown columns in {table}: {cols.join(", ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-center">
                <button
                  type="button"
                  onClick={() => runRestore(true)}
                  disabled={Boolean(running)}
                  className="px-5 py-2.5 border border-[#0A1F44]/20 text-[#0A1F44] rounded-xl text-sm font-semibold hover:bg-[#0A1F44]/5 disabled:opacity-50"
                >
                  {running === "dry" ? "Validating…" : "Validate (dry run)"}
                </button>
                <button
                  type="button"
                  onClick={() => runRestore(false)}
                  disabled={Boolean(running) || !canRunReal}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-40 ${
                    mode === "replace" ? "bg-red-600 hover:bg-red-700" : "bg-[#0A1F44] hover:bg-[#0A1F44]/90"
                  }`}
                >
                  <Upload size={16} />
                  {running === "real" ? "Restoring…" : mode === "replace" ? "Replace all data" : "Import missing records"}
                </button>
                {running && (
                  <span className="text-xs text-gray-500">
                    {uploadPct < 100 ? `Uploading ${uploadPct}%` : "Processing on server - this can take a few minutes…"}
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        <section className={`${card} space-y-2 text-sm text-gray-600`}>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0A1F44]">Migrating to a new PostgreSQL server</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Download a backup from this page.</li>
            <li>
              Point <code className="text-xs bg-gray-100 px-1 rounded">DATABASE_URL</code> /{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">DIRECT_URL</code> in <code className="text-xs bg-gray-100 px-1 rounded">backend/.env</code> at the new database and run{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">npx prisma db push</code> to create the tables.
            </li>
            <li>
              Run <code className="text-xs bg-gray-100 px-1 rounded">npm run db:restore -- backup.json --mode=replace --yes</code>{" "}
              from <code className="text-xs bg-gray-100 px-1 rounded">backend/</code> (or start the app, sign in with the
              seeded admin and use Replace here).
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
};

export default DataManagement;
