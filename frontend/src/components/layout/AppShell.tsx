import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/services/toast";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { ROLE_LABELS } from "./navigation";

const COLLAPSED_KEY = "sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Signed-in layout: sidebar + sticky top bar around the page. */
function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  const signOut = async () => {
    const detail = user?.email || user?.regNo || (user ? ROLE_LABELS[user.role] : null);
    if (!(await toast.signOut({ name: user?.name, detail }))) return;
    logout();
    toast.success("Signed out");
    navigate("/login");
  };

  const toggle = () => setCollapsed((c) => !c);

  return (
    <div className="app">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} onSignOut={signOut} />
      <div className="main">
        <TopBar onToggleSidebar={toggle} onSignOut={signOut} />
        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
