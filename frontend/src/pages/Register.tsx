import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User, Phone, ChevronDown, ArrowRight, Users, PieChart, UtensilsCrossed } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import Swal from "sweetalert2";
import API from "@/services/api";

type RoleValue = "parent" | "finance" | "restaurant";

const roleOptions = [
  { value: "parent" as RoleValue, label: "Parent", description: "Monitor student feeding accounts", icon: <Users className="w-5 h-5" />, color: "orange" },
  { value: "finance" as RoleValue, label: "Finance Officer", description: "Manage school finances", icon: <PieChart className="w-5 h-5" />, color: "blue" },
  { value: "restaurant" as RoleValue, label: "Restaurant Staff", description: "Cafeteria operations & POS", icon: <UtensilsCrossed className="w-5 h-5" />, color: "cyan" },
];

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", phone: "", role: "" as RoleValue | "" });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedRole = roleOptions.find((r) => r.value === form.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role) return Swal.fire({ icon: "warning", title: "Select a role", text: "Choose your account type." });
    if (form.password !== form.confirmPassword) return Swal.fire({ icon: "error", title: "Passwords don't match" });

    setLoading(true);
    try {
      if (form.role === "parent") {
        await API.post("/parents/register", { name: form.name, email: form.email, password: form.password, phone: form.phone });
        await Swal.fire({ icon: "success", title: "Account Created!", text: "You can now log in as a parent.", confirmButtonColor: "#0A1F44" });
      } else {
        await API.post("/users/register", { name: form.name, email: form.email, password: form.password, phone: form.phone, role: form.role });
        await Swal.fire({
          icon: "success", title: "Registration Submitted!",
          html: "Your account is <strong>pending admin approval</strong>. You'll receive access once reviewed.",
          confirmButtonColor: "#0A1F44",
        });
      }
      navigate("/login");
    } catch (err: any) {
      Swal.fire({ icon: "error", title: "Registration Failed", text: err.response?.data?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E8F4FD] p-4 font-sans flex items-center justify-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-[#0A1F44] text-center">Create Account</h2>
          <p className="text-sm text-gray-500 text-center mt-1 mb-6">Join the SmartPOS school feeding platform</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <button type="button" onClick={() => setShowRoleSelector(true)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl">
              <div className="flex items-center gap-2">
                {selectedRole?.icon || <User className="w-5 h-5 text-gray-400" />}
                <span className="text-sm font-medium">{selectedRole?.label || "Select account type"}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            <input placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} required
              className="w-full px-3 py-3 bg-gray-50 border rounded-xl text-sm outline-none focus:border-indigo-300" />
            <input type="email" placeholder="Email address" value={form.email} onChange={(e) => set("email", e.target.value)} required
              className="w-full px-3 py-3 bg-gray-50 border rounded-xl text-sm outline-none focus:border-indigo-300" />
            <input type="tel" placeholder="Phone (optional)" value={form.phone} onChange={(e) => set("phone", e.target.value)}
              className="w-full px-3 py-3 bg-gray-50 border rounded-xl text-sm outline-none focus:border-indigo-300" />
            <input type="password" placeholder="Password" value={form.password} onChange={(e) => set("password", e.target.value)} required
              className="w-full px-3 py-3 bg-gray-50 border rounded-xl text-sm outline-none focus:border-indigo-300" />
            <input type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} required
              className="w-full px-3 py-3 bg-gray-50 border rounded-xl text-sm outline-none focus:border-indigo-300" />

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[#0A1F44] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0A1F44]/90 disabled:opacity-50">
              {loading ? "Submitting..." : <>Register <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account? <Link to="/login" className="text-indigo-600 font-semibold hover:underline">Login</Link>
          </p>
        </div>

        {showRoleSelector && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowRoleSelector(false)}>
            <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-2" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-center mb-3">Select Account Type</h3>
              {roleOptions.map((r) => (
                <button key={r.value} onClick={() => { set("role", r.value); setShowRoleSelector(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border hover:bg-gray-50 text-left">
                  {r.icon}
                  <div>
                    <p className="font-semibold text-sm">{r.label}</p>
                    <p className="text-xs text-gray-500">{r.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Register;
