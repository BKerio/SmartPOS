import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  GraduationCap,
  Briefcase,
  Eye,
  EyeOff,
  ChevronDown,
  CheckCircle2,
  Shield,
  Home,
  Store,
  GraduationCap as AlumniIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import API from "@/services/api";

type Role = "admin" | "student" | "tenant" | "alumni" | "owner" | "provider" | "merchant";

interface RoleOption {
  value: Role;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const roleOptions: RoleOption[] = [
  {
    value: "admin",
    label: "Administrator",
    description: "System management & oversight",
    icon: <Shield className="w-5 h-5" />,
    color: "indigo",
  },
  {
    value: "student",
    label: "Student",
    description: "Access your student portal",
    icon: <GraduationCap className="w-5 h-5" />,
    color: "green",
  },
  {
    value: "tenant",
    label: "Non-Student Tenant",
    description: "Rental management & housing",
    icon: <Home className="w-5 h-5" />,
    color: "orange",
  },
  {
    value: "alumni",
    label: "Alumni",
    description: "Stay connected with the community",
    icon: <AlumniIcon className="w-5 h-5" />,
    color: "purple",
  },
  {
    value: "owner",
    label: "Property Owner",
    description: "Manage your properties & listings",
    icon: <Briefcase className="w-5 h-5" />,
    color: "blue",
  },
  {
    value: "provider",
    label: "Service Provider",
    description: "Business dashboard & services",
    icon: <Briefcase className="w-5 h-5" />,
    color: "cyan",
  },
  {
    value: "merchant",
    label: "Marketplace Merchant",
    description: "Sell products & manage orders",
    icon: <Store className="w-5 h-5" />,
    color: "pink",
  },
];

const Login: React.FC = () => {
  const [role, setRole] = useState<Role>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regNo, setRegNo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const navigate = useNavigate();

  const togglePasswordVisibility = () => setShowPassword((prev) => !prev);

  const currentRole = roleOptions.find((r) => r.value === role) || roleOptions[0];

  const getRoleColorClasses = (color: string, isSelected: boolean = false) => {
    const colorMap: Record<string, { bg: string; text: string; border: string; lightBg: string }> = {
      indigo: { bg: "bg-indigo-500", text: "text-indigo-600", border: "border-indigo-500/20", lightBg: "bg-indigo-50" },
      green: { bg: "bg-green-500", text: "text-green-600", border: "border-green-500/20", lightBg: "bg-green-50" },
      orange: { bg: "bg-orange-500", text: "text-orange-600", border: "border-orange-500/20", lightBg: "bg-orange-50" },
      purple: { bg: "bg-purple-500", text: "text-purple-600", border: "border-purple-500/20", lightBg: "bg-purple-50" },
      blue: { bg: "bg-blue-500", text: "text-blue-600", border: "border-blue-500/20", lightBg: "bg-blue-50" },
      cyan: { bg: "bg-cyan-500", text: "text-cyan-600", border: "border-cyan-500/20", lightBg: "bg-cyan-50" },
      pink: { bg: "bg-pink-500", text: "text-pink-600", border: "border-pink-500/20", lightBg: "bg-pink-50" },
    };

    const c = colorMap[color] || colorMap.indigo;
    return isSelected ? `${c.lightBg} ${c.border} ${c.text}` : `bg-gray-50 border-gray-100 text-gray-600`;
  };

  const getIconColorClass = (color: string) => {
    const map: Record<string, string> = {
      indigo: "text-indigo-600",
      green: "text-green-600",
      orange: "text-orange-600",
      purple: "text-purple-600",
      blue: "text-blue-600",
      cyan: "text-cyan-600",
      pink: "text-pink-600",
    };
    return map[color] || "text-indigo-600";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let data;
      if (role === "admin") {
        const res = await API.post("/admin/login", { email, password });
        data = res.data;
        localStorage.setItem("role", "admin");
        localStorage.setItem("token", data.token);
        await Swal.fire({ icon: "success", title: "Welcome Admin", timer: 1200, showConfirmButton: false });
        navigate("/");
      } else if (role === "student") {
        const res = await API.post("/students/login", { regNo, password });
        data = res.data;
        localStorage.setItem("role", "student");
        localStorage.setItem("token", data.token);
        localStorage.setItem("studentName", data.name || "");
        localStorage.setItem("regNo", data.regNo || regNo);
        await Swal.fire({ icon: "success", title: "Welcome Student", timer: 1200, showConfirmButton: false });
        navigate("/student-dashboard");
      } else {
        const res = await API.post("/users/login", { email, password, role });
        data = res.data;
        localStorage.setItem("role", role);
        localStorage.setItem("token", data.token);
        localStorage.setItem("userName", data.name || "");
        const title = role.charAt(0).toUpperCase() + role.slice(1);
        await Swal.fire({ icon: "success", title: `Welcome, ${data.name || title}!`, timer: 1400, showConfirmButton: false });
        navigate(`/${role}-dashboard`);
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "Login failed";
      Swal.fire({ icon: "error", title: "Login Error", text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E8F4FD] dark:bg-slate-950 p-4 font-sans relative overflow-y-auto">
      {/* Decorative Background Elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px] dark:bg-indigo-600/5" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] dark:bg-blue-600/5" />
      </div>

      <div className="min-h-screen flex items-center justify-center py-8">
        <div className="w-full max-w-[380px] relative my-auto">
          {/* Main Login Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 md:p-8 border border-white/20 dark:border-slate-800">
            {/* Logo Section */}
            <div className="flex flex-col items-center mb-6">
              <motion.div
                key={role}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`w-16 h-16 rounded-full shadow-inner flex items-center justify-center mb-4 overflow-hidden border-2 transition-colors duration-300 ${getRoleColorClasses(currentRole.color, true)}`}
              >
                <div className={`transition-colors duration-300 ${getIconColorClass(currentRole.color)}`}>
                  {currentRole.icon}
                </div>
              </motion.div>
              <h2 className="text-xl font-bold text-[#2E3A59] dark:text-white text-center tracking-tight">
                Welcome Back
              </h2>
              <p className="text-slate-400 font-medium text-xs mt-1 text-center">
                Access your {currentRole.label} console securely
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-slate-400 ml-1">Login as</label>
                <button
                  type="button"
                  onClick={() => setShowRoleSelector(true)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg transition-colors ${getRoleColorClasses(currentRole.color, true).split(" ")[0]}`}>
                      {React.cloneElement(currentRole.icon as React.ReactElement, {
                        className: `w-4 h-4 ${getIconColorClass(currentRole.color)}`
                      })}
                    </div>
                    <div className="text-left">
                      <span className="block text-gray-900 dark:text-slate-200 text-sm font-semibold">
                        {currentRole.label}
                      </span>
                      <span className="block text-[10px] text-gray-500 dark:text-slate-400">
                        {currentRole.description}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                </button>
              </div>

              {/* Dynamic Input Fields */}
              <AnimatePresence mode="wait">
                {role === "student" ? (
                  <motion.div
                    key="student-inputs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-500 transition-colors">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Admission Number"
                        value={regNo}
                        onChange={(e) => setRegNo(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-green-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-500 transition-colors">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full pl-9 pr-9 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-green-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-500 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="standard-inputs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        placeholder={role === "admin" ? "Admin Email" : "Email Address"}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full pl-9 pr-9 py-3 bg-gray-100 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 rounded-xl outline-none transition-all placeholder:text-gray-400 text-sm font-medium text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <AnimatePresence mode="wait">
                {!loading ? (
                  <motion.button
                    key="submit-button"
                    type="submit"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 text-sm font-bold rounded-xl shadow-lg transition-all text-white ${role === "student"
                        ? "bg-green-600 hover:bg-green-700 shadow-green-600/10"
                        : "bg-[#0A1F44] hover:bg-[#0A1F44]/90 shadow-[#0A1F44]/10"
                      }`}
                  >
                    Login to {currentRole.label} Console
                  </motion.button>
                ) : (
                  <motion.div
                    key="loader"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-center py-2"
                  >
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                      <span className="text-sm font-medium">Authenticating...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="text-center pt-1">
                <a href="/forgot-password" className="text-xs text-gray-500 hover:text-indigo-600 transition-colors font-medium">
                  Forgot your password?
                </a>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800 text-center space-y-1">
              <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                © {new Date().getFullYear()} Housing & Marketplace Platform • v2.0
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-400">
                Not yet registered?{" "}
                <a href="/register" className="text-indigo-600 font-semibold hover:underline">
                  Create an account
                </a>
              </p>
            </div>
          </div>

          {/* Bottom Sheet Role Selector - Same width as parent container */}
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
                      <h3 className="text-base font-bold text-center mb-1 dark:text-white">Select Login Role</h3>
                      <p className="text-center text-xs text-gray-500 dark:text-slate-400 mb-6">
                        Choose your account type to continue
                      </p>

                      <div className="space-y-2">
                        {roleOptions.map((option) => {
                          const isSelected = role === option.value;
                          const selectedClasses = getRoleColorClasses(option.color, true);
                          const unselectedClasses = "bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700";

                          return (
                            <button
                              key={option.value}
                              onClick={() => {
                                setRole(option.value);
                                setShowRoleSelector(false);
                                setEmail("");
                                setPassword("");
                                setRegNo("");
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

export default Login;