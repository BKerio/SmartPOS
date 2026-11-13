import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Contact, GraduationCap, Hash, Mail, Phone, Users, Wallet } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { useAuth } from "@/context/AuthContext";
import { ChoicePills } from "@/components/shared/FormModal";
import { Avatar } from "@/components/page/DataTable";
import PageLoader from "@/components/shared/PageLoader";
import { displayName, kes } from "@/lib/text";
import { AccountLayout, AcCard, CardActions, InfoList, PasswordCard, ProfileHero, fmtDay, fmtPhone, errorText } from "@/components/account/Account";

type Gender = "male" | "female" | "other";
type Me = {
  id: string;
  name: string;
  regNo: string;
  phone: string | null;
  gender: Gender | string;
  className: string | null;
  course: string | null;
  category: string | null;
  parentRelationship: string | null;
  walletBalance: number;
  walletFrozen: boolean;
  createdAt: string;
  parent: { id: string; name: string; phone: string | null; email: string | null } | null;
};

const RELATION: Record<string, string> = { father: "Father", mother: "Mother", guardian: "Guardian", sponsor: "Sponsor", other: "Parent / guardian" };
const relationLabel = (r?: string | null) => (r ? RELATION[r.toLowerCase()] ?? r[0].toUpperCase() + r.slice(1) : "Parent / guardian");

const StudentProfile = () => {
  const { refreshSession } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState<{ name: string; phone: string; gender: Gender }>({ name: "", phone: "", gender: "male" });
  const [saving, setSaving] = useState(false);

  const fill = (d: Me) => setForm({ name: d.name || "", phone: d.phone || "", gender: (["male", "female", "other"].includes(d.gender) ? d.gender : "other") as Gender });

  useEffect(() => {
    API.get<Me>("/students/me")
      .then(({ data }) => {
        setMe(data);
        fill(data);
      })
      .catch((e) => toast.error("Could not load your profile", errorText(e)));
  }, []);

  if (!me) return <PageLoader height={420} />;

  const dirty = form.name.trim() !== me.name || form.phone.trim() !== (me.phone || "") || form.gender !== me.gender;
  const phoneOk = !form.phone.trim() || /^(?:\+?254|0)?[17]\d{8}$/.test(form.phone.replace(/[\s-]/g, ""));

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !phoneOk) return;
    setSaving(true);
    try {
      const { data } = await API.put("/students/me", { name: form.name.trim(), phone: form.phone.trim() || null, gender: form.gender });
      const next = { ...me, ...data };
      setMe(next);
      fill(next);
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
      await API.put("/students/me", { currentPassword, newPassword });
      toast.success("Password updated", "Use the new password next time you sign in");
    } catch (e: any) {
      throw new Error(errorText(e, "Could not change your password"));
    }
  };

  const category = me.category ? (me.category === "sponsored" ? "Sponsored" : me.category[0].toUpperCase() + me.category.slice(1)) : "-";

  return (
    <div className="ac-page">
      <ProfileHero
        name={me.name}
        role="Student"
        meta={[
          { icon: Hash, label: me.regNo },
          ...(me.className ? [{ icon: GraduationCap, label: me.className }] : []),
          { icon: CalendarDays, label: `Joined ${fmtDay(me.createdAt)}` },
        ]}
        side={
          <div className="ac-stat">
            <span>Wallet balance</span>
            <b>{kes(me.walletBalance)}</b>
          </div>
        }
        badges={me.walletFrozen ? <span className="ac-chip bad"><span className="dot" />Wallet frozen</span> : undefined}
      />

      <AccountLayout
        main={
          <>
            <AcCard
              icon={Contact}
              title="About you"
              description="Keep your phone number current so the school can reach you."
              onSubmit={saveDetails}
              footer={<CardActions dirty={dirty} saving={saving} disabled={!form.name.trim() || !phoneOk} onDiscard={() => fill(me)} />}
            >
              <div className="fm-grid-2">
                <div className="field">
                  <label htmlFor="sp-name" className="ac-ro-label">Full name</label>
                  <input id="sp-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
                  {!form.name.trim() && <span className="field-error">Name is required</span>}
                </div>
                <div className="field">
                  <label htmlFor="sp-phone" className="ac-ro-label">Phone number <span className="fm-hint">Optional</span></label>
                  <div className="input-icon">
                    <input id="sp-phone" className="input" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
                    <Phone />
                  </div>
                  {!phoneOk && <span className="field-error">Enter a valid Kenyan number, e.g. 0712 345 678</span>}
                </div>
              </div>
              <div className="field">
                <span className="ac-ro-label">Gender</span>
                <ChoicePills<Gender>
                  label="Gender"
                  value={form.gender}
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "other", label: "Other" },
                  ]}
                  onChange={(v) => setForm({ ...form, gender: v })}
                />
              </div>
            </AcCard>
            <PasswordCard onSave={changePassword} />
          </>
        }
        aside={
          <>
            <AcCard icon={GraduationCap} title="School record" description="Set by the school. Ask the office if anything is wrong." flush>
              <InfoList
                items={[
                  { label: "Admission no.", value: me.regNo, icon: Hash, mono: true },
                  { label: "Class", value: me.className || "-", icon: GraduationCap },
                  ...(me.course ? [{ label: "Course", value: me.course, icon: BookOpen }] : []),
                  { label: "Category", value: category, icon: Wallet },
                ]}
              />
            </AcCard>
            <AcCard icon={Users} title="Parent / guardian" flush>
              {me.parent ? (
                <ul className="ac-people">
                  <li>
                    <Avatar name={me.parent.name} size="lg" />
                    <div>
                      <b>{displayName(me.parent.name)}</b>
                      <small>{relationLabel(me.parentRelationship)}</small>
                    </div>
                  </li>
                  {me.parent.phone && (
                    <li><Phone size={16} className="muted" aria-hidden="true" /><div><small>Phone</small><b>{fmtPhone(me.parent.phone)}</b></div></li>
                  )}
                  {me.parent.email && (
                    <li><Mail size={16} className="muted" aria-hidden="true" /><div><small>Email</small><b>{me.parent.email}</b></div></li>
                  )}
                </ul>
              ) : (
                <p className="ac-empty">No parent or guardian linked yet.</p>
              )}
            </AcCard>
          </>
        }
      />
    </div>
  );
};

export default StudentProfile;
