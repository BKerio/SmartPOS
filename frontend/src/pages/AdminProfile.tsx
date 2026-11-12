import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, ChevronRight, Contact, DatabaseBackup, Mail, ShieldCheck, Sliders, Users } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { useAuth } from "@/context/AuthContext";
import PageLoader from "@/components/shared/PageLoader";
import { AccountLayout, AcCard, CardActions, InfoList, PasswordCard, ProfileHero, ReadOnlyField, fmtDay, errorText } from "@/components/account/Account";

type Profile = { id: string; name: string; email: string; createdAt?: string };

const SHORTCUTS = [
  { to: "/settings", icon: Sliders, title: "System settings", sub: "SMS and payment status" },
  { to: "/staffs", icon: Users, title: "Staff accounts", sub: "Add, approve and edit staff" },
  { to: "/data-management", icon: DatabaseBackup, title: "Backup & restore", sub: "Download a copy of all data" },
  { to: "/audit-logs", icon: Activity, title: "Audit logs", sub: "Who changed what, and when" },
];

const AdminProfile = () => {
  const { refreshSession } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    API.get<Profile>("/admin/profile")
      .then(({ data }) => {
        setProfile(data);
        setName(data.name || "");
      })
      .catch((e) => toast.error("Could not load your profile", errorText(e)));
  }, []);

  if (!profile) return <PageLoader height={420} />;

  const dirty = name.trim() !== profile.name;
  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.warning("Name is required");
    setSaving(true);
    try {
      const { data } = await API.put<Profile>("/admin/profile", { name: name.trim() });
      setProfile((p) => ({ ...p!, ...data }));
      setName(data.name);
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
      await API.put("/admin/profile", { currentPassword, newPassword });
      toast.success("Password updated", "Use the new password next time you sign in");
    } catch (e) {
      throw new Error(errorText(e, "Could not change your password"));
    }
  };

  return (
    <div className="ac-page">
      <ProfileHero
        name={profile.name}
        role="Administrator"
        badges={<span className="ac-chip ok"><ShieldCheck size={13} /> Full access</span>}
        meta={[
          { icon: Mail, label: profile.email },
          { icon: CalendarDays, label: `Admin since ${fmtDay(profile.createdAt)}` },
        ]}
      />

      <AccountLayout
        main={
          <>
            <AcCard
              icon={Contact}
              title="Personal details"
              description="Your name appears on receipts, audit logs and approvals."
              onSubmit={saveDetails}
              footer={<CardActions dirty={dirty} saving={saving} disabled={!name.trim()} onDiscard={() => setName(profile.name)} />}
            >
              <div className="fm-grid-2">
                <div className="field">
                  <label htmlFor="ap-name" className="ac-ro-label">Full name</label>
                  <input id="ap-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                  {!name.trim() && <span className="field-error">Name is required</span>}
                </div>
                <ReadOnlyField label="Email" value={profile.email} hint="Sign-in ID, can't be changed" icon={Mail} />
              </div>
            </AcCard>
            <PasswordCard onSave={changePassword} />
          </>
        }
        aside={
          <>
            <AcCard icon={ShieldCheck} title="Account" flush>
              <InfoList
                items={[
                  { label: "Role", value: "Administrator" },
                  { label: "Sign-in", value: profile.email },
                  { label: "Created", value: fmtDay(profile.createdAt) },
                ]}
              />
            </AcCard>
            <AcCard title="Admin shortcuts" flush>
              <ul className="ac-links">
                {SHORTCUTS.map(({ to, icon: Icon, title, sub }) => (
                  <li key={to}>
                    <Link to={to}>
                      <span className="ico"><Icon size={16} /></span>
                      <span className="min-w-0"><b>{title}</b><small>{sub}</small></span>
                      <ChevronRight size={16} className="chev" />
                    </Link>
                  </li>
                ))}
              </ul>
            </AcCard>
          </>
        }
      />
    </div>
  );
};

export default AdminProfile;
