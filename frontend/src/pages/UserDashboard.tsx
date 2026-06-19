import React from "react";
import { Link } from "react-router-dom";
import {
    Home, ShoppingBag, Search, Calendar, Settings,
    User, Building2, Package, Wrench, GraduationCap
} from "lucide-react";

const ROLE_CONFIG: Record<string, {
    label: string;
    icon: React.ReactNode;
    greeting: string;
    quickLinks: { label: string; path: string; icon: React.ReactNode }[];
}> = {
    tenant: {
        label: "Tenant",
        icon: <Home size={32} className="text-white" />,
        greeting: "Find your perfect home",
        quickLinks: [
            { label: "Browse Properties", path: "/search", icon: <Search size={22} /> },
            { label: "My Bookings", path: "/my-bookings", icon: <Calendar size={22} /> },
            { label: "Marketplace", path: "/marketplace", icon: <ShoppingBag size={22} /> },
            { label: "My Profile", path: "/user-profile", icon: <User size={22} /> },
        ],
    },
    alumni: {
        label: "Alumni",
        icon: <GraduationCap size={32} className="text-white" />,
        greeting: "Welcome back, alumnus",
        quickLinks: [
            { label: "Temporary Housing", path: "/search", icon: <Home size={22} /> },
            { label: "Community Services", path: "/marketplace", icon: <Package size={22} /> },
            { label: "My Bookings", path: "/my-bookings", icon: <Calendar size={22} /> },
            { label: "My Profile", path: "/user-profile", icon: <User size={22} /> },
        ],
    },
    owner: {
        label: "Property Owner",
        icon: <Building2 size={32} className="text-white" />,
        greeting: "Manage your properties",
        quickLinks: [
            { label: "My Listings", path: "/my-properties", icon: <Building2 size={22} /> },
            { label: "Current Bookings", path: "/my-bookings", icon: <Calendar size={22} /> },
            { label: "Browse Market", path: "/marketplace", icon: <ShoppingBag size={22} /> },
            { label: "Settings", path: "/settings", icon: <Settings size={22} /> },
        ],
    },
    hostel: {
        label: "Housing Provider",
        icon: <Building2 size={32} className="text-white" />,
        greeting: "Manage your student accommodation",
        quickLinks: [
            { label: "My Properties", path: "/my-properties", icon: <Building2 size={22} /> },
            { label: "Current Bookings", path: "/my-bookings", icon: <Calendar size={22} /> },
            { label: "Search Listings", path: "/search", icon: <Search size={22} /> },
            { label: "Settings", path: "/settings", icon: <Settings size={22} /> },
        ],
    },
    manager: {
        label: "Property Manager",
        icon: <Building2 size={32} className="text-white" />,
        greeting: "Manage your units and tenants",
        quickLinks: [
            { label: "Properties", path: "/my-properties", icon: <Building2 size={22} /> },
            { label: "Tenant Bookings", path: "/my-bookings", icon: <Calendar size={22} /> },
            { label: "Marketplace", path: "/marketplace", icon: <ShoppingBag size={22} /> },
            { label: "Settings", path: "/settings", icon: <Settings size={22} /> },
        ],
    },
    provider: {
        label: "Service Provider",
        icon: <Wrench size={32} className="text-white" />,
        greeting: "Connect with clients and offer services",
        quickLinks: [
            { label: "My Services", path: "/my-services", icon: <Wrench size={22} /> },
            { label: "Marketplace", path: "/marketplace", icon: <ShoppingBag size={22} /> },
            { label: "Browse Properties", path: "/search", icon: <Search size={22} /> },
            { label: "Settings", path: "/settings", icon: <Settings size={22} /> },
        ],
    },
    merchant: {
        label: "Merchant",
        icon: <Package size={32} className="text-white" />,
        greeting: "Sell your products to the community",
        quickLinks: [
            { label: "My Listings", path: "/marketplace", icon: <ShoppingBag size={22} /> },
            { label: "Browse Properties", path: "/search", icon: <Home size={22} /> },
            { label: "My Profile", path: "/user-profile", icon: <User size={22} /> },
            { label: "Settings", path: "/settings", icon: <Settings size={22} /> },
        ],
    },
};

const UserDashboard: React.FC = () => {
    const role = localStorage.getItem("role") || "tenant";
    const name = localStorage.getItem("userName") || "User";
    const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.tenant;

    return (
        <div className="min-h-screen bg-[#E8F4FD] font-sans pb-12">
            {/* Header */}
            <div className="bg-[#0A1F44] text-white pt-12 pb-24 px-6 relative overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none transform translate-x-1/3 -translate-y-1/3"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none transform -translate-x-1/4 translate-y-1/4"></div>

                <div className="max-w-5xl mx-auto flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-xl">
                            {config.icon}
                        </div>
                        <div>
                            <p className="text-blue-200 text-xs font-bold uppercase tracking-[0.2em] mb-1">{config.label}</p>
                            <h1 className="text-3xl font-bold tracking-tight">Hello, {name} 👋</h1>
                            <p className="text-blue-100/80 text-sm mt-1">{config.greeting}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 -mt-12 relative z-20">
                {/* Quick Actions */}
                <div className="flex items-center justify-between mb-4 mt-2">
                    <h2 className="text-xl font-bold text-[#0A1F44]">Quick Actions</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {config.quickLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center gap-3 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
                        >
                            <div className="w-14 h-14 bg-[#E8F4FD] rounded-2xl flex items-center justify-center text-[#0A1F44] group-hover:bg-[#0A1F44] group-hover:text-white transition-colors duration-300 shadow-inner">
                                {link.icon}
                            </div>
                            <span className="text-sm font-bold text-[#0A1F44] text-center mt-1">{link.label}</span>
                        </Link>
                    ))}
                </div>

                {/* Platform Highlights */}
                <h2 className="text-xl font-bold text-[#0A1F44] mb-4">Explore</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Link to="/search" className="bg-white rounded-3xl border border-gray-100 p-8 flex items-center gap-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                        <div className="w-16 h-16 bg-[#E8F4FD] rounded-2xl flex items-center justify-center group-hover:bg-[#0A1F44] transition-colors duration-300 shadow-sm">
                            <Search size={28} className="text-[#0A1F44] group-hover:text-white transition-colors duration-300" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[#0A1F44] mb-1">Housing Search</h3>
                            <p className="text-gray-500 text-sm font-medium">Find rooms, hostels, and apartments</p>
                        </div>
                    </Link>
                    <Link to="/marketplace" className="bg-white rounded-3xl border border-gray-100 p-8 flex items-center gap-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                        <div className="w-16 h-16 bg-[#E8F4FD] rounded-2xl flex items-center justify-center group-hover:bg-[#0A1F44] transition-colors duration-300 shadow-sm">
                            <ShoppingBag size={28} className="text-[#0A1F44] group-hover:text-white transition-colors duration-300" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[#0A1F44] mb-1">Marketplace</h3>
                            <p className="text-gray-500 text-sm font-medium">Buy and sell student essentials</p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;
