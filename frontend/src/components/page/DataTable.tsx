import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { avatarTone, displayName, initials } from "@/lib/text";

/*
 * Shared pieces for list pages (styles: styles/page.css, .dt-*):
 *   <Avatar>      round initials avatar with a stable colour per name
 *   <PersonCell>  avatar + name (Title-Cased when typed in all caps / all lowercase) + a sub line
 *   <SortHeader>  clickable column header with direction arrow
 *   <TablePager>  "Showing 1–25 of 170" + numbered pages
 */

export function Avatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const tone = avatarTone(name || "?");
  return (
    <span className={`dt-av dt-av-${size}`} style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub, extra }: { name?: string | null; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="dt-person">
      <Avatar name={name} />
      <div className="min-w-0">
        <b title={name || undefined}>{displayName(name) || "—"}</b>
        {sub != null && sub !== "" && <span>{sub}</span>}
        {extra}
      </div>
    </div>
  );
}

export type SortDir = "asc" | "desc";
export type Sort<K extends string> = { key: K; dir: SortDir };

export function SortHeader<K extends string>({ label, k, sort, onSort }: { label: ReactNode; k: K; sort: Sort<K>; onSort: (k: K) => void }) {
  const on = sort.key === k;
  return (
    <button
      type="button"
      className={`dt-sort${on ? " on" : ""}`}
      onClick={() => onSort(k)}
      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      {on ? sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} style={{ opacity: 0.4 }} />}
    </button>
  );
}

/** Toggles a sort: same column flips direction; a new column starts ascending for text, descending otherwise. */
export function nextSort<K extends string>(current: Sort<K>, key: K, textKeys: K[] = []): Sort<K> {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: textKeys.includes(key) ? "asc" : "desc" };
}

/** Page buttons with gaps (0 = "…"): 1 … 4 5 6 … 12 */
function pageNumbers(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const sorted = [...new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push(0);
    out.push(n);
  });
  return out;
}

export function TablePager({ page, pageSize, total, onPage, label = "records" }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="dt-foot">
      <span>
        Showing {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()} {label}
      </span>
      {pages > 1 && (
        <div className="dt-pages">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
          {pageNumbers(page, pages).map((n, i) =>
            n === 0 ? (
              <span key={`gap-${i}`}>…</span>
            ) : (
              <button key={n} type="button" className={n === page ? "on" : ""} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>
                {n}
              </button>
            ),
          )}
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
        </div>
      )}
    </div>
  );
}
