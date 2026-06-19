import { GraduationCap, ChevronLeft, ChevronRight, LogOut, User, Wallet, Smartphone } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "@/services/toast";

const StudentSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menuItems = [
    { name: "Dashboard", icon: GraduationCap, path: "/student-dashboard" },
    { name: "My Wallet", icon: Wallet, path: "/student-fees" },
    { name: "Top Up (M-Pesa)", icon: Smartphone, path: "/paymyfees" },
    { name: "Profile", icon: User, path: "/student-profile" },
  ];

  const handleLogout = async () => {
    const confirmed = await toast.confirm("Logout?", {
      description: "Are you sure you want to logout?",
      confirmLabel: "Logout",
    });
    if (confirmed) {
      localStorage.clear();
      toast.success("Logged out");
      navigate("/login");
    }
  };

  return (
    <div className={`h-screen bg-gray-900 text-gray-100 flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className={`text-xl font-bold ${collapsed && "hidden"}`}>Student</span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white transition">
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
      <nav className="flex-1 mt-4">
        {menuItems.map(({ name, icon: Icon, path }) => (
          <Link key={name} to={path}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition ${location.pathname === path ? "bg-gray-800" : ""}`}>
            <Icon size={20} />
            {!collapsed && <span>{name}</span>}
          </Link>
        ))}
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-gray-800 transition mt-8">
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </nav>
    </div>
  );
};

export default StudentSidebar;
