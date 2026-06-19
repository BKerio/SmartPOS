import { LogOut, User as UserIcon, Home, GraduationCap, Building2, Package, Wrench } from "lucide-react";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import React from "react";

const ROLE_ICONS: Record<string, React.ReactNode> = {
    tenant: <Home size={18} className="text-indigo-500" />,
    alumni: <GraduationCap size={18} className="text-blue-500" />,
    owner: <Building2 size={18} className="text-emerald-500" />,
    hostel: <Building2 size={18} className="text-violet-500" />,
    manager: <Building2 size={18} className="text-orange-500" />,
    provider: <Wrench size={18} className="text-rose-500" />,
    merchant: <Package size={18} className="text-amber-500" />,
};

const UserNavbar = () => {
    const navigate = useNavigate();
    const userName = localStorage.getItem("userName") || "User";
    const rawRole = localStorage.getItem("role") || "tenant";
    const role = rawRole.toLowerCase();

    const handleLogout = async () => {
        const result = await Swal.fire({
            title: "Logout?",
            text: "Are you sure you want to end your session?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#0A1F44",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Yes, Logout",
        });

        if (result.isConfirmed) {
            localStorage.clear();
            Swal.fire({
                icon: "success",
                title: "Logged out",
                timer: 1000,
                showConfirmButton: false,
            });
            navigate("/login");
        }
    };

    const getDisplayRoleName = () => {
        if (role === "owner") return "Property Owner";
        if (role === "hostel") return "Housing Provider";
        const title = role.charAt(0).toUpperCase() + role.slice(1);
        return title;
    };

    return (
        <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm"
        >
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
                {/* Left: Title & User Info */}
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-100 text-[#0A1F44] font-bold text-lg border border-slate-200 shadow-inner">
                        {userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                            {ROLE_ICONS[role] || <UserIcon size={18} className="text-indigo-500" />}
                            {getDisplayRoleName()} Dashboard
                        </h1>
                        <p className="text-xs text-gray-500 font-medium">Welcome, {userName}</p>
                    </div>
                </div>

                {/* Right: Logout Button */}
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLogout}
                    className="flex items-center gap-2 bg-[#0A1F44] text-white px-4 py-2 rounded-lg hover:bg-[#0A1F44]/90 transition-all duration-200 shadow-sm shadow-[#0A1F44]/20"
                >
                    <LogOut size={16} />
                    <span className="text-sm font-semibold">Logout</span>
                </motion.button>
            </div>
        </motion.nav>
    );
};

export default UserNavbar;
