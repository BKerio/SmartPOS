import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    Home, Settings, User, Package, PieChart, ShoppingCart, Users, ClipboardList
} from "lucide-react";

const ROLE_CONFIG: Record<string, {
    label: string;
    menuItems: { name: string; icon: React.FC<any>; path: string }[];
}> = {
    parent: {
        label: "Parent",
        menuItems: [
            { name: "Dashboard", icon: Home, path: "/parent-dashboard" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    restaurant: {
        label: "Restaurant POS",
        menuItems: [
            { name: "POS Terminal", icon: ShoppingCart, path: "/pos" },
            { name: "Menu Management", icon: ClipboardList, path: "/menu-management" },
            { name: "Inventory", icon: Package, path: "/inventory" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    finance: {
        label: "Finance Dept",
        menuItems: [
            { name: "Finance Dashboard", icon: PieChart, path: "/finance" },
            { name: "Expenses", icon: ClipboardList, path: "/expenses" },
            { name: "Inventory Value", icon: Package, path: "/inventory" },
            { name: "Receipts", icon: ShoppingCart, path: "/receipts" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    }
};

const UserSidebar: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const role = (localStorage.getItem("role") || "parent").toLowerCase();

    const config = ROLE_CONFIG[role] || ROLE_CONFIG.parent;
    const menuItems = config.menuItems;

    return (
        <div className={`h-screen bg-[#0A1F44] text-gray-100 flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                <span className={`text-lg font-bold text-white tracking-wide truncate ${collapsed && "hidden"}`}>
                    {config.label} Console
                </span>
                <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white transition">
                    <Home size={20} />
                </button>
            </div>
            <nav className="flex-1 mt-4 overflow-y-auto hidden-scrollbar">
                {menuItems.map(({ name, icon: Icon, path }) => (
                    <Link
                        key={name}
                        to={path}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition border-l-4 ${location.pathname === path || (path !== "/" && location.pathname.startsWith(path))
                                ? "bg-white/10 border-indigo-400 text-white font-medium"
                                : "border-transparent text-gray-400"
                            }`}
                    >
                        <Icon size={20} className={location.pathname === path ? "text-indigo-400" : "text-gray-400"} />
                        {!collapsed && <span>{name}</span>}
                    </Link>
                ))}
            </nav>

            {!collapsed && (
                <div className="p-4 border-t border-white/10 text-xs text-gray-500 text-center">
                    © {new Date().getFullYear()} School System
                </div>
            )}
        </div>
    );
};

export default UserSidebar;
