import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, MessageSquareText, Search, Send, Users, Eye } from "lucide-react";
import FormModal, { ChoiceCards, ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { displayName } from "@/lib/text";

export type Audience = "parents_all" | "parents_selected" | "students_all" | "students_selected";
type Person = { id: string; name: string; detail?: string; phone: string | null; parentPhone?: string | null; optedOut?: boolean };
type Preview = {
  total: number;
  reachable: number;
  skipped: number;
  reasons: Record<string, number>;
  smsParts: number;
  smsUnits: number;
  sample: { name: string; message: string } | null;
};

const MAX_LEN = 640;
const FIELDS = [
  { token: "{first_name}", label: "First name" },
  { token: "{name}", label: "Full name" },
  { token: "{student}", label: "Student" },
  { token: "{adm}", label: "Adm no." },
  { token: "{balance}", label: "Wallet balance" },
];
const parts = (text: string) => {
  const unicode = /[^\u0000-ÿ]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
};

/** Compose and send an SMS campaign to parents or students (all, one class, or chosen people). */
function CampaignComposer({ smsReady, onClose, onSent }: { smsReady: boolean; onClose: () => void; onSent: (id: string) => void }) {
  const [audience, setAudience] = useState<Audience>("parents_all");
  const [deliverTo, setDeliverTo] = useState<"self" | "parent">("parent");
  const [className, setClassName] = useState("");
  const [picked, setPicked] = useState<Map<string, Person>>(new Map());
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [classes, setClasses] = useState<{ name: string; count: number }[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const forStudents = audience.startsWith("students");
  const choosing = audience.endsWith("_selected");

  // Switching between parents and students starts the selection again.
  useEffect(() => {
    setPicked(new Map());
    setSearch("");
  }, [forStudents]);

  // People for the picker (and the class list for students).
  useEffect(() => {
    if (!choosing && !(forStudents && classes.length === 0)) return;
    const t = window.setTimeout(async () => {
      setLoadingPeople(true);
      try {
        const { data } = await API.get<{ rows: Person[]; classes: { name: string; count: number }[] }>("/campaigns/recipients", {
          params: { type: forStudents ? "students" : "parents", ...(search.trim() ? { search: search.trim() } : {}) },
        });
        setPeople(data.rows);
        if (forStudents && data.classes.length) setClasses(data.classes);
      } catch {
        setPeople([]);
      } finally {
        setLoadingPeople(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [choosing, forStudents, search, classes.length]);

  // Live preview: who gets it, who doesn't and why, SMS count, and a sample text.
  const ids = useMemo(() => [...picked.keys()], [picked]);
  useEffect(() => {
    if (choosing && ids.length === 0) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const { data } = await API.post<Preview>("/campaigns/preview", {
          audience,
          ids: choosing ? ids : undefined,
          deliverTo: forStudents ? deliverTo : undefined,
          className: audience === "students_all" && className ? className : undefined,
          message,
        });
        setPreview(data);
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [audience, ids, deliverTo, className, message, choosing, forStudents]);

  const insert = (token: string) => {
    const el = textRef.current;
    const start = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next.slice(0, MAX_LEN));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const toggle = (p: Person) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  const reachableShown = (p: Person) => (forStudents && deliverTo === "parent" ? p.parentPhone : p.phone) && !p.optedOut;

  const audienceLabel =
    audience === "parents_all" ? "All parents"
      : audience === "parents_selected" ? `${picked.size} chosen parent${picked.size === 1 ? "" : "s"}`
        : audience === "students_all" ? (className ? `Students in ${className}` : "All students")
          : `${picked.size} chosen student${picked.size === 1 ? "" : "s"}`;
  const len = message.length;
  const canSend = smsReady && !!message.trim() && !!preview && preview.reachable > 0 && !(choosing && picked.size === 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || !preview) return;
    const ok = await toast.confirm(`Send this SMS to ${preview.reachable.toLocaleString()} ${preview.reachable === 1 ? "person" : "people"}?`, {
      description: `${audienceLabel}${forStudents ? (deliverTo === "parent" ? ", sent to their parents' phones" : ", sent to the students' own phones") : ""}.`,
      points: [
        `${preview.smsUnits.toLocaleString()} SMS in total (${preview.smsParts} per message)`,
        ...(preview.skipped ? [`${preview.skipped} won't get it (no phone, opted out or duplicate number)`] : []),
        "Messages can't be recalled once sent",
      ],
      confirmLabel: "Send now",
      tone: "primary",
    });
    if (!ok) return;
    setSending(true);
    try {
      const { data } = await API.post<{ id: string }>("/campaigns", {
        title: title.trim() || undefined,
        message: message.trim(),
        audience,
        ids: choosing ? ids : undefined,
        deliverTo: forStudents ? deliverTo : undefined,
        className: audience === "students_all" && className ? className : undefined,
      });
      toast.success("Campaign started", `Sending to ${preview.reachable.toLocaleString()} ${preview.reachable === 1 ? "person" : "people"}. Progress updates live.`);
      onSent(data.id);
    } catch (err: any) {
      toast.error("Could not send", err.response?.data?.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <FormModal
      icon={Send}
      title="New SMS campaign"
      subtitle="Send an announcement to parents or students. Personal fields like {first_name} are filled in for each person."
      steps={[
        { id: "audience", label: "Audience", done: !choosing || picked.size > 0 },
        { id: "message", label: "Message", done: !!message.trim() },
        { id: "review", label: "Review", done: canSend },
      ]}
      statusLabel={audienceLabel}
      statusDetail={preview ? `${preview.reachable.toLocaleString()} will receive it · ${preview.smsUnits.toLocaleString()} SMS` : previewing ? "Counting…" : "Choose who gets it"}
      submitLabel={preview?.reachable ? `Send to ${preview.reachable.toLocaleString()}` : "Send"}
      submittingLabel="Starting…"
      submitIcon={Send}
      submitting={sending}
      submitDisabled={!canSend}
      onClose={onClose}
      onSubmit={submit}
    >
      {!smsReady && (
        <div className="ac-note warn" style={{ marginBottom: 6 }}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span>SMS is paused or not set up, so campaigns can't be sent. Turn SMS on in Settings first. You can still write and preview the message.</span>
        </div>
      )}

      <FormSection id="audience" icon={Users} title="Who should get it">
        <ChoiceCards
          label="Audience"
          columns={2}
          options={[
            { value: "parents_all", label: "All parents", sub: "Everyone with a parent account", tile: "AP" },
            { value: "parents_selected", label: "Choose parents", sub: "Pick one or more parents", tile: "CP" },
            { value: "students_all", label: "All students", sub: "Everyone, or one class", tile: "AS" },
            { value: "students_selected", label: "Choose students", sub: "Pick one or more students", tile: "CS" },
          ]}
          selected={[audience]}
          onToggle={(v) => setAudience(v as Audience)}
        />
        {forStudents && (
          <div className="field">
            <FieldLabel>Send to</FieldLabel>
            <ChoicePills<"self" | "parent">
              label="Send to"
              value={deliverTo}
              onChange={setDeliverTo}
              options={[
                { value: "parent", label: "Their parent's phone" },
                { value: "self", label: "The student's own phone" },
              ]}
            />
          </div>
        )}
        {audience === "students_all" && (
          <div className="field">
            <FieldLabel htmlFor="cp-class" hint="Optional">Only one class</FieldLabel>
            <select id="cp-class" className="input" value={className} onChange={(e) => setClassName(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
          </div>
        )}
        {choosing && (
          <div className="cp-picker">
            <div className="cp-picker-head">
              <div className="input-icon" style={{ flex: 1 }}>
                <input className="input" placeholder={forStudents ? "Search name, admission no. or phone" : "Search name or phone"} value={search} onChange={(e) => setSearch(e.target.value)} />
                <Search />
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked((m) => { const n = new Map(m); people.filter(reachableShown).forEach((p) => n.set(p.id, p)); return n; })} disabled={!people.length}>
                Select shown
              </button>
              {picked.size > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Map())}>Clear ({picked.size})</button>}
            </div>
            <ul className="cp-list" aria-label="People" aria-busy={loadingPeople}>
              {!loadingPeople && people.length === 0 && <li className="cp-empty">No one matches.</li>}
              {people.map((p) => {
                const on = picked.has(p.id);
                const phone = forStudents && deliverTo === "parent" ? p.parentPhone : p.phone;
                return (
                  <li key={p.id}>
                    <button type="button" className={`cp-person${on ? " on" : ""}`} onClick={() => toggle(p)} aria-pressed={on}>
                      <span className="cp-check" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
                      <span className="min-w-0">
                        <b>{displayName(p.name)}</b>
                        <small>{[p.detail, phone || (forStudents && deliverTo === "parent" ? "Parent has no phone" : "No phone")].filter(Boolean).join(" · ")}</small>
                      </span>
                      {p.optedOut && <span className="ac-chip warn">SMS off</span>}
                      {!phone && !p.optedOut && <span className="ac-chip off">No phone</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </FormSection>

      <FormSection id="message" icon={MessageSquareText} title="Message">
        <div className="field">
          <FieldLabel htmlFor="cp-title" hint="Optional, for your records">Campaign name</FieldLabel>
          <input id="cp-title" className="input" placeholder="e.g. Term 3 fees reminder" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </div>
        <div className="field">
          <FieldLabel htmlFor="cp-msg" required>Text message</FieldLabel>
          <textarea
            id="cp-msg"
            ref={textRef}
            className="input"
            rows={5}
            maxLength={MAX_LEN}
            placeholder="Dear {first_name}, the cafeteria will be closed on Friday for maintenance. Better Forks."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ resize: "vertical", minHeight: 110 }}
          />
          <div className="cp-msg-foot">
            <div className="cp-fields" aria-label="Insert a personal field">
              {FIELDS.map((f) => (
                <button key={f.token} type="button" className="cp-field" onClick={() => insert(f.token)} title={`Insert ${f.token}`}>
                  + {f.label}
                </button>
              ))}
            </div>
            <span className={`cp-count${len > 480 ? " warn" : ""}`}>{len}/{MAX_LEN} · {parts(message || " ")} SMS</span>
          </div>
        </div>
      </FormSection>

      <FormSection id="review" icon={Eye} title="Review">
        {!preview ? (
          <p className="fm-note">{previewing ? "Counting recipients…" : choosing ? "Pick at least one person to see who will receive it." : "Counting recipients…"}</p>
        ) : (
          <div className="cp-review">
            <div className="cp-stats">
              <div><b>{preview.reachable.toLocaleString()}</b><span>will receive it</span></div>
              <div><b>{preview.skipped.toLocaleString()}</b><span>won't</span></div>
              <div><b>{preview.smsUnits.toLocaleString()}</b><span>SMS in total</span></div>
            </div>
            {Object.keys(preview.reasons).length > 0 && (
              <ul className="cp-reasons">
                {Object.entries(preview.reasons).map(([why, n]) => (
                  <li key={why}><span>{why}</span><b>{n}</b></li>
                ))}
              </ul>
            )}
            {preview.sample && message.trim() && (
              <div className="cp-phone" aria-label="Message preview">
                <span className="cp-phone-to">To {preview.sample.name}</span>
                <div className="cp-bubble">{preview.sample.message}</div>
              </div>
            )}
          </div>
        )}
      </FormSection>
    </FormModal>
  );
}

export default CampaignComposer;
