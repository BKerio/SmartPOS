import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "@/services/toast";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import AppLoader from "@/components/shared/AppLoader";
import logo from "@/assets/LOGO.png";
import { getDashboardPath, useAuth } from "@/context/AuthContext";
import type { AuthUser, UserRole } from "@/services/authStorage";
import LoginScene from "@/pages/auth/LoginScene";

/** Flat cloud built from overlapping circles - colour comes from CSS `fill`. */
function Cloud({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 52" aria-hidden="true">
      <circle cx="32" cy="32" r="18" />
      <circle cx="60" cy="22" r="22" />
      <circle cx="88" cy="32" r="16" />
      <rect x="12" y="32" width="96" height="20" rx="10" />
    </svg>
  );
}

/** Bowl with rising steam - bottom-left corner decoration. */
function Bowl({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 150 110" aria-hidden="true">
      <path d="M40 34 c-8 -10 8 -16 0 -28" className="lp-steam" />
      <path d="M62 34 c-8 -10 8 -16 0 -28" className="lp-steam" />
      <path d="M84 34 c-8 -10 8 -16 0 -28" className="lp-steam" />
      <path d="M6 48 H136 a65 52 0 0 1 -130 0 Z" />
      <rect x="44" y="100" width="54" height="10" rx="3" />
      <rect x="18" y="58" width="22" height="7" rx="3.5" className="lp-cut" />
    </svg>
  );
}

/** Cup and fork - bottom-right corner decoration. */
function CupAndFork({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 140" aria-hidden="true">
      <rect x="22" y="0" width="7" height="58" rx="3.5" />
      <rect x="36" y="0" width="7" height="58" rx="3.5" />
      <rect x="50" y="0" width="7" height="58" rx="3.5" />
      <path d="M18 50 H61 V64 a21 21 0 0 1 -43 0 Z" />
      <rect x="33" y="76" width="13" height="64" rx="6.5" />
      <path d="M86 52 H170 V108 a32 32 0 0 1 -32 32 H118 a32 32 0 0 1 -32 -32 Z" />
      <path d="M170 64 h8 a18 18 0 0 1 0 36 h-8 v-12 h8 a6 6 0 0 0 0 -12 h-8 Z" />
      <rect x="104" y="72" width="48" height="8" rx="4" className="lp-cut" />
    </svg>
  );
}

/** Accepts 07.., 7.., 2547.. and +2547.. phone formats; leaves emails and admission numbers as typed. */
function normalizeIdentifier(raw: string) {
  const rawId = raw.trim();
  const digits = rawId.replace(/\D/g, "");
  if (rawId.includes("@") || digits.length < 9 || digits.length > 15) return rawId;
  if (digits.startsWith("254") && digits.length >= 12) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits.startsWith("0") ? digits : rawId;
}

const toAuthUser = (data: any): AuthUser => ({
  id: data.id || data._id,
  name: data.name,
  role: data.role as UserRole,
  email: data.email,
  regNo: data.regNo,
  walletBalance: data.walletBalance,
});

const Login: React.FC = () => {
  const { status, user, login, refreshSession } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "authenticated" && user) {
      navigate(getDashboardPath(user.role), { replace: true });
    }
  }, [status, user, navigate]);

  if (status === "loading") {
    return <Loader size="sm" title="Loading..." subtitle="Checking your session" className="min-h-screen py-24" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    setLoading(true);
    try {
      const res = await API.post("/auth/login", {
        identifier: normalizeIdentifier(identifier),
        password: password.trim(),
      });
      const data = res.data;

      if (!data?.role || !data?.token) {
        setServerError("Unexpected response from server. Please try again.");
        return;
      }

      const authUser = toAuthUser(data);
      // Set session immediately from login response; don't block on a second round-trip
      login(authUser, data.token);
      void refreshSession();
      toast.success(`Welcome, ${data.name || "user"}!`);
      navigate(getDashboardPath(authUser.role));
    } catch (error: any) {
      setServerError(error.response?.data?.message || "Invalid phone/email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-page">
      <div className="lp-wrap">
        <div className="lp-card fade-up">
          {/* Illustration panel */}
          <section className="lp-hero">
            <Cloud className="lp-cloud lp-cloud-1" />
            <Cloud className="lp-cloud lp-cloud-2" />
            <Cloud className="lp-cloud lp-cloud-3" />
            <div className="lp-brand">
              <h2 className="lp-brand-name">Better Forks<br />SmartPOS</h2>
              <p>Cashless school meals: wallets, M-Pesa top-ups and the kitchen, in one place.</p>
            </div>
            <LoginScene />
          </section>

          {/* Sign-in panel */}
          <section className="lp-panel">
            <div className="lp-form-wrap">
              <img src={logo} alt="Better Forks Restaurant Limited" draggable={false} className="lp-logo" />
              <h1 className="lp-title">Welcome</h1>
              <p className="lp-sub">Sign in with your email, phone or admission number</p>

              {serverError && (
                <div className="alert-error" role="alert" style={{ marginBottom: 18 }}>
                  <AlertCircle size={16} />
                  <span>{serverError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="col" style={{ gap: 18 }}>
                <fieldset className={`lp-field${serverError ? " has-error" : ""}`}>
                  <legend><label htmlFor="login-identifier">Email, phone or admission no.</label></legend>
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    placeholder="e.g. 0712 345 678"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </fieldset>

                <fieldset className={`lp-field${serverError ? " has-error" : ""}`}>
                  <legend><label htmlFor="login-password">Password</label></legend>
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="lp-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </fieldset>

                <p className="lp-hint">
                  Parents: your password is your phone number ·{" "}
                  <Link to="/forgot-password" className="lp-link">Forgot password?</Link>
                </p>

                <button className="lp-submit" disabled={loading} type="submit">
                  {loading ? <><AppLoader size={16} color="#fff" /> Signing in…</> : "Login"}
                </button>
              </form>

              <p className="lp-foot">
                <ShieldCheck size={14} aria-hidden="true" />
                © {new Date().getFullYear()} SmartPOS · Feeding Minds, Nourishing Futures
              </p>
            </div>

            <Bowl className="lp-deco lp-deco-left" />
            <CupAndFork className="lp-deco lp-deco-right" />
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
