import React, { useState } from "react";
import { Mail, Lock, User, Phone, ArrowRight, Users, UserPlus } from "lucide-react";
import FormModal, { ChoiceCards, FieldLabel, FormSection } from "@/components/shared/FormModal";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "@/services/toast";
import API from "@/services/api";

type RoleValue = "parent" | "finance" | "restaurant";

const roleOptions = [
  { value: "parent" as RoleValue, label: "Parent", description: "Monitor your child's meal wallet" },
  { value: "finance" as RoleValue, label: "Finance officer", description: "Manage school finances" },
  { value: "restaurant" as RoleValue, label: "Restaurant staff", description: "Cafeteria and POS" },
];

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", phone: "", role: "" as RoleValue | "" });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedRole = roleOptions.find((r) => r.value === form.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role) return toast.warning("Select a role", "Choose your account type.");
    if (form.password !== form.confirmPassword) return toast.error("Passwords don't match");
    if (form.role === "parent" && !form.phone.trim()) return toast.error("Validation", "Phone number is required for parent accounts");

    setLoading(true);
    try {
      if (form.role === "parent") {
        await API.post("/parents/register", { name: form.name, phone: form.phone, password: form.password, email: form.email || undefined });
        toast.success("Account created!", "You can now log in as a parent.");
      } else {
        await API.post("/users/register", { name: form.name, email: form.email, password: form.password, phone: form.phone, role: form.role });
        toast.info("Registration submitted", "Your account is pending admin approval.");
      }
      navigate("/login");
    } catch (err: any) {
      toast.error("Registration failed", err.response?.data?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-page p-4 font-sans flex items-center justify-center">
      <div className="w-full" style={{ maxWidth: 760 }}>
        <FormModal
          variant="page"
          icon={UserPlus}
          title="Create an account"
          subtitle="Join the SmartPOS school feeding platform."
          steps={[
            { id: "type", label: "Account type", done: !!form.role },
            { id: "details", label: "Details", done: !!form.name.trim() && (form.role === "parent" ? !!form.phone.trim() : !!form.email.trim()) },
            { id: "password", label: "Password", done: !!form.password && form.password === form.confirmPassword },
          ]}
          statusLabel={selectedRole ? selectedRole.label : "New account"}
          statusDetail={form.name}
          submitLabel={form.role === "parent" ? "Create account" : "Submit for approval"}
          submittingLabel="Submitting…"
          submitIcon={ArrowRight}
          submitting={loading}
          cancelLabel="Back to login"
          onClose={() => navigate("/login")}
          onSubmit={handleSubmit}
        >
          <FormSection id="type" icon={Users} title="Account type">
            <ChoiceCards
              label="Account type"
              columns={3}
              options={roleOptions.map((r) => ({ value: r.value, label: r.label, sub: r.description }))}
              selected={form.role ? [form.role] : []}
              onToggle={(v) => set("role", v)}
            />
            {form.role && form.role !== "parent" && (
              <p className="fm-note">Staff accounts need an administrator's approval before you can sign in.</p>
            )}
          </FormSection>

          <FormSection id="details" icon={User} title="Your details">
            <div className="field">
              <FieldLabel htmlFor="rg-name" required>Full name</FieldLabel>
              <input id="rg-name" className="input" placeholder="e.g. Jane Wanjiku" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="rg-phone" required={form.role === "parent"} hint={form.role === "parent" ? "Also your login" : "Optional"}>Phone number</FieldLabel>
                <div className="input-icon">
                  <input id="rg-phone" type="tel" className="input" placeholder="0712 345 678" value={form.phone} onChange={(e) => set("phone", e.target.value)} required={form.role === "parent"} />
                  <Phone />
                </div>
              </div>
              <div className="field">
                <FieldLabel htmlFor="rg-email" required={form.role !== "parent"} hint={form.role === "parent" ? "Optional" : undefined}>Email</FieldLabel>
                <div className="input-icon">
                  <input id="rg-email" type="email" className="input" placeholder="e.g. jane@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} required={form.role !== "parent"} />
                  <Mail />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection id="password" icon={Lock} title="Password">
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="rg-pass" required>Password</FieldLabel>
                <input id="rg-pass" type="password" className="input" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="rg-confirm" required>Confirm password</FieldLabel>
                <input id="rg-confirm" type="password" className="input" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} autoComplete="new-password" required />
                {form.confirmPassword && form.password !== form.confirmPassword && <span className="field-error">Passwords don't match</span>}
              </div>
            </div>
          </FormSection>
        </FormModal>
        <p className="fm-note" style={{ textAlign: "center", marginTop: 14 }}>
          Already have an account? <Link to="/login" style={{ color: "var(--green)", fontWeight: 650 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;