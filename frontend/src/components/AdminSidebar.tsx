import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UtensilsCrossed,
  PieChart,
  Settings,
  MenuIcon,
  UserCircle,
  FileText,
  CheckCircle,
  ScrollText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

type MenuItem = {
  name: string;
  icon: any;
  path: string;
};

const menuSections: { title?: string; items: MenuItem[] }[] = [
  {
    items: [{ name: "Dashboard", icon: LayoutDashboard, path: "/" }],
  },
  {
    title: "Management",
    items: [
      { name: "Students", icon: GraduationCap, path: "/students" },
      { name: "Parents", icon: Users, path: "/parents" },
      { name: "Restaurant Staff", icon: UtensilsCrossed, path: "/restaurant-staff" },
      { name: "Finance Officers", icon: PieChart, path: "/finance-officers" },
      { name: "Pending Approvals", icon: CheckCircle, path: "/pending-approvals" },
    ],
  },
  {
    title: "System",
    items: [
      { name: "System Reports", icon: FileText, path: "/reports" },
      { name: "Audit Logs", icon: ScrollText, path: "/audit-logs" },
      { name: "Settings", icon: Settings, path: "/settings" },
    ],
  },
  {
    title: "Account",
    items: [{ name: "Profile", icon: UserCircle, path: "/admin-profile" }],
  },
];

const AdminSidebar = () => {
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("admin_sidebar_collapsed") === "true";
  });

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    localStorage.setItem("admin_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  const isExpanded = !collapsed || hovered;

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`h-screen bg-gray-900 text-gray-100 flex flex-col border-r border-gray-800 transition-all duration-300
        ${collapsed ? "w-20" : "w-64"}
        ${collapsed && hovered ? "w-64 shadow-2xl z-50 absolute" : ""}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        {!collapsed || hovered ? (
          <span className="text-lg font-semibold tracking-wide">
            SmartPOS
          </span>
        ) : (
          <span className="text-lg font-bold">SP</span>
        )}

        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="text-gray-400 hover:text-white transition"
        >
          <MenuIcon size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-4 overflow-y-auto">
        {menuSections.map((section, idx) => (
          <div key={idx} className="mb-4">
            {isExpanded && section.title && (
              <p className="px-4 mb-2 text-xs uppercase tracking-wider text-gray-500">
                {section.title}
              </p>
            )}

            {section.items.map(({ name, icon: Icon, path }) => {
              const active = isActive(path);

              return (
                <Link
                  key={name}
                  to={path}
                  className={`relative flex items-center gap-3 px-4 py-3 mx-2 rounded-md transition
                    ${
                      active
                        ? "bg-gray-800 text-white"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }
                  `}
                >
                  {/* Active indicator */}
                  <span
                    className={`absolute left-0 top-2 bottom-2 w-1 rounded bg-indigo-500 transition-opacity ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />

                  <Icon size={20} />

                  {/* Text only when expanded (hover or full mode) */}
                  {isExpanded && (
                    <span className="text-sm whitespace-nowrap">
                      {name}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;