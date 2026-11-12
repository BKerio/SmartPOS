import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Clock, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NAVIGATION, findActiveItem } from "./navigation";

interface TopBarProps {
  onToggleSidebar: () => void;
  onSignOut: () => void;
}

const timeFmt = new Intl.DateTimeFormat("en-KE", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short" });

/** Sticky top bar: page title, live clock, and sign out. Slides away while scrolling down. */
function TopBar({ onToggleSidebar, onSignOut }: TopBarProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [now, setNow] = useState(() => new Date());
  const [show, setShow] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setShow(!(y > lastY.current && y > 60));
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!user) return null;
  const title = findActiveItem(NAVIGATION[user.role] ?? [], location.pathname)?.label ?? "Better Forks";

  return (
    <header className="topbar" style={{ transform: show ? "none" : "translateY(-100%)", transition: "transform .3s" }}>
      <button
        onClick={onToggleSidebar}
        className="icon-btn topbar-toggle"
        style={{ border: 0, background: "transparent" }}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>

      <div className="col" style={{ minWidth: 0 }}>
        <h1 className="truncate">{title}</h1>
      </div>

      <div style={{ flex: 1 }} />

      <span className="status-chip topbar-clock" title={now.toLocaleString()}>
        <Clock size={14} />
        <span>{dateFmt.format(now)}</span>
        <span className="tnum">{timeFmt.format(now)}</span>
      </span>

      <button className="icon-btn" onClick={onSignOut} title="Sign out" aria-label="Sign out" style={{ borderColor: "transparent" }}>
        <LogOut size={18} />
      </button>
    </header>
  );
}

export default TopBar;
