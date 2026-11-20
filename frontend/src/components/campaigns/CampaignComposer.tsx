import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, MessageSquareText, Search, Send, Users, Eye } from "lucide-react";
import FormModal, { ChoiceCards, ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { displayName } from "@/lib/text";
import { useAuth } from "@/context/AuthContext";
import { Switch } from "@/components/account/Account";

export type Audience = "parents_all" | "parents_selected" | "students_all" | "students_selected" | "everyone" | "mixed_selected";
type Kind = "parents" | "students";
type Person = { id: string; name: string; detail?: string; phone: string | null; parentPhone?: string | null; optedOut?: boolean; kind?: Kind };
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
  { token: "{{name}}", label: "Full name" },
  { token: "{{first_name}}", label: "First name" },
  { token: "{{student}}", label: "Student" },
  { token: "{{adm}}", label: "Adm no." },
  { token: "{{balance}}", label: "Wallet balance" },
];
// GSM-7 / Latin-1 fits 160 chars per SMS; anything beyond (emoji, other scripts) switches to Unicode (70).
const isUnicode = (text: string) => /[^\x00-\xff]/.test(text);
const parts = (text: string) => {
  const unicode = isUnicode(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
};

/** Compose and send an SMS campaign to parents or students (all, one class, or chosen people). */
function CampaignComposer({ smsReady, onClose, onSent }: { smsReady: boolean; onClose: () => void; onSent: (id: string) => void }) {
  const [audience, setAudience] = useState<Audience>("parents_all");
  const [deliverTo, setDeliverTo] = useState<"self" | "parent">("parent");
  const [className, setClassName] = useState("");
  // Picks remember whether each person is a parent or a student, so both can be chosen for one campaign.
  const [picked, setPicked] = useState<Map<string, Person & { kind: Kind }>>(new Map());
  const [tab, setTab] = useState<Kind>("parents");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [classes, setClasses] = useState<{ name: string; count: number }[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  // Signature on its own line at the end of every message. Defaults to the last one used (shared by all
  // admins), or "From <your name> - BetterFork Restaurant Limited." the first time.
  const { user } = useAuth();
  const [useSignature, setUseSignature] = useState(true);
  const [signature, setSignature] = useState("");
  useEffect(() => {
    const fallback = `From ${displayName(user?.name || "") || "the Admin"} - BetterFork Restaurant Limited.`;
    API.get<{ signature?: string }>("/campaigns/status")
      .then(({ data }) => setSignature(data.signature?.trim() || fallback))
      .catch(() => setSignature(fallback));
  }, [user?.name]);
  const sig = useSignature ? signature.trim() : "";
  /** Exactly what each person receives (before their personal fields are filled in). */
  const fullText = sig ? `${message.trim()}\n${sig}` : message;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const choosing = audience.endsWith("_selected");
  const mixed = audience === "mixed_selected";
  /** Students are (also) in this audience: the "send to" choice applies. */
  const withStudents = audience.startsWith("students") || audience === "everyone" || mixed;
  /** Which list the picker shows right now. */
  const listKind: Kind = mixed ? tab : audience.startsWith("students") ? "students" : "parents";
  const forStudents = listKind === "students";

  // People for the picker (and the class list for students).
  useEffect(() => {
    if (!choosing && !(audience === "students_all" && classes.length === 0)) return;
    const t = window.setTimeout(async () => {
      setLoadingPeople(true);
      try {
        const { data } = await API.get<{ rows: Person[]; classes: { name: string; count: number }[] }>("/campaigns/recipients", {
          params: { type: choosing ? listKind : "students", ...(search.trim() ? { search: search.trim() } : {}) },
        });
        setPeople(data.rows.map((r) => ({ ...r, kind: choosing ? listKind : "students" })));
        if (data.classes.length) setClasses(data.classes);
      } catch {
        setPeople([]);
      } finally {
        setLoadingPeople(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [choosing, listKind, audience, search, classes.length]);

  // Live preview: who gets it, who doesn't and why, SMS count, and a sample text.
  const parentIds = useMemo(() => [...picked.values()].filter((p) => p.kind === "parents").map((p) => p.id), [picked]);
  const studentIds = useMemo(() => [...picked.values()].filter((p) => p.kind === "students").map((p) => p.id), [picked]);
  const chosenCount =
    audience === "parents_selected" ? parentIds.length : audience === "students_selected" ? studentIds.length : mixed ? parentIds.length + studentIds.length : 0;
  const audiencePayload = () => ({
    audience,
    ...(audience === "parents_selected" ? { ids: parentIds } : {}),
    ...(audience === "students_selected" ? { ids: studentIds } : {}),
    ...(mixed ? { parentIds, studentIds } : {}),
    ...(withStudents ? { deliverTo } : {}),
    ...(audience === "students_all" && className ? { className } : {}),
  });
  useEffect(() => {
    if (choosing && chosenCount === 0) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const { data } = await API.post<Preview>("/campaigns/preview", { ...audiencePayload(), message, ...(sig ? { signature: sig } : {}) });
        setPreview(data);
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, parentIds, studentIds, deliverTo, className, message, sig, choosing, chosenCount]);

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

  const keyOf = (p: Person) => `${p.kind ?? listKind}:${p.id}`;
  const toggle = (p: Person) =>
    setPicked((m) => {
      const next = new Map(m);
      const k = keyOf(p);
      if (next.has(k)) next.delete(k);
      else next.set(k, { ...p, kind: p.kind ?? listKind });
      return next;
    });
  const reachableShown = (p: Person) => (forStudents && deliverTo === "parent" ? p.parentPhone : p.phone) && !p.optedOut;

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const audienceLabel =
    audience === "parents_all" ? "All parents"
      : audience === "parents_selected" ? plural(parentIds.length, "chosen parent")
        : audience === "students_all" ? (className ? `Students in ${className}` : "All students")
          : audience === "students_selected" ? plural(studentIds.length, "chosen student")
            : audience === "everyone" ? "All parents and students"
              : `${plural(parentIds.length, "parent")} + ${plural(studentIds.length, "student")}`;
  const len = fullText.length;
  const canSend = smsReady && !!message.trim() && !!preview && preview.reachable > 0 && !(choosing && chosenCount === 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || !preview) return;
    const ok = await toast.confirm(`Send this SMS to ${preview.reachable.toLocaleString()} ${preview.reachable === 1 ? "person" : "people"}?`, {
      description: `${audienceLabel}${withStudents ? (deliverTo === "parent" ? ", sent to their parents' phones" : ", sent to the students' own phones") : ""}.`,
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
        ...audiencePayload(),
        title: title.trim() || undefined,
        message: message.trim(),
        // only sent when ticked, so unticking for one campaign doesn't erase the saved default
        ...(sig ? { signature: sig } : {}),
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
      subtitle="Send an announcement to parents or students. Personal fields like {{name}} are filled in for each person."
      steps={[
        { id: "audience", label: "Audience", done: !choosing || chosenCount > 0 },
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
          <span>SMSs are paused or not set up, so campaigns can't be sent. Turn SMS on in Settings first. You can still write and preview the message.</span>
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
            { value: "everyone", label: "Everyone", sub: "All parents and all students", tile: "ALL" },
            { value: "mixed_selected", label: "Choose parents & students", sub: "Pick from both lists", tile: "P+S" },
          ]}
          selected={[audience]}
          onToggle={(v) => setAudience(v as Audience)}
        />
        {withStudents && (
          <div className="field">
            <FieldLabel hint={audience === "everyone" || mixed ? "Applies to the students in this audience" : undefined}>Send student messages to</FieldLabel>
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
            {mixed && (
              <div className="cp-tabs" role="tablist" aria-label="List">
                {(["parents", "students"] as Kind[]).map((k) => {
                  const n = k === "parents" ? parentIds.length : studentIds.length;
                  return (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setSearch(""); }}>
                      {k === "parents" ? "Parents" : "Students"}
                      {n > 0 && <span className="cp-tab-count">{n}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="cp-picker-head">
              <div className="input-icon" style={{ flex: 1 }}>
                <input className="input" placeholder={forStudents ? "Search name, admission no. or phone" : "Search name or phone"} value={search} onChange={(e) => setSearch(e.target.value)} />
                <Search />
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked((m) => { const n = new Map(m); people.filter(reachableShown).forEach((p) => n.set(keyOf(p), { ...p, kind: p.kind ?? listKind })); return n; })} disabled={!people.length}>
                Select shown
              </button>
              {chosenCount > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Map())}>Clear ({chosenCount})</button>}
            </div>
            <ul className="cp-list" aria-label="People" aria-busy={loadingPeople}>
              {!loadingPeople && people.length === 0 && <li className="cp-empty">No one matches.</li>}
              {people.map((p) => {
                const on = picked.has(keyOf(p));
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
          <FieldLabel htmlFor="cp-msg" required hint={`${len} chars · ${parts(fullText || " ")} SMS (${isUnicode(fullText) ? "Unicode" : "GSM-7"})`}>Message</FieldLabel>
          <textarea
            id="cp-msg"
            ref={textRef}
            className="input"
            rows={5}
            maxLength={MAX_LEN}
            placeholder="Hi {{name}}, ..."
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
            <span className={`cp-count${len > 480 ? " warn" : ""}`}>{len}/{MAX_LEN}</span>
          </div>
          <p className="cp-hint">
            Use <code>{"{{name}}"}</code> to personalise with each recipient's name. The buttons above add other fields:{" "}
            <code>{"{{first_name}}"}</code>, <code>{"{{student}}"}</code>, <code>{"{{adm}}"}</code>, <code>{"{{balance}}"}</code>.
          </p>
        </div>
        <div className="field">
          <div className="cp-sig-head">
            <FieldLabel htmlFor="cp-sig" hint="Added to the end of every message">Signature</FieldLabel>
            <Switch id="cp-sig-on" label="Add signature" checked={useSignature} onChange={setUseSignature} />
          </div>
          <input
            id="cp-sig"
            className="input"
            maxLength={80}
            placeholder="From Nancy Kemboi - BetterFork Restaurant Limited."
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            disabled={!useSignature}
          />
          <p className="cp-hint" style={{ marginTop: 6 }}>
            {useSignature
              ? "No need to type it in the message. The one you send with is remembered for next time."
              : "No signature on this campaign."}
          </p>
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
