/*
 * Page modules, loaded on demand. App.tsx wraps these in React.lazy; the sidebar calls
 * prefetchRoute() on hover so the page's code (and its main data) is already loading before the click.
 */
import { prefetch } from "@/services/api";

export const pages = {
  Dashboard: () => import("@/pages/Dashboard"),
  ManageStudents: () => import("@/pages/admin/ManageStudents"),
  ManageParents: () => import("@/pages/admin/ManageParents"),
  Staffs: () => import("@/pages/admin/Staffs"),
  DataManagement: () => import("@/pages/admin/DataManagement"),
  Settings: () => import("@/pages/settings"),
  Register: () => import("@/pages/Register"),
  PendingApprovals: () => import("@/pages/PendingApprovals"),
  ForgotPassword: () => import("@/pages/ForgotPassword"),
  AdminProfile: () => import("@/pages/AdminProfile"),
  StudentProfile: () => import("@/pages/StudentProfile"),
  OrderDisplay: () => import("@/pages/order/OrderDisplay"),
  StudentWallet: () => import("@/pages/student/StudentWallet"),
  StudentHistory: () => import("@/pages/student/StudentHistory"),
  Reports: () => import("@/pages/Reports"),
  AuditLogs: () => import("@/pages/AuditLogs"),
  UserProfile: () => import("@/pages/UserProfile"),
  ParentProfile: () => import("@/pages/parent/ParentProfile"),
  ParentDashboard: () => import("@/pages/parent/ParentDashboard"),
  PayWithKopokopo: () => import("@/pages/parent/PayWithKopokopo"),
  ParentTopUpWallet: () => import("@/pages/parent/ParentTopUpWallet"),
  ParentManageWallet: () => import("@/pages/parent/ParentManageWallet"),
  ParentWalletHistory: () => import("@/pages/parent/ParentWalletHistory"),
  PosTerminal: () => import("@/pages/restaurant/PosTerminal"),
  MenuManagement: () => import("@/pages/restaurant/MenuManagement"),
  MenuListPage: () => import("@/pages/restaurant/MenuListPage"),
  MenuAddPage: () => import("@/pages/restaurant/MenuAddPage"),
  MenuEditPage: () => import("@/pages/restaurant/MenuEditPage"),
  MenuUpdatePage: () => import("@/pages/restaurant/MenuUpdatePage"),
  MenuDeletePage: () => import("@/pages/restaurant/MenuDeletePage"),
  MenuRecipesPage: () => import("@/pages/restaurant/MenuRecipesPage"),
  MenuCategoriesPage: () => import("@/pages/restaurant/MenuCategoriesPage"),
  InventoryPage: () => import("@/pages/restaurant/InventoryPage"),
  SuppliersPage: () => import("@/pages/restaurant/SuppliersPage"),
  ProductionPage: () => import("@/pages/restaurant/ProductionPage"),
  FinanceDashboard: () => import("@/pages/finance/FinanceDashboard"),
  ExpensesPage: () => import("@/pages/finance/ExpensesPage"),
  ReceiptsPage: () => import("@/pages/finance/ReceiptsPage"),
  CollectionsPage: () => import("@/pages/finance/CollectionsPage"),
  InvoicesPage: () => import("@/pages/finance/InvoicesPage"),
  DailyReportPage: () => import("@/pages/finance/DailyReportPage"),
  ProcurementPage: () => import("@/pages/restaurant/ProcurementPage"),
  StaffAttendanceTerminal: () => import("@/pages/attendance/StaffAttendanceTerminal"),
  StaffAttendanceReport: () => import("@/pages/attendance/StaffAttendanceReport"),
};

/** Route → page module, for the pages reachable from the sidebar. */
const ROUTE_PAGES: Record<string, keyof typeof pages> = {
  "/": "Dashboard",
  "/students": "ManageStudents",
  "/parents": "ManageParents",
  "/staffs": "Staffs",
  "/reports": "Reports",
  "/audit-logs": "AuditLogs",
  "/pending-approvals": "PendingApprovals",
  "/staff-attendance": "StaffAttendanceReport",
  "/admin-profile": "AdminProfile",
  "/settings": "Settings",
  "/data-management": "DataManagement",
  "/student/order": "OrderDisplay",
  "/student/wallet": "StudentWallet",
  "/student/history": "StudentHistory",
  "/student-profile": "StudentProfile",
  "/parent-dashboard": "ParentDashboard",
  "/pay-kopokopo": "PayWithKopokopo",
  "/parent/topup": "ParentTopUpWallet",
  "/parent/wallet": "ParentManageWallet",
  "/parent/history": "ParentWalletHistory",
  "/pos": "PosTerminal",
  "/menu-management": "MenuManagement",
  "/menu-management/list": "MenuListPage",
  "/menu-management/add": "MenuAddPage",
  "/menu-management/edit": "MenuEditPage",
  "/menu-management/update": "MenuUpdatePage",
  "/menu-management/delete": "MenuDeletePage",
  "/menu-management/recipes": "MenuRecipesPage",
  "/menu-management/categories": "MenuCategoriesPage",
  "/inventory": "InventoryPage",
  "/suppliers": "SuppliersPage",
  "/production": "ProductionPage",
  "/my-attendance": "StaffAttendanceReport",
  "/finance": "FinanceDashboard",
  "/expenses": "ExpensesPage",
  "/receipts": "ReceiptsPage",
  "/collections": "CollectionsPage",
  "/invoices": "InvoicesPage",
  "/daily-report": "DailyReportPage",
  "/procurement": "ProcurementPage",
};

/** The main GET each page makes on open (only parameter-free ones, so the cache key matches). */
const ROUTE_DATA: Record<string, string[]> = {
  "/": ["/admin/dashboard"],
  "/students": ["/students"],
  "/parents": ["/parents", "/students"],
  "/staffs": ["/users"],
  "/suppliers": ["/inventory/suppliers"],
  "/procurement": ["/inventory/items", "/inventory/suppliers"],
  "/inventory": ["/inventory/items"],
};

const started = new Set<string>();

export function prefetchRoute(path: string): void {
  const page = ROUTE_PAGES[path];
  if (page && !started.has(path)) {
    started.add(path);
    pages[page]().catch(() => started.delete(path));
  }
  for (const url of ROUTE_DATA[path] ?? []) prefetch(url);
}
