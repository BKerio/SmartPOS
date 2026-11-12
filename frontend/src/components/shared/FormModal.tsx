import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Gauge, X, type LucideIcon } from 'lucide-react';
import AppLoader from './AppLoader';

/*
 * Shared shell for create/edit forms: icon header, numbered step tabs with a
 * progress bar, scrolling body of <FormSection>s, and a footer with a live
 * status line plus Cancel / primary actions. Step tabs scroll to their
 * section and highlight whichever section is in view.
 *
 * `variant="page"` renders the same card inline (no overlay) for routes such
 * as /campaigns/new.
 */

export interface FormStep {
  /** Matches the `id` of a <FormSection> in the body. */
  id: string;
  label: string;
  done: boolean;
}

interface FormModalProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  steps?: FormStep[];
  /** Footer status, e.g. "New member" · "Jane Doe". */
  statusLabel: string;
  statusDetail?: string;
  submitLabel: string;
  submittingLabel?: string;
  submitIcon?: LucideIcon;
  submitting?: boolean;
  submitDisabled?: boolean;
  cancelLabel?: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  variant?: 'modal' | 'page';
  children: ReactNode;
}

function FormModal({
  icon: Icon, title, subtitle, steps = [], statusLabel, statusDetail,
  submitLabel, submittingLabel, submitIcon: SubmitIcon = Check, submitting, submitDisabled,
  cancelLabel = 'Cancel', onClose, onSubmit, variant = 'modal', children,
}: FormModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(steps[0]?.id);
  const isModal = variant === 'modal';
  const doneCount = steps.filter((s) => s.done).length;
  const percent = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const stepIds = steps.map((s) => s.id).join('|');

  // Highlight the last section whose heading has scrolled to the top of the body.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !stepIds) return;
    const ids = stepIds.split('|');
    const onScroll = () => {
      const top = body.getBoundingClientRect().top;
      let current = ids[0];
      for (const id of ids) {
        const el = body.querySelector<HTMLElement>(`[data-section="${id}"]`);
        if (el && el.getBoundingClientRect().top - top <= 48) current = id;
      }
      // Scrolled to the bottom of a body that actually scrolls: the last section is the one being read.
      const scrolls = body.scrollHeight > body.clientHeight + 4;
      if (scrolls && body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 4) current = ids[ids.length - 1];
      setActiveId(current);
    };
    onScroll();
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, [stepIds]);

  // Modal only: Escape closes, and the page behind doesn't scroll.
  useEffect(() => {
    if (!isModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isModal, onClose, submitting]);

  const goTo = (id: string) => {
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!body || !el) return;
    body.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    setActiveId(id);
  };

  const card = (
    <form
      className={`fm${isModal ? ' fm-modal' : ' fm-page'}`}
      onSubmit={onSubmit}
      // Native required/min/type checks stay on: SmartPOS forms rely on them.
      role={isModal ? 'dialog' : undefined}
      aria-modal={isModal || undefined}
      aria-labelledby="fm-title"
    >
      <header className="fm-head">
        <div className="fm-head-row">
          <span className="fm-head-icon" aria-hidden="true"><Icon size={22} /></span>
          <div className="fm-head-text">
            <h2 id="fm-title">{title}</h2>
            <p>{subtitle} Fields marked <span className="fm-req">*</span> are required.</p>
          </div>
          <button type="button" className="fm-close" onClick={onClose} disabled={submitting} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {steps.length > 1 && (
          <>
            <nav className="fm-steps" aria-label="Form sections">
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`fm-step${s.id === activeId ? ' active' : ''}${s.done ? ' done' : ''}`}
                  aria-current={s.id === activeId ? 'step' : undefined}
                  onClick={() => goTo(s.id)}
                >
                  <span className="fm-step-num">{s.done && s.id !== activeId ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                  {s.label}
                </button>
              ))}
            </nav>
            <div className="fm-progress">
              <span className="fm-progress-track">
                <span className="fm-progress-fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="fm-progress-text">{doneCount} of {steps.length} complete</span>
            </div>
          </>
        )}
      </header>

      <div className="fm-body scroll-thin" ref={bodyRef}>{children}</div>

      <footer className="fm-foot">
        <span className="fm-status">
          <Gauge size={15} aria-hidden="true" />
          <b>{statusLabel}</b>
          <span>· {statusDetail?.trim() || 'Untitled'}{steps.length > 1 ? ` · ${percent}%` : ''}</span>
        </span>
        <div className="fm-actions">
          <button type="button" className="fm-btn fm-btn-ghost" onClick={onClose} disabled={submitting}>{cancelLabel}</button>
          <button type="submit" className="fm-btn fm-btn-primary" disabled={submitting || submitDisabled}>
            {submitting ? <AppLoader size={16} color="#fff" /> : <SubmitIcon size={17} />}
            {submitting ? submittingLabel ?? 'Saving…' : submitLabel}
          </button>
        </div>
      </footer>
    </form>
  );

  if (!isModal) return card;
  return (
    <div className="fm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      {card}
    </div>
  );
}

/** A titled block inside the form body; `id` links it to a step tab. */
export function FormSection({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="fm-section" data-section={id}>
      <h3 className="fm-section-title">
        <span className="fm-section-icon" aria-hidden="true"><Icon size={17} /></span>
        {title}
      </h3>
      <div className="fm-section-body">{children}</div>
    </section>
  );
}

/** Field label with an optional required star and a right-aligned hint (e.g. a character count). */
export function FieldLabel({ htmlFor, required, hint, children }: { htmlFor?: string; required?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="fm-label-row">
      <label className="fm-label" htmlFor={htmlFor}>
        {children}{required && <span className="fm-req"> *</span>}
      </label>
      {hint != null && <span className="fm-hint">{hint}</span>}
    </div>
  );
}

/** Single-choice pill toggle ("Individual / Company" style). */
export function ChoicePills<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="fm-pills" role="radiogroup" aria-label={label}>
      {options.map(({ value: v, label: l, icon: PillIcon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={`fm-pill${v === value ? ' on' : ''}`}
          onClick={() => onChange(v)}
        >
          {PillIcon ? <PillIcon size={14} aria-hidden="true" /> : <span className="fm-pill-dot" aria-hidden="true" />}
          {l}
        </button>
      ))}
    </div>
  );
}

/** Two-letter tile used on choice cards ("Equity Bank" -> "EQ"). */
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? '?').slice(0, 2).toUpperCase();
}

export interface ChoiceCardOption {
  value: string;
  label: string;
  sub?: string;
  /** Tile text; defaults to the label's initials. */
  tile?: string;
}

/** Grid of selectable cards (bank-picker style); `multiple` turns it into checkboxes. */
export function ChoiceCards({ options, selected, onToggle, label, multiple, extra, columns = 4 }: {
  options: ChoiceCardOption[];
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
  multiple?: boolean;
  /** Trailing card, e.g. "+ New group". */
  extra?: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className={`fm-cards fm-cards-${columns}`} role={multiple ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            className={`fm-card${on ? ' on' : ''}`}
            onClick={() => onToggle(o.value)}
          >
            <span className="fm-card-tile" aria-hidden="true">{on ? <Check size={14} strokeWidth={3} /> : o.tile ?? initialsOf(o.label)}</span>
            <span className="fm-card-text">
              <b>{o.label}</b>
              {o.sub && <span>{o.sub}</span>}
            </span>
          </button>
        );
      })}
      {extra}
    </div>
  );
}

export default FormModal;

/**
 * Inline version of the FormModal card for forms that live on a page (no overlay, no close button):
 * same icon header, sections and status footer.
 */
export function FormCard({
  icon: Icon, title, subtitle, statusLabel, statusDetail, submitLabel, submittingLabel,
  submitIcon: SubmitIcon = Check, submitting, submitDisabled, onSubmit, onReset, resetLabel = 'Clear',
  requiredNote = true, danger, children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusDetail?: string;
  submitLabel: string;
  submittingLabel?: string;
  submitIcon?: LucideIcon;
  submitting?: boolean;
  submitDisabled?: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  /** Shows a secondary button that clears the form. */
  onReset?: () => void;
  resetLabel?: string;
  requiredNote?: boolean;
  /** Red submit button, for destructive actions. */
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <form className="fm fm-inline" onSubmit={onSubmit}>
      <header className="fm-head">
        <div className="fm-head-row">
          <span className="fm-head-icon" aria-hidden="true"><Icon size={22} /></span>
          <div className="fm-head-text">
            <h2>{title}</h2>
            <p>{subtitle}{requiredNote && <> Fields marked <span className="fm-req">*</span> are required.</>}</p>
          </div>
        </div>
      </header>
      <div className="fm-body">{children}</div>
      <footer className="fm-foot">
        <span className="fm-status">
          <Gauge size={15} aria-hidden="true" />
          <b>{statusLabel}</b>
          <span>· {statusDetail?.trim() || 'Untitled'}</span>
        </span>
        <div className="fm-actions">
          {onReset && (
            <button type="button" className="fm-btn fm-btn-ghost" onClick={onReset} disabled={submitting}>{resetLabel}</button>
          )}
          <button type="submit" className={`fm-btn fm-btn-primary${danger ? ' fm-btn-danger' : ''}`} disabled={submitting || submitDisabled}>
            {submitting ? <AppLoader size={16} color="#fff" /> : <SubmitIcon size={17} />}
            {submitting ? submittingLabel ?? 'Saving…' : submitLabel}
          </button>
        </div>
      </footer>
    </form>
  );
}
