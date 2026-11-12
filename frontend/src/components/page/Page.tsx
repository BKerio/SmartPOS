import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/*
 * Shared page scaffolding so every screen opens the same way as the dashboard:
 * a light header (icon, eyebrow, title, subtitle, optional headline figure, actions) and
 * an optional row of stat tiles. Styles live in styles/page.css (.pg-*).
 */

export type Tone = "navy" | "green" | "gold" | "red" | "teal" | "gray";

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  metric,
  actions,
}: {
  icon?: LucideIcon;
  /** Small line above the title, e.g. the section ("Finance") */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Headline figure shown on the right, e.g. { label: "Total sales", value: "KES 12,400" } */
  metric?: { label: ReactNode; value: ReactNode; tone?: Tone };
  actions?: ReactNode;
}) {
  return (
    <header className="pg-head">
      <div className="pg-head-main">
        {Icon && (
          <span className="pg-head-icon" aria-hidden="true">
            <Icon size={22} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="pg-eyebrow">{eyebrow}</p>}
          <h1 className="pg-title">{title}</h1>
          {subtitle && <p className="pg-sub">{subtitle}</p>}
        </div>
      </div>
      {(metric || actions) && (
        <div className="pg-head-side">
          {metric && (
            <div className={`pg-metric tone-${metric.tone ?? "navy"}`}>
              <span>{metric.label}</span>
              <b>{metric.value}</b>
            </div>
          )}
          {actions && <div className="pg-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}

export function StatTiles({ children, cols }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  return <div className={`pg-stats${cols ? ` cols-${cols}` : ""}`}>{children}</div>;
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  title?: string;
}) {
  return (
    <div className="pg-stat" title={title}>
      <div className="pg-stat-top">
        <span className="pg-stat-label">{label}</span>
        {Icon && (
          <span className={`pg-chip tone-${tone}`} aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="pg-stat-value">{value}</div>
      {hint && <div className="pg-stat-hint">{hint}</div>}
    </div>
  );
}

/** Segmented control for switching views (replaces the white-on-navy toggles in the old banners). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(({ value: v, label: l, icon: I }) => (
        <button key={v} type="button" role="tab" aria-selected={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {I && <I size={15} />}
          {l}
        </button>
      ))}
    </div>
  );
}
