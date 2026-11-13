import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, type LucideIcon } from "lucide-react";
import { avatarTone, displayName, initials } from "@/lib/text";

/*
 * Building blocks for account-type pages (profiles, settings, backup): one visual language so every
 * role's profile looks and behaves the same. Each section saves on its own, so changing a password
 * never re-submits the name form and vice versa.
 */

// ── Page shell ────────────────────────────────────────────────────────────────

/** Two-column account layout: main column of sections + a narrower aside. Stacks on small screens. */
export function AccountLayout({ main, aside }: { main: ReactNode; aside?: ReactNode }) {
  return (
    <div className={`ac-layout${aside ? "" : " single"}`}>
      <div className="ac-main">{main}</div>
      {aside && <aside className="ac-aside">{aside}</aside>}
    </div>
  );
}

// ── Profile hero ──────────────────────────────────────────────────────────────

export type HeroMeta = { icon: LucideIcon; label: ReactNode; title?: string };

export function ProfileHero({
  name,
  role,
  meta = [],
  badges,
  side,
}: {
  name: string;
  role: string;
  meta?: HeroMeta[];
  badges?: ReactNode;
  side?: ReactNode;
}) {
  const tone = avatarTone(name || "?");
  return (
    <section className="ac-hero">
      <div className="ac-hero-body">
        <span className="ac-avatar" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
          {initials(name)}
        </span>
        <div className="ac-hero-text">
          <div className="ac-hero-title">
            <h1 title={name}>{displayName(name) || "-"}</h1>
            <span className="pill pill-blue">{role}</span>
            {badges}
          </div>
          {meta.length > 0 && (
            <ul className="ac-hero-meta">
              {meta.map(({ icon: Icon, label, title }, i) => (
                <li key={i} title={title}>
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {side && <div className="ac-hero-side">{side}</div>}
      </div>
    </section>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

export function AcCard({
  icon: Icon,
  title,
  description,
  children,
  footer,
  onSubmit,
  tone,
  id,
  flush,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  tone?: "danger";
  id?: string;
  /** no body padding (lists, tables that run to the edge) */
  flush?: boolean;
}) {
  const inner = (
    <>
      <header className="ac-card-head">
        {Icon && (
          <span className={`ac-card-icon${tone === "danger" ? " danger" : ""}`} aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
        <div className="min-w-0">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>
      {children != null && <div className={`ac-card-body${flush ? " flush" : ""}`}>{children}</div>}
      {footer && <footer className="ac-card-foot">{footer}</footer>}
    </>
  );
  const cls = `ac-card${tone === "danger" ? " ac-card-danger" : ""}`;
  return onSubmit ? (
    <form id={id} className={cls} onSubmit={onSubmit} noValidate>
      {inner}
    </form>
  ) : (
    <section id={id} className={cls}>
      {inner}
    </section>
  );
}

/** Footer for a card form: hint on the left, discard + save on the right. */
export function CardActions({
  dirty,
  saving,
  saveLabel = "Save changes",
  savingLabel = "Saving…",
  disabled,
  onDiscard,
  hint,
}: {
  dirty: boolean;
  saving: boolean;
  saveLabel?: string;
  savingLabel?: string;
  disabled?: boolean;
  onDiscard?: () => void;
  hint?: ReactNode;
}) {
  return (
    <>
      <span className="ac-foot-hint">{hint ?? (dirty ? "You have unsaved changes" : "All changes saved")}</span>
      <div className="ac-foot-actions">
        {onDiscard && dirty && !saving && (
          <button type="button" className="btn btn-ghost" onClick={onDiscard}>
            Discard
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={!dirty || saving || disabled}>
          {saving && <Loader2 size={16} className="ac-spin" aria-hidden="true" />}
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </>
  );
}

// ── Rows, switch, info list ──────────────────────────────────────────────────

export function SettingRow({
  title,
  description,
  control,
  htmlFor,
}: {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="ac-row">
      <div className="min-w-0">
        {htmlFor ? <label htmlFor={htmlFor} className="ac-row-title">{title}</label> : <span className="ac-row-title">{title}</span>}
        {description && <span className="ac-row-desc">{description}</span>}
      </div>
      <div className="ac-row-control">{control}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  busy,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`ac-switch${checked ? " on" : ""}${busy ? " busy" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ac-switch-knob">{busy && <Loader2 size={12} className="ac-spin" aria-hidden="true" />}</span>
    </button>
  );
}

export type InfoItem = { label: ReactNode; value: ReactNode; icon?: LucideIcon; mono?: boolean };

export function InfoList({ items }: { items: InfoItem[] }) {
  return (
    <dl className="ac-info">
      {items.map((it, i) => (
        <div key={i}>
          <dt>
            {it.icon && <it.icon size={15} aria-hidden="true" />}
            {it.label}
          </dt>
          <dd className={it.mono ? "mono" : undefined}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Read-only value shown like a field (instead of an empty disabled input). */
export function ReadOnlyField({ label, value, hint, icon: Icon }: { label: string; value?: ReactNode; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="field">
      <span className="ac-ro-label">
        {label}
        {hint && <span className="fm-hint">{hint}</span>}
      </span>
      <div className="ac-ro">
        {Icon && <Icon size={16} aria-hidden="true" />}
        {value ? <span>{value}</span> : <span className="muted">Not set</span>}
      </div>
    </div>
  );
}

// ── Password ──────────────────────────────────────────────────────────────────

function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  if (pw.length < 7) return { score: 1, label: "Too short" };
  // One point for an acceptable length, then one each for: longer, mixed case, numbers or symbols.
  const points = 1 + Number(pw.length >= 11) + Number(/[a-z]/.test(pw) && /[A-Z]/.test(pw)) + Number(/[\d\W_]/.test(pw));
  const score = Math.min(4, points) as 1 | 2 | 3 | 4;
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="ac-pw">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        spellCheck={false}
      />
      <button type="button" className="ac-pw-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/**
 * Change-password card. Validates before calling onSave (length, match, differs from current) and
 * clears itself after a successful save. onSave should throw with a readable message on failure.
 */
export function PasswordCard({
  onSave,
  requireCurrent = true,
  minLength = 7,
  description = "Use at least 7 characters. A mix of letters, numbers and symbols is strongest.",
}: {
  onSave: (currentPassword: string, newPassword: string) => Promise<void>;
  requireCurrent?: boolean;
  minLength?: number;
  description?: ReactNode;
}) {
  const uid = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const st = useMemo(() => strength(next), [next]);
  const longEnough = next.length >= minLength;
  const matches = next.length > 0 && next === confirm;
  const differs = !requireCurrent || !current || next !== current;
  const ready = (!requireCurrent || current.length > 0) && longEnough && matches && differs;
  const dirty = Boolean(current || next || confirm);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError("");
    try {
      await onSave(current, next);
      reset();
    } catch (err: any) {
      setError(err?.message || "Could not change your password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcCard
      icon={KeyRound}
      title="Password"
      description={description}
      onSubmit={submit}
      footer={
        <CardActions
          dirty={dirty}
          saving={saving}
          disabled={!ready}
          saveLabel="Update password"
          savingLabel="Updating…"
          onDiscard={reset}
          hint={dirty ? (ready ? "Ready to update" : "Complete the checks below") : "Leave blank to keep your current password"}
        />
      }
    >
      {requireCurrent && (
        <div className="field">
          <label htmlFor={`${uid}-cur`} className="ac-ro-label">Current password</label>
          <PasswordInput id={`${uid}-cur`} value={current} onChange={setCurrent} autoComplete="current-password" placeholder="Enter your current password" />
        </div>
      )}
      <div className="fm-grid-2">
        <div className="field">
          <label htmlFor={`${uid}-new`} className="ac-ro-label">New password</label>
          <PasswordInput id={`${uid}-new`} value={next} onChange={setNext} autoComplete="new-password" />
          {next && (
            <div className={`ac-meter s${st.score}`} aria-live="polite">
              <span className="ac-meter-bars" aria-hidden="true"><i /><i /><i /><i /></span>
              <span>{st.label}</span>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-conf`} className="ac-ro-label">Confirm new password</label>
          <PasswordInput id={`${uid}-conf`} value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={confirm.length > 0 && !matches} />
        </div>
      </div>
      {dirty && (
        <ul className="ac-checks" aria-label="Password requirements">
          {requireCurrent && <li className={current ? "ok" : ""}><Check size={14} aria-hidden="true" />Current password entered</li>}
          <li className={longEnough ? "ok" : ""}><Check size={14} aria-hidden="true" />At least {minLength} characters</li>
          <li className={matches ? "ok" : ""}><Check size={14} aria-hidden="true" />Both new passwords match</li>
          {requireCurrent && <li className={current && next && differs ? "ok" : ""}><Check size={14} aria-hidden="true" />Different from the current one</li>}
        </ul>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </AcCard>
  );
}

/** 254712345678 / +254 712… → "0712 345 678" for display; anything else is returned as stored. */
export const fmtPhone = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/[^\d]/g, "");
  const local = d.startsWith("254") && d.length === 12 ? `0${d.slice(3)}` : d.length === 10 && d.startsWith("0") ? d : null;
  return local ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : raw;
};

/** Readable error text: the server's message, or a plain explanation when the request never got there. */
export function errorText(e: any, fallback = "Something went wrong. Please try again."): string {
  const server = e?.response?.data?.message || e?.response?.data?.error;
  if (server) return String(server);
  if (e?.response) return fallback;
  if (e?.code === "ECONNABORTED") return "The server took too long to answer. Please try again.";
  if (e?.request || e?.message === "Network Error") return "Couldn't reach the server. Check your connection and try again.";
  return e?.message || fallback;
}

/** "Member since 12 Mar 2026" style date. */
export const fmtDay = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "-";
