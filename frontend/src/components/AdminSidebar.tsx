import { LayoutDashboard, Users, Settings, GraduationCapIcon, MenuIcon, UserCircle, FileText, Home, ShoppingBag, CheckCircle } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const AdminSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/" },
    { name: "Manage Students", icon: Users, path: "/students" },
    { name: "Add a New Student", icon: GraduationCapIcon, path: "/add-student" },
    { name: "System Reports", icon: FileText, path: "/reports" },
    { name: "Profile", icon: UserCircle, path: "/admin-profile" },
    { name: "Settings", icon: Settings, path: "/settings" },
    { name: "Housing Search", icon: Home, path: "/search" },
    { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
    { name: "Pending Approvals", icon: CheckCircle, path: "/pending-approvals" },
  ];

  return (
    <div className={`h-screen bg-gray-900 text-gray-100 flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className={`text-xl font-bold ${collapsed && "hidden"}`}>Admin</span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white transition">
          {collapsed ? <MenuIcon size={20} /> : <MenuIcon size={20} />}
        </button>
      </div>
      <nav className="flex-1 mt-4">
        {menuItems.map(({ name, icon: Icon, path }) => (
          <Link
            key={name}
            to={path}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition ${location.pathname === path ? "bg-gray-800" : ""}`}
          >
            <Icon size={20} />
            {!collapsed && <span>{name}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default AdminSidebar;
