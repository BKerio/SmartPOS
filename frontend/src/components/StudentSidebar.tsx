import { GraduationCap, ChevronLeft, ChevronRight, LogOut, User, EuroIcon, Home, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

const StudentSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menuItems = [
    { name: "Dashboard", icon: GraduationCap, path: "/student-dashboard" },
    { name: "Profile", icon: User, path: "/student-profile" },
    { name: "Pay via M-Pesa", icon: EuroIcon, path: "/paymyfees" },
    { name: "Housing Search", icon: Home, path: "/search" },
    { name: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
  ];

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: "Are you sure you want to logout?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, logout",
    });
    if (result.isConfirmed) {
      localStorage.clear();
      Swal.fire({ icon: "success", title: "Logged out!", timer: 1200, showConfirmButton: false });
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
          <Link
            key={name}
            to={path}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition ${location.pathname === path ? "bg-gray-800" : ""}`}
          >
            <Icon size={20} />
            {!collapsed && <span>{name}</span>}
          </Link>
        ))}
        <button
          className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-gray-800 transition mt-8"
          onClick={handleLogout}
        >
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </nav>
    </div>
  );
};

export default StudentSidebar;
