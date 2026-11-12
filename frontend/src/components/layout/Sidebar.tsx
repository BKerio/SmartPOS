import { useState } from "react";
import { prefetchRoute } from "@/pagesRegistry";
import { Link, useLocation } from "react-router-dom";
import { LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import logoWide from "@/assets/logo-wide.png";
import logoMark from "@/assets/logo-mark.png";
import { NAVIGATION, ROLE_LABELS, findActiveItem } from "./navigation";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSignOut: () => void;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

/** Brand-header sidebar with grouped nav (desktop) and a bottom tab bar with a "More" drawer (mobile). */
function Sidebar({ collapsed, onToggleCollapse, onSignOut }: SidebarProps) {
  const { user } = useAuth();
  const location = useLocation();
  // When collapsed, hovering the rail temporarily expands it as an overlay.
  const [peek, setPeek] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const sections = NAVIGATION[user.role] ?? [];
  const allItems = sections.flatMap((s) => s.items);
  const active = findActiveItem(sections, location.pathname);
  const name = user.name || "User";

  // Mobile: up to 4 tabs, plus "More" when there are extra items.
  const tabs = allItems.length <= 5 ? allItems : allItems.slice(0, 4);
  const hasMore = allItems.length > tabs.length;

  const navLink = (item: (typeof allItems)[number], onClick?: () => void) => {
    const isActive = item === active;
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onClick}
        onMouseEnter={() => prefetchRoute(item.path)}
        onFocus={() => prefetchRoute(item.path)}
        className={`nav-item${isActive ? " active" : ""}`}
        aria-current={isActive ? "page" : undefined}
        title={collapsed && !peek ? item.label : undefined}
      >
        <item.Icon size={20} aria-hidden="true" />
        <span className="nav-label">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <aside
        className={`sidebar${collapsed ? " collapsed" : ""}${collapsed && peek ? " peek" : ""}`}
        onMouseEnter={() => collapsed && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
      >
        <div className="sidebar-inner">
          <div className="sidebar-head">
            <button
              onClick={onToggleCollapse}
              className="sidebar-collapse-btn"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            {/* The company logo (LOGO.png, trimmed) on a white card: its dark-green lettering needs a light
                background. Collapsed, just the fork arc in the round tile. */}
            <div className="brand-card">
              <img src={logoWide} alt="Better Fork Restaurant Limited" className="brand-card-img" draggable={false} />
            </div>
            <div className="brand-logo">
              <img src={logoMark} alt="Better Fork" className="brand-logo-mark" draggable={false} />
            </div>
          </div>

          <nav className="nav-scroll" aria-label="Main">
            {sections.map((section, idx) => (
              <div className="nav-group" key={section.title ?? `section-${idx}`}>
                {section.title && <div className="nav-group-label">{section.title.toUpperCase()}</div>}
                {section.items.map((item) => navLink(item))}
              </div>
            ))}
          </nav>

          <div className="sidebar-foot">
            <div className="sidebar-user">
              <div className="av av-sm" style={{ background: "var(--green)" }}>{initialsOf(name)}</div>
              <div className="sidebar-user-meta">
                <b>{name}</b>
                <span>{ROLE_LABELS[user.role]}</span>
              </div>
            </div>
            <button onClick={onSignOut} className="sidebar-logout-btn" title="Sign out">
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottomnav" aria-label="Main">
        {tabs.map((item) => {
          const isActive = item === active;
          return (
            <Link
              key={item.path}
              to={item.path}
              onTouchStart={() => prefetchRoute(item.path)}
              className={`bn-item${isActive ? " on" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.Icon size={22} aria-hidden="true" />
              <span>{item.short ?? item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        {hasMore && (
          <button
            type="button"
            className={`bn-item${active && !tabs.includes(active) ? " on" : ""}`}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal size={22} aria-hidden="true" />
            <span>More</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <>
          <div className="drawer-back" onClick={() => setMoreOpen(false)} />
          <div className="drawer nav-drawer" role="dialog" aria-label="Menu">
            <div className="nav-drawer-head">
              <div className="row">
                <div className="av av-md" style={{ background: "var(--green)" }}>{initialsOf(name)}</div>
                <div className="col" style={{ minWidth: 0 }}>
                  <b className="nav-drawer-name">{name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{ROLE_LABELS[user.role]}</span>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <nav className="nav-drawer-body">
              {sections.map((section, idx) => (
                <div className="nav-group" key={section.title ?? `section-${idx}`}>
                  {section.title && <div className="nav-group-label">{section.title.toUpperCase()}</div>}
                  {section.items.map((item) => navLink(item, () => setMoreOpen(false)))}
                </div>
              ))}
            </nav>
            <div className="nav-drawer-foot">
              <button
                className="btn btn-ghost btn-block"
                onClick={() => {
                  setMoreOpen(false);
                  onSignOut();
                }}
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default Sidebar;
