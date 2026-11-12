import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, CalendarDays, ChevronRight, Clock, Contact, Fingerprint, Mail, Phone, ShieldCheck } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/components/layout/navigation";
import PageLoader from "@/components/shared/PageLoader";
import { AccountLayout, AcCard, CardActions, InfoList, PasswordCard, ProfileHero, ReadOnlyField, fmtDay, fmtPhone, errorText } from "@/components/account/Account";

/** Profile for staff accounts (restaurant, finance). Parents get ParentProfile, admins AdminProfile. */
type Me = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "restaurant" | "finance" | "admin";
  status: string;
  hasFingerprint: boolean;
  fingerprintEnrolledAt: string | null;
  createdAt: string;
};

const STATUS: Record<string, { cls: string; label: string }> = {
  approved: { cls: "ok", label: "Approved" },
  pending: { cls: "warn", label: "Awaiting approval" },
  rejected: { cls: "bad", label: "Rejected" },
};

const UserProfile = () => {
  const { user, refreshSession } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    API.get<Me>("/users/me")
      .then(({ data }) => {
        setMe(data);
        setForm({ name: data.name || "", phone: data.phone || "" });
      })
      .catch((e) => {
        setFailed(true);
        toast.error("Could not load your profile", errorText(e));
      });
  }, []);

  if (failed && !me) {
    return (
      <div className="ac-page">
        <div className="ac-card ac-empty">We couldn't load your profile. Check your connection and refresh the page.</div>
      </div>
    );
  }
  if (!me) return <PageLoader height={420} />;

  const roleLabel = ROLE_LABELS[me.role] ?? me.role;
  const status = STATUS[me.status] ?? { cls: "off", label: me.status };
  const dirty = form.name.trim() !== me.name || form.phone.trim() !== (me.phone || "");
  const phoneOk = !form.phone.trim() || /^(?:\+?254|0)?[17]\d{8}$/.test(form.phone.replace(/[\s-]/g, ""));

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !phoneOk) return;
    setSaving(true);
    try {
      const { data } = await API.put<Me>("/users/me", { name: form.name.trim(), phone: form.phone.trim() || null });
      setMe(data);
      setForm({ name: data.name, phone: data.phone || "" });
      await refreshSession();
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error("Could not save", errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await API.put("/users/me", { currentPassword, newPassword });
      toast.success("Password updated", "Use the new password next time you sign in");
    } catch (e: any) {
      throw new Error(errorText(e, "Could not change your password"));
    }
  };

  return (
    <div className="ac-page">
      <ProfileHero
        name={me.name}
        role={roleLabel}
        badges={<span className={`ac-chip ${status.cls}`}><span className="dot" />{status.label}</span>}
        meta={[
          { icon: Mail, label: me.email },
          ...(me.phone ? [{ icon: Phone, label: fmtPhone(me.phone) }] : []),
          { icon: CalendarDays, label: `Joined ${fmtDay(me.createdAt)}` },
        ]}
      />

      <AccountLayout
        main={
          <>
            <AcCard
              icon={Contact}
              title="Personal details"
              description="How you appear on receipts, invoices and attendance."
              onSubmit={saveDetails}
              footer={
                <CardActions
                  dirty={dirty}
                  saving={saving}
                  disabled={!form.name.trim() || !phoneOk}
                  onDiscard={() => setForm({ name: me.name, phone: me.phone || "" })}
                />
              }
            >
              <div className="fm-grid-2">
                <div className="field">
                  <label htmlFor="up-name" className="ac-ro-label">Full name</label>
                  <input id="up-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
                  {!form.name.trim() && <span className="field-error">Name is required</span>}
                </div>
                <div className="field">
                  <label htmlFor="up-phone" className="ac-ro-label">Phone number <span className="fm-hint">Optional</span></label>
                  <div className="input-icon">
                    <input id="up-phone" className="input" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
                    <Phone />
                  </div>
                  {!phoneOk && <span className="field-error">Enter a valid Kenyan number, e.g. 0712 345 678</span>}
                </div>
              </div>
              <ReadOnlyField label="Email" value={me.email} hint="Ask an admin to change it" icon={Mail} />
            </AcCard>
            <PasswordCard onSave={changePassword} />
          </>
        }
        aside={
          <>
            <AcCard icon={ShieldCheck} title="Account" flush>
              <InfoList
                items={[
                  { label: "Role", value: roleLabel },
                  { label: "Status", value: <span className={`ac-chip ${status.cls}`}><span className="dot" />{status.label}</span> },
                  { label: "Member since", value: fmtDay(me.createdAt) },
                ]}
              />
            </AcCard>
            <AcCard icon={Fingerprint} title="Attendance" description="Clock in and out with your fingerprint at the attendance terminal." flush>
              <InfoList
                items={[
                  {
                    label: "Fingerprint",
                    value: me.hasFingerprint ? (
                      <span className="ac-chip ok"><BadgeCheck size={13} /> Enrolled</span>
                    ) : (
                      <span className="ac-chip warn"><span className="dot" />Not enrolled</span>
                    ),
                  },
                  ...(me.fingerprintEnrolledAt ? [{ label: "Enrolled on", value: fmtDay(me.fingerprintEnrolledAt) }] : []),
                ]}
              />
              {!me.hasFingerprint && <p className="ac-empty" style={{ paddingTop: 4 }}>Ask an admin to enrol your fingerprint so you can clock in.</p>}
              {user && (
                <ul className="ac-links" style={{ borderTop: "1px solid var(--border)" }}>
                  <li>
                    <Link to="/my-attendance">
                      <span className="ico"><Clock size={16} /></span>
                      <span className="min-w-0"><b>My attendance</b><small>Your clock-in history</small></span>
                      <ChevronRight size={16} className="chev" />
                    </Link>
                  </li>
                </ul>
              )}
            </AcCard>
          </>
        }
      />
    </div>
  );
};

export default UserProfile;
