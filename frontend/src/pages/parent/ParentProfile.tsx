import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CalendarDays, ChevronRight, Contact, GraduationCap, Mail, Phone, Wallet } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/page/DataTable";
import PageLoader from "@/components/shared/PageLoader";
import { displayName, kes } from "@/lib/text";
import { AccountLayout, AcCard, CardActions, PasswordCard, ProfileHero, ReadOnlyField, SettingRow, Switch, fmtDay, fmtPhone, errorText } from "@/components/account/Account";

type LinkedStudent = { id: string; name: string; regNo: string; course?: string | null; walletBalance: number };
type Profile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  receiveSms: boolean;
  receiveEmail: boolean;
  createdAt?: string;
  students: LinkedStudent[];
};

const ParentProfile = () => {
  const { refreshSession } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [savingPref, setSavingPref] = useState<null | "sms" | "email">(null);

  const take = (data: Profile) => {
    setP(data);
    setForm({ name: data.name || "", phone: data.phone || "" });
  };

  useEffect(() => {
    API.get<Profile>("/parents/profile")
      .then(({ data }) => take(data))
      .catch((e) => toast.error("Could not load your profile", errorText(e)));
  }, []);

  if (!p) return <PageLoader height={420} />;

  const dirty = form.name.trim() !== p.name || form.phone.trim() !== (p.phone || "");
  const phoneOk = !form.phone.trim() || /^(?:\+?254|0)?[17]\d{8}$/.test(form.phone.replace(/[\s-]/g, ""));
  const totalWallet = p.students.reduce((s, x) => s + Number(x.walletBalance || 0), 0);

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !phoneOk) return;
    setSaving(true);
    try {
      const { data } = await API.put<Profile>("/parents/profile", { name: form.name.trim(), phone: form.phone.trim() || null });
      take({ ...p, ...data });
      await refreshSession();
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error("Could not save", errorText(err));
    } finally {
      setSaving(false);
    }
  };

  // Notification switches save straight away, and roll back if the server refuses.
  const setPref = async (key: "receiveSms" | "receiveEmail", value: boolean) => {
    const before = p;
    setP({ ...p, [key]: value });
    setSavingPref(key === "receiveSms" ? "sms" : "email");
    try {
      const { data } = await API.put<Profile>("/parents/profile", { [key]: value });
      setP((cur) => ({ ...cur!, ...data, students: data.students ?? cur!.students }));
      toast.success(value ? "Notifications on" : "Notifications off", key === "receiveSms" ? "Text messages" : "Emails");
    } catch (err: any) {
      setP(before);
      toast.error("Could not change notifications", errorText(err));
    } finally {
      setSavingPref(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await API.put("/parents/profile", { currentPassword, newPassword });
      toast.success("Password updated", "Use the new password next time you sign in");
    } catch (e: any) {
      throw new Error(errorText(e, "Could not change your password"));
    }
  };

  return (
    <div className="ac-page">
      <ProfileHero
        name={p.name}
        role="Parent"
        meta={[
          ...(p.phone ? [{ icon: Phone, label: fmtPhone(p.phone) }] : []),
          ...(p.email ? [{ icon: Mail, label: p.email }] : []),
          ...(p.createdAt ? [{ icon: CalendarDays, label: `Joined ${fmtDay(p.createdAt)}` }] : []),
        ]}
        side={
          <>
            <div className="ac-stat"><span>Children</span><b>{p.students.length}</b></div>
            <div className="ac-stat"><span>Total in wallets</span><b>{kes(totalWallet)}</b></div>
          </>
        }
      />

      <AccountLayout
        main={
          <>
            <AcCard
              icon={Contact}
              title="Your details"
              description="The school uses these to send receipts and reach you about your children."
              onSubmit={saveDetails}
              footer={<CardActions dirty={dirty} saving={saving} disabled={!form.name.trim() || !phoneOk} onDiscard={() => setForm({ name: p.name, phone: p.phone || "" })} />}
            >
              <div className="fm-grid-2">
                <div className="field">
                  <label htmlFor="pp-name" className="ac-ro-label">Full name</label>
                  <input id="pp-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
                  {!form.name.trim() && <span className="field-error">Name is required</span>}
                </div>
                <div className="field">
                  <label htmlFor="pp-phone" className="ac-ro-label">Phone number</label>
                  <div className="input-icon">
                    <input id="pp-phone" className="input" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
                    <Phone />
                  </div>
                  {!phoneOk && <span className="field-error">Enter a valid Kenyan number, e.g. 0712 345 678</span>}
                </div>
              </div>
              <ReadOnlyField label="Email" value={p.email} hint="Ask the school to change it" icon={Mail} />
            </AcCard>

            <AcCard icon={Bell} title="Notifications" description="Choose how you hear about top-ups, purchases and statements." flush>
              <SettingRow
                htmlFor="pp-sms"
                title="Text messages (SMS)"
                description={p.phone ? `Sent to ${fmtPhone(p.phone)}` : "Add a phone number above to receive texts"}
                control={<Switch id="pp-sms" label="Text messages" checked={p.receiveSms} busy={savingPref === "sms"} disabled={!!savingPref} onChange={(v) => setPref("receiveSms", v)} />}
              />
              <SettingRow
                htmlFor="pp-email"
                title="Email"
                description={p.email ? `Receipts and statements to ${p.email}` : "No email on file. Ask the school to add one"}
                control={<Switch id="pp-email" label="Email" checked={p.receiveEmail && !!p.email} busy={savingPref === "email"} disabled={!!savingPref || !p.email} onChange={(v) => setPref("receiveEmail", v)} />}
              />
            </AcCard>

            <PasswordCard onSave={changePassword} />
          </>
        }
        aside={
          <AcCard icon={GraduationCap} title="Your children" description={p.students.length ? "Linked to your account by the school." : undefined} flush>
            {p.students.length === 0 ? (
              <p className="ac-empty">No children linked yet. Ask the school office to link them to your account.</p>
            ) : (
              <>
                <ul className="ac-people">
                  {p.students.map((s) => (
                    <li key={s.id}>
                      <Avatar name={s.name} size="lg" />
                      <div>
                        <b title={s.name}>{displayName(s.name)}</b>
                        <small>{s.regNo}{s.course ? ` · ${s.course}` : ""}</small>
                      </div>
                      <strong>{kes(s.walletBalance)}</strong>
                    </li>
                  ))}
                </ul>
                <ul className="ac-links" style={{ borderTop: "1px solid var(--border)" }}>
                  <li>
                    <Link to="/parent/topup">
                      <span className="ico"><Wallet size={16} /></span>
                      <span className="min-w-0"><b>Top up a wallet</b><small>Pay with M-Pesa</small></span>
                      <ChevronRight size={16} className="chev" />
                    </Link>
                  </li>
                </ul>
              </>
            )}
          </AcCard>
        }
      />
    </div>
  );
};

export default ParentProfile;
