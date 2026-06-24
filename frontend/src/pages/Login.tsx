import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ChevronDown, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/services/toast";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import logo from "@/assets/LOGO.png";

type Role = "admin" | "student" | "parent" | "finance" | "restaurant";

interface RoleOption {
  value: Role;
  label: string;
  description: string;
}

const BRAND = "#0A1F44";

const roleOptions: RoleOption[] = [
  { value: "admin", label: "Administrator", description: "System management & oversight" },
  { value: "student", label: "Student", description: "View wallet balance & history" },
  { value: "parent", label: "Parent", description: "Monitor balances & top up wallets" },
  { value: "finance", label: "Finance Officer", description: "Revenue, expenses & reports" },
  { value: "restaurant", label: "Restaurant Staff", description: "POS terminal & menu management" },
];

const DASHBOARD_PATHS: Record<Role, string> = {
  admin: "/",
  student: "/student-fees",
  parent: "/parent-dashboard",
  finance: "/finance",
  restaurant: "/pos",
};

const Login: React.FC = () => {
  const [role, setRole] = useState<Role>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regNo, setRegNo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const navigate = useNavigate();

  const currentRole = roleOptions.find((r) => r.value === role) || roleOptions[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let data;
      if (role === "admin") {
        const res = await API.post("/admin/login", { email, password });
        data = res.data;
        localStorage.setItem("role", "admin");
      } else if (role === "student") {
        const res = await API.post("/students/login", { regNo, password });
        data = res.data;
        localStorage.setItem("role", "student");
        localStorage.setItem("studentName", data.name || "");
        localStorage.setItem("regNo", data.regNo || regNo);
      } else if (role === "parent") {
        const res = await API.post("/parents/login", { email, password });
        data = res.data;
        localStorage.setItem("role", "parent");
        localStorage.setItem("userName", data.name || "");
      } else {
        const res = await API.post("/users/login", { email, password, role });
        data = res.data;
        localStorage.setItem("role", role);
        localStorage.setItem("userName", data.name || "");
      }
      localStorage.setItem("token", data.token);
      toast.success(`Welcome, ${data.name || currentRole.label}!`);
      navigate(DASHBOARD_PATHS[role]);
    } catch (error: any) {
      toast.error("Login failed", error.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-3 py-3 bg-gray-100 border-2 border-transparent focus:border-[#0A1F44]/30 focus:bg-white rounded-xl outline-none text-sm transition";

  return (
    <div className="min-h-screen bg-[#E8F4FD] p-4 font-sans relative overflow-y-auto">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-[#0A1F44]/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-[#0A1F44]/5 blur-[120px]" />
      </div>

      <div className="min-h-screen flex items-center justify-center py-8">
        <div className="w-full max-w-[380px] relative my-auto">
          <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 border border-gray-100">
            <div className="flex flex-col items-center mb-6">
              <motion.img
                key={role}
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={logo}
                draggable={false}
                alt="SmartPOS"
                className="w-28 h-auto object-contain mb-3"
              />
              <h2 className="text-xl font-bold text-[#0A1F44]">Welcome Back</h2>
              <p className="text-slate-500 text-xs mt-1">{currentRole.label} Portal</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0A1F44] ml-1">Login as</label>
                <button
                  type="button"
                  onClick={() => setShowRoleSelector(true)}
                  className="w-full flex items-center justify-between p-3 bg-[#0A1F44]/5 border border-[#0A1F44]/10 rounded-xl hover:bg-[#0A1F44]/10 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <img src={logo} draggable={false} alt="" className="w-8 h-8 object-contain rounded-md" />
                    <div className="text-left">
                      <span className="block text-sm font-semibold text-[#0A1F44]">{currentRole.label}</span>
                      <span className="block text-[10px] text-gray-500">{currentRole.description}</span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#0A1F44]/60" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {role === "student" ? (
                  <motion.div
                    key="student"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <input
                      type="text"
                      placeholder="Admission Number"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      required
                      className={inputCls}
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className={`${inputCls} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44]"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="email"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={inputCls}
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className={`${inputCls} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44]"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: BRAND }}
                className="w-full py-3 text-sm font-bold rounded-xl text-white hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader size="xs" showText={false} />
                    Authenticating...
                  </>
                ) : `Login to ${currentRole.label}`}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-100 text-center">
              <p className="text-[10px] text-gray-400">© {new Date().getFullYear()} SmartPOS · Feeding Minds, Nourishing Futures</p>
              <p className="text-xs text-gray-600 mt-1">
                Not registered?{" "}
                <a href="/register" className="text-[#0A1F44] font-semibold hover:underline">
                  Create an account
                </a>
              </p>
            </div>
          </div>

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
                    className="bg-white rounded-t-3xl shadow-xl max-h-[70vh] overflow-y-auto pointer-events-auto"
                  >
                    <div className="p-6">
                      <div className="flex flex-col items-center mb-4">
                        <img src={logo} alt="SmartPOS" className="w-16 h-auto object-contain mb-2" />
                        <div className="w-10 h-1 bg-gray-200 rounded-full" />
                      </div>
                      <h3 className="text-base font-bold text-center text-[#0A1F44] mb-4">Select Login Role</h3>
                      <div className="space-y-2">
                        {roleOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setRole(option.value);
                              setShowRoleSelector(false);
                              setEmail("");
                              setPassword("");
                              setRegNo("");
                            }}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition ${
                              role === option.value
                                ? "bg-[#0A1F44]/5 border-[#0A1F44]/30"
                                : "bg-gray-50 border-gray-100 hover:border-[#0A1F44]/20"
                            }`}
                          >
                            <div className="text-left flex-1">
                              <span className="block text-sm font-bold text-[#0A1F44]">{option.label}</span>
                              <span className="block text-[10px] text-gray-500">{option.description}</span>
                            </div>
                            {role === option.value && (
                              <CheckCircle2 className="w-5 h-5 text-[#0A1F44] shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowRoleSelector(false)}
                        className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-[#0A1F44]"
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
