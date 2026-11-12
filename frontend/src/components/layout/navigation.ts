import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarDays,
  PackageSearch,
  ChefHat,
  Clock,
  Coins,
  Compass,
  CreditCard,
  DatabaseBackup,
  Edit3,
  FileText,
  Fingerprint,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Monitor,
  PiggyBank,
  PlusCircle,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sliders,
  Store,
  Tags,
  Trash2,
  TrendingUp,
  Truck,
  User,
  UserCircle2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/services/authStorage";

export type NavItem = {
  label: string;
  path: string;
  Icon: LucideIcon;
  /** label on the mobile bottom bar (defaults to the first word of label) */
  short?: string;
  /** extra paths that highlight this item */
  also?: string[];
};
export type NavSection = { title?: string; items: NavItem[] };

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  student: "Student",
  parent: "Parent",
  finance: "Finance Officer",
  restaurant: "Restaurant Staff",
};

export const NAVIGATION: Record<UserRole, NavSection[]> = {
  admin: [
    { items: [{ label: "Dashboard", path: "/", Icon: Compass }] },
    {
      title: "Management",
      items: [
        { label: "Students", path: "/students", Icon: GraduationCap },
        { label: "Parents", path: "/parents", Icon: Heart },
        { label: "Staff", path: "/staffs", Icon: Users },
        { label: "Suppliers", path: "/suppliers", Icon: Truck },
        { label: "Procurement", path: "/procurement", Icon: PackageSearch },
        { label: "Sales Invoices", path: "/invoices", Icon: FileText, short: "Invoices" },
        { label: "Pending Approvals", path: "/pending-approvals", Icon: ShieldCheck, short: "Approvals" },
      ],
    },
    {
      title: "System",
      items: [
        { label: "Daily Report", path: "/daily-report", Icon: CalendarDays, short: "Daily" },
        { label: "System Reports", path: "/reports", Icon: TrendingUp },
        { label: "Staff Attendance", path: "/staff-attendance", Icon: Fingerprint },
        { label: "Collections", path: "/collections", Icon: Receipt },
        { label: "Audit Logs", path: "/audit-logs", Icon: Activity },
        { label: "Backup & Restore", path: "/data-management", Icon: DatabaseBackup },
        { label: "Settings", path: "/settings", Icon: Sliders },
      ],
    },
    { title: "Account", items: [{ label: "Profile", path: "/admin-profile", Icon: UserCircle2 }] },
  ],

  student: [
    {
      items: [
        { label: "My Wallet", path: "/student/wallet", Icon: PiggyBank, short: "Wallet", also: ["/student-fees", "/student-dashboard"] },
        { label: "History", path: "/student/history", Icon: Clock },
      ],
    },
    { title: "Account", items: [{ label: "Profile", path: "/student-profile", Icon: User }] },
  ],

  parent: [
    {
      items: [
        { label: "Dashboard", path: "/parent-dashboard", Icon: LayoutDashboard, short: "Home" },
        { label: "Top Up Wallet", path: "/parent/topup", Icon: CreditCard, short: "Top up" },
        { label: "Manage Wallet", path: "/parent/wallet", Icon: Wallet, short: "Wallet" },
        { label: "History", path: "/parent/history", Icon: Clock },
      ],
    },
    { title: "Account", items: [{ label: "My Profile", path: "/user-profile", Icon: User, short: "Profile" }] },
  ],

  restaurant: [
    {
      title: "Point of sale",
      items: [
        { label: "POS Terminal", path: "/pos", Icon: Store, short: "POS" },
        { label: "Invoices", path: "/invoices", Icon: FileText },
        { label: "Order Display", path: "/kiosk", Icon: Monitor, short: "Kiosk" },
        { label: "Attendance Terminal", path: "/attendance", Icon: Fingerprint, short: "Clock in" },
      ],
    },
    {
      title: "Menu",
      items: [
        { label: "Menu Items", path: "/menu-management/list", Icon: BookOpen, short: "Menu" },
        { label: "Categories", path: "/menu-management/categories", Icon: Tags },
        { label: "Add Item", path: "/menu-management/add", Icon: PlusCircle },
        { label: "Edit Item", path: "/menu-management/edit", Icon: Edit3 },
        { label: "Update Item", path: "/menu-management/update", Icon: RefreshCw },
        { label: "Delete Item", path: "/menu-management/delete", Icon: Trash2 },
        { label: "Recipes", path: "/menu-management/recipes", Icon: ChefHat },
      ],
    },
    {
      title: "Kitchen",
      items: [
        { label: "Inventory & Kitchen", path: "/inventory", Icon: Boxes },
        { label: "Procurement", path: "/procurement", Icon: PackageSearch },
        { label: "Suppliers", path: "/suppliers", Icon: Truck },
        { label: "Daily Report", path: "/daily-report", Icon: CalendarDays },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "My Attendance", path: "/my-attendance", Icon: Fingerprint },
        { label: "Profile", path: "/user-profile", Icon: User },
      ],
    },
  ],

  finance: [
    {
      items: [
        { label: "Finance Dashboard", path: "/finance", Icon: BarChart3, short: "Home" },
        { label: "Collections", path: "/collections", Icon: Coins },
        { label: "Invoices", path: "/invoices", Icon: FileText },
        { label: "Daily Report", path: "/daily-report", Icon: CalendarDays, short: "Daily" },
        { label: "Expenses", path: "/expenses", Icon: Receipt },
        { label: "Receipts", path: "/receipts", Icon: FileText },
      ],
    },
    {
      title: "Stock",
      items: [
        { label: "Inventory & Kitchen", path: "/inventory", Icon: Scale },
        { label: "Procurement", path: "/procurement", Icon: PackageSearch },
        { label: "Suppliers", path: "/suppliers", Icon: Truck },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "My Attendance", path: "/my-attendance", Icon: Fingerprint },
        { label: "Profile", path: "/user-profile", Icon: User },
      ],
    },
  ],
};

/** The nav item that best matches the current path (longest match wins; "/" only matches exactly). */
export function findActiveItem(sections: NavSection[], pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  let bestLen = -1;
  for (const item of sections.flatMap((s) => s.items)) {
    for (const p of [item.path, ...(item.also ?? [])]) {
      const hit = p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`);
      if (hit && p.length > bestLen) {
        best = item;
        bestLen = p.length;
      }
    }
  }
  return best;
}
