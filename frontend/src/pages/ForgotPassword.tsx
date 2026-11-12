import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import FormModal, { ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";

type ResetRole = "student" | "parent";
type Step = "email" | "code" | "password" | "done";


function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!local || !domain) return email;
  if (local.length <= 4) {
    const stars = "*".repeat(Math.max(local.length - 1, 1));
    return `${local[0] ?? ""}${stars}@${domain}`;
  }
  const hidden = "*".repeat(local.length - 4);
  return `${local.slice(0, 2)}${hidden}${local.slice(-2)}@${domain}`;
}

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRole = (searchParams.get("role") as ResetRole) || "parent";

  const [step, setStep] = useState<Step>("email");
  const [role, setRole] = useState<ResetRole>(initialRole === "student" ? "student" : "parent");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      await API.post("/auth/forgot-password/request", { email: email.trim(), role });
      toast.success("Check your email", "We sent a 6-digit code if an account exists");
      setStep("code");
    } catch (err: any) {
      toast.error("Could not send code", err.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (digits: string) => {
    if (verifyingRef.current || digits.length !== 6) return;

    verifyingRef.current = true;
    setVerifying(true);
    try {
      await API.post("/auth/forgot-password/verify", {
        email: email.trim(),
        role,
        code: digits,
      });
      toast.success("Code verified", "Choose your new password");
      setStep("password");
    } catch (err: any) {
      toast.error("Invalid code", err.response?.data?.message);
      setCode("");
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  const handleCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      void verifyCode(digits);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 7) {
      return toast.error("Validation", "Password must be at least 7 characters");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("Validation", "Passwords do not match");
    }

    setLoading(true);
    try {
      await API.post("/auth/forgot-password/reset", {
        email: email.trim(),
        role,
        code: code.trim(),
        newPassword,
        confirmPassword,
      });
      setStep("done");
      toast.success("Password updated", "You can log in with your new password");
    } catch (err: any) {
      toast.error("Reset failed", err.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  const order: Step[] = ["email", "code", "password", "done"];
  const reached = (s: Step) => order.indexOf(step) > order.indexOf(s);

  const submitStep = (e: React.FormEvent<HTMLFormElement>) => {
    if (step === "email") return void requestCode(e);
    if (step === "password") return void resetPassword(e);
    e.preventDefault();
    if (step === "code") return void verifyCode(code);
    navigate(`/login?role=${role}`);
  };

  return (
    <div className="min-h-screen bg-page p-4 font-sans flex items-center justify-center">
      <div className="w-full" style={{ maxWidth: 640 }}>
        <FormModal
          variant="page"
          icon={KeyRound}
          title="Reset your password"
          subtitle="We'll email you a 6-digit code that expires in 5 minutes."
          steps={[
            { id: "email", label: "Email", done: reached("email") },
            { id: "code", label: "Code", done: reached("code") },
            { id: "password", label: "New password", done: reached("password") },
          ]}
          statusLabel={role === "parent" ? "Parent account" : "Student account"}
          statusDetail={email ? maskEmail(email) : ""}
          submitLabel={
            step === "email" ? "Send reset code" : step === "code" ? "Verify code" : step === "password" ? "Reset password" : "Go to login"
          }
          submittingLabel={step === "email" ? "Sending…" : step === "code" ? "Verifying…" : "Saving…"}
          submitIcon={step === "done" ? ArrowRight : step === "password" ? ShieldCheck : Check}
          submitting={loading || verifying}
          submitDisabled={step === "code" && code.length !== 6}
          cancelLabel="Back to login"
          onClose={() => navigate("/login")}
          onSubmit={submitStep}
        >
          {step === "email" && (
            <FormSection id="email" icon={Mail} title="Your account">
              <div className="field">
                <FieldLabel required>Account type</FieldLabel>
                <ChoicePills
                  label="Account type"
                  value={role}
                  options={[{ value: "parent" as ResetRole, label: "Parent" }, { value: "student" as ResetRole, label: "Student" }]}
                  onChange={setRole}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="fp-email" required>Email address</FieldLabel>
                <div className="input-icon">
                  <input id="fp-email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                  <Mail />
                </div>
                {role === "student" && <p className="fm-note">Use the email address saved on your student record.</p>}
              </div>
            </FormSection>
          )}

          {step === "code" && (
            <FormSection id="code" icon={ShieldCheck} title="Verification code">
              <div className="field">
                <FieldLabel htmlFor="fp-code" required hint={`Sent to ${maskEmail(email)}`}>6-digit code</FieldLabel>
                <input
                  id="fp-code"
                  className="input mono"
                  style={{ textAlign: "center", fontSize: 24, letterSpacing: ".4em", height: 60 }}
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  disabled={verifying}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="••••••"
                />
                <p className="fm-note">
                  Didn't get it?{" "}
                  <button
                    type="button"
                    className="lp-link"
                    style={{ color: "var(--green)", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", fontWeight: 650 }}
                    disabled={loading || verifying}
                    onClick={() => {
                      verifyingRef.current = false;
                      setVerifying(false);
                      setCode("");
                      void requestCode();
                    }}
                  >
                    Send a new code
                  </button>
                </p>
              </div>
            </FormSection>
          )}

          {step === "password" && (
            <FormSection id="password" icon={LockKeyhole} title="New password">
              <div className="fm-grid-2">
                <div className="field">
                  <FieldLabel htmlFor="fp-new" required hint="At least 7 characters">New password</FieldLabel>
                  <input id="fp-new" type="password" className="input" required minLength={7} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" autoFocus />
                </div>
                <div className="field">
                  <FieldLabel htmlFor="fp-confirm" required>Confirm password</FieldLabel>
                  <input id="fp-confirm" type="password" className="input" required minLength={7} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                  {confirmPassword && newPassword !== confirmPassword && <span className="field-error">Passwords don't match</span>}
                </div>
              </div>
            </FormSection>
          )}

          {step === "done" && (
            <FormSection id="password" icon={Check} title="All done">
              <div className="fm-preview">
                <span className="fm-card-tile" style={{ background: "var(--green)", color: "#fff" }} aria-hidden="true"><Check size={16} /></span>
                <div className="col" style={{ gap: 2 }}>
                  <b>Your password has been reset</b>
                  <span>Sign in with your new password.</span>
                </div>
              </div>
            </FormSection>
          )}
        </FormModal>
        <p className="fm-note" style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/login" style={{ color: "var(--green)", fontWeight: 650 }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;