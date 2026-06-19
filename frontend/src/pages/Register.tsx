import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  User,
  Phone,
  Building2,
  ChevronDown,
  ArrowRight,
  Home,
  CheckCircle2,
  Briefcase,
  Shield,
  Store,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import Swal from "sweetalert2";
import API from "@/services/api";

type RoleValue = "tenant" | "alumni" | "owner" | "hostel" | "manager" | "provider" | "merchant";

interface RoleOption {
  value: RoleValue | "";
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const roleOptions: RoleOption[] = [
  {
    value: "tenant",
    label: "Non-Student Tenant",
    description: "Book short or long-term housing",
    icon: <Home className="w-5 h-5" />,
    color: "orange",
  },
  {
    value: "alumni",
    label: "Alumni User",
    description: "Access temporary housing and community services",
    icon: <User className="w-5 h-5" />,
    color: "purple",
  },
  {
    value: "owner",
    label: "Property Owner / Landlord",
    description: "List and manage rental properties",
    icon: <Building2 className="w-5 h-5" />,
    color: "blue",
  },
  {
    value: "hostel",
    label: "Hostel / Housing Provider",
    description: "Offer structured student accommodations",
    icon: <Home className="w-5 h-5" />,
    color: "indigo",
  },
  {
    value: "manager",
    label: "Property Manager",
    description: "Manage multiple units and tenants",
    icon: <Briefcase className="w-5 h-5" />,
    color: "cyan",
  },
  {
    value: "provider",
    label: "Service Provider",
    description: "Cleaning, transport, security, health",
    icon: <Shield className="w-5 h-5" />,
    color: "teal",
  },
  {
    value: "merchant",
    label: "Marketplace Merchant",
    description: "Sell furniture and student essentials",
    icon: <Store className="w-5 h-5" />,
    color: "pink",
  },
];

const BUSINESS_ROLES = ["owner", "hostel", "manager", "provider", "merchant"];

const ROLE_COLOR_MAP: Record<string, { lightBg: string; border: string; text: string }> = {
  orange: { lightBg: "bg-orange-50", border: "border-orange-500/20", text: "text-orange-600" },
  purple: { lightBg: "bg-purple-50", border: "border-purple-500/20", text: "text-purple-600" },
  blue: { lightBg: "bg-blue-50", border: "border-blue-500/20", text: "text-blue-600" },
  indigo: { lightBg: "bg-indigo-50", border: "border-indigo-500/20", text: "text-indigo-600" },
  cyan: { lightBg: "bg-cyan-50", border: "border-cyan-500/20", text: "text-cyan-600" },
  teal: { lightBg: "bg-teal-50", border: "border-teal-500/20", text: "text-teal-600" },
  pink: { lightBg: "bg-pink-50", border: "border-pink-500/20", text: "text-pink-600" },
};

const ICON_COLOR_MAP: Record<string, string> = {
  orange: "text-orange-600",
  purple: "text-purple-600",
  blue: "text-blue-600",
  indigo: "text-indigo-600",
  cyan: "text-cyan-600",
  teal: "text-teal-600",
  pink: "text-pink-600",
};

const getRoleColorClasses = (color: string, isSelected: boolean = false) => {
  const c = ROLE_COLOR_MAP[color] || ROLE_COLOR_MAP.indigo;
  return isSelected ? `${c.lightBg} ${c.border} ${c.text}` : `bg-gray-50 border-gray-100 text-gray-600`;
};

const getIconColorClass = (color: string) => {
  return ICON_COLOR_MAP[color] || "text-indigo-600";
};

const DecorativeBackground = React.memo(() => (
  <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
    <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px] will-change-transform transform-gpu dark:bg-indigo-600/5" />
    <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] will-change-transform transform-gpu dark:bg-blue-600/5" />
  </div>
));

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    role: "" as RoleValue | "",
    businessName: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const selectedRole = roleOptions.find((r) => r.value === form.role);
  const needsBusiness = BUSINESS_ROLES.includes(form.role);

  const goNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role) {
      return Swal.fire({
        icon: "warning",
        title: "Select a role",
        text: "Please choose your account type to continue.",
        confirmButtonColor: "#0A1F44"
      });
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return Swal.fire({
        icon: "error",
        title: "Passwords don't match",
        text: "Please re-enter matching passwords.",
        confirmButtonColor: "#0A1F44"
      });
    }
    setLoading(true);
    try {
      await API.post("/users/register", form);
      await Swal.fire({
        icon: "success",
        title: "Registration Submitted!",
        html: `<p class='text-gray-600'>Your account is <strong>pending admin approval</strong>.<br/>You'll receive access once reviewed.</p>`,
        confirmButtonColor: "#0A1F44",
        confirmButtonText: "Back to Login",
      });
      navigate("/login");
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Registration Failed",
        text: err.response?.data?.message || "Please try again.",
        confirmButtonColor: "#0A1F44"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E8F4FD] dark:bg-slate-950 p-4 font-sans relative overflow-y-auto">
      <DecorativeBackground />

      <div className="min-h-screen flex items-center justify-center py-8">
        <div className="w-full max-w-[380px] relative my-auto">
          {/* Main Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 md:p-8 border border-white/20 dark:border-slate-800">
            {/* Logo Section */}
            <div className="flex flex-col items-center mb-6">
              <motion.div
                key={form.role || "default"}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`w-16 h-16 rounded-full shadow-inner flex items-center justify-center mb-4 overflow-hidden border-2 transition-colors duration-300 ${selectedRole ? getRoleColorClasses(selectedRole.color, true) : "bg-indigo-50 border-indigo-500/20 text-indigo-600"
                  }`}
              >
                <div className={`transition-colors duration-300 ${selectedRole ? getIconColorClass(selectedRole.color) : "text-indigo-600"
                  }`}>
                  {selectedRole ? selectedRole.icon : <Home className="w-6 h-6" />}
                </div>
              </motion.div>
              <h2 className="text-xl font-bold text-[#2E3A59] dark:text-white text-center tracking-tight">
                Create Account
              </h2>
              <p className="text-slate-400 font-medium text-xs mt-1 text-center">
                Join our housing & marketplace platform
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {["Choose Role", "Your Details"].map((label, i) => (
                <React.Fragment key={label}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step > i + 1
                        ? "bg-green-500 text-white"
                        : step === i + 1
                          ? "bg-[#0A1F44] text-white"
                          : "bg-gray-200 text-gray-400 dark:bg-slate-700 dark:text-slate-500"
                      }`}>
                      {step > i + 1 ? "✓" : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${step === i + 1 ? "text-[#2E3A59] dark:text-white" : "text-gray-400 dark:text-slate-500"
                      }`}>{label}</span>
                  </div>
                  {i === 0 && (
                    <div className={`flex-1 h-0.5 rounded transition-all ${step > 1 ? "bg-[#0A1F44]" : "bg-gray-200 dark:bg-slate-700"
                      }`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* ── Step 1: Role Selection ── */}
            {step === 1 && (
              <form onSubmit={goNext} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-slate-400 ml-1">Account Type</label>
                  <button
                    type="button"
                    onClick={() => setShowRoleSelector(true)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      {selectedRole ? (
                        <div className={`p-1.5 rounded-lg transition-colors ${getRoleColorClasses(selectedRole.color, true).split(" ")[0]}`}>
                          {React.cloneElement(selectedRole.icon as React.ReactElement, {
                            className: `w-4 h-4 ${getIconColorClass(selectedRole.color)}`
                          })}
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-lg bg-gray-200 dark:bg-slate-700">
                          <User className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <div className="text-left">
                        <span className={`block text-sm font-semibold ${selectedRole ? "text-gray-900 dark:text-slate-200" : "text-gray-500 dark:text-slate-400"
                          }`}>
                          {selectedRole ? selectedRole.label : "Select your role…"}
                        </span>
                        {selectedRole && (
                          <span className="block text-[10px] text-gray-500 dark:text-slate-400">
                            {selectedRole.description}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </button>
                </div>

                {/* Approval notice */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex gap-2">
                  <span className="text-amber-600 dark:text-amber-400 text-lg shrink-0">⏳</span>
                  <p className="text-amber-700 dark:text-amber-300 text-xs leading-relaxed">
                    After registering, an admin will review your account before you can log in. This usually takes less than 24 hours.
                  </p>
                </div>

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 text-sm font-bold rounded-xl shadow-lg transition-all text-white bg-[#0A1F44] hover:bg-[#0A1F44]/90 shadow-[#0A1F44]/10 flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight size={16} />
                </motion.button>
              </form>
            )}

            {/* ── Step 2: Personal Details ── */}
            {step === 2 && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium flex items-center gap-1 w-fit transition mb-1"
                >
                  ← Back to role selection
                </button>

                {/* Selected role badge */}
                {selectedRole && (
                  <div className={`rounded-xl px-3 py-2 text-xs font-medium border ${getRoleColorClasses(selectedRole.color, true)
                    }`}>
                    Role: <span className="font-bold">{selectedRole.label}</span>
                  </div>
                )}

                {/* Full Name */}
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Full Name"
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                  />
                </div>

                {/* Email */}
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    placeholder="Email Address"
                    required
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                  />
                </div>

                {/* Phone */}
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    placeholder="Phone Number (optional)"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                  />
                </div>

                {/* Business Name – conditional */}
                <AnimatePresence>
                  {needsBusiness && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="relative group"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Business / Organisation Name"
                        value={form.businessName}
                        onChange={(e) => set("businessName", e.target.value)}
                        className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Password */}
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    placeholder="Create Password"
                    required
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                  />
                </div>

                {/* Confirm Password */}
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    required
                    value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                    className={`w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white ${form.confirmPassword && form.password !== form.confirmPassword
                        ? "border-red-400 focus:border-red-400"
                        : "border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800"
                      }`}
                  />
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p className="text-red-500 text-xs mt-1 ml-1">Passwords do not match</p>
                  )}
                </div>

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={!loading ? { scale: 1.01 } : {}}
                  whileTap={!loading ? { scale: 0.98 } : {}}
                  className={`w-full py-3 text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${loading
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-[#0A1F44] hover:bg-[#0A1F44]/90 text-white shadow-[#0A1F44]/10"
                    }`}
                >
                  {loading ? "Submitting…" : (<>Submit Registration <ArrowRight size={16} /></>)}
                </motion.button>
              </form>
            )}
          </div>

          {/* Footer link */}
          <p className="text-center text-xs text-gray-500 dark:text-slate-400 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition">
              Sign in here
            </Link>
          </p>

          {/* Bottom Sheet Role Selector */}
          <AnimatePresence>
            {showRoleSelector && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowRoleSelector(false)}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20"
                />
                <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="bg-white dark:bg-slate-900 rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.1)] border-t border-slate-100 dark:border-slate-800 max-h-[70vh] overflow-y-auto pointer-events-auto"
                  >
                    <div className="p-6">
                      <div className="w-10 h-1 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                      <h3 className="text-base font-bold text-center mb-1 dark:text-white">Select Account Type</h3>
                      <p className="text-center text-xs text-gray-500 dark:text-slate-400 mb-6">
                        Choose the role that best describes you
                      </p>

                      <div className="space-y-2">
                        {roleOptions.map((option) => {
                          const isSelected = form.role === option.value;
                          const selectedClasses = getRoleColorClasses(option.color, true);
                          const unselectedClasses = "bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700";

                          return (
                            <button
                              key={option.value}
                              onClick={() => {
                                set("role", option.value);
                                setShowRoleSelector(false);
                              }}
                              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${isSelected ? `${selectedClasses} shadow-sm` : unselectedClasses
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isSelected ? "bg-white/50" : "bg-white dark:bg-slate-700"}`}>
                                  {React.cloneElement(option.icon as React.ReactElement, {
                                    className: `w-4 h-4 ${isSelected ? getIconColorClass(option.color) : "text-gray-400"}`
                                  })}
                                </div>
                                <div className="text-left">
                                  <span className={`block text-sm font-bold ${isSelected ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-slate-300"}`}>
                                    {option.label}
                                  </span>
                                  <span className="block text-[10px] text-gray-500 dark:text-slate-400">
                                    {option.description}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className={`w-5 h-5 ${getIconColorClass(option.color)}`} />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setShowRoleSelector(false)}
                        className="w-full mt-4 py-2.5 text-sm text-gray-500 font-medium hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Register;