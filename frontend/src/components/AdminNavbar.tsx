import { LogOut, Shield } from "lucide-react";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const AdminNavbar = () => {
  const navigate = useNavigate();
  const adminName = localStorage.getItem("adminName") || "Admin";

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: "Logout from Admin Dashboard?",
      text: "You will be required to log in again to continue.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Logout",
    });

    if (result.isConfirmed) {
      localStorage.clear();
      Swal.fire({
        icon: "success",
        title: "Logged out successfully",
        timer: 1000,
        showConfirmButton: false,
      });
      navigate("/login");
    }
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Left: Title & Admin Info */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-100 text-red-600 font-semibold text-lg">
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-800 flex items-center gap-1">
              <Shield size={18} className="text-red-500" />
              Admin Dashboard
            </h1>
            <p className="text-sm text-gray-500">Welcome, {adminName}</p>
          </div>
        </div>

        {/* Right: Logout Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleLogout}
          className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-all duration-200 shadow-sm"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Logout</span>
        </motion.button>
      </div>
    </motion.nav>
  );
};

export default AdminNavbar;
