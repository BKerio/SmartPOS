import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    Home, ShoppingBag, Search, Calendar, Settings,
    User, Building2, Package, Wrench, GraduationCap, MenuIcon
} from "lucide-react";

const ROLE_CONFIG: Record<string, {
    label: string;
    menuItems: { name: string; icon: React.FC<any>; path: string }[];
}> = {
    tenant: {
        label: "Tenant",
        menuItems: [
            { name: "Dashboard", icon: Home, path: "/tenant-dashboard" },
            { name: "Housing Search", icon: Search, path: "/search" },
            { name: "My Bookings", icon: Calendar, path: "/my-bookings" },
            { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    alumni: {
        label: "Alumni",
        menuItems: [
            { name: "Dashboard", icon: GraduationCap, path: "/alumni-dashboard" },
            { name: "Temporary Housing", icon: Search, path: "/search" },
            { name: "Community Services", icon: Package, path: "/marketplace" },
            { name: "My Bookings", icon: Calendar, path: "/my-bookings" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    owner: {
        label: "Property Owner",
        menuItems: [
            { name: "Dashboard", icon: Building2, path: "/owner-dashboard" },
            { name: "My Listings", icon: Home, path: "/my-properties" },
            { name: "Current Bookings", icon: Calendar, path: "/my-bookings" },
            { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    hostel: {
        label: "Housing Provider",
        menuItems: [
            { name: "Dashboard", icon: Building2, path: "/hostel-dashboard" },
            { name: "My Properties", icon: Home, path: "/my-properties" },
            { name: "Current Bookings", icon: Calendar, path: "/my-bookings" },
            { name: "Search Listings", icon: Search, path: "/search" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    manager: {
        label: "Property Manager",
        menuItems: [
            { name: "Dashboard", icon: Building2, path: "/manager-dashboard" },
            { name: "Properties", icon: Home, path: "/my-properties" },
            { name: "Tenant Bookings", icon: Calendar, path: "/my-bookings" },
            { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    provider: {
        label: "Service Provider",
        menuItems: [
            { name: "Dashboard", icon: Wrench, path: "/provider-dashboard" },
            { name: "My Services", icon: Package, path: "/my-services" },
            { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
            { name: "Browse Properties", icon: Search, path: "/search" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
    merchant: {
        label: "Merchant",
        menuItems: [
            { name: "Dashboard", icon: Package, path: "/merchant-dashboard" },
            { name: "My Listings", icon: ShoppingBag, path: "/my-listings" },
            { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
            { name: "Browse Properties", icon: Search, path: "/search" },
            { name: "Profile", icon: User, path: "/user-profile" },
            { name: "Settings", icon: Settings, path: "/settings" },
        ]
    },
};

const UserSidebar: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const role = (localStorage.getItem("role") || "tenant").toLowerCase();

    const config = ROLE_CONFIG[role] || ROLE_CONFIG.tenant;
    const menuItems = config.menuItems;

    return (
        <div className={`h-screen bg-[#0A1F44] text-gray-100 flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                <span className={`text-lg font-bold text-white tracking-wide truncate ${collapsed && "hidden"}`}>
                    {config.label} Console
                </span>
                <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white transition">
                    <MenuIcon size={20} />
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
                    © {new Date().getFullYear()} Housing Platform
                </div>
            )}
        </div>
    );
};

export default UserSidebar;
