import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, getDashboardPath, useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/services/authStorage";
import Loader from "@/components/ui/loader";
import RoleProtectedRoute from "@/components/RoleProtectedRoute";
import GuestRoute from "@/components/GuestRoute";
import AppShell from "@/components/layout/AppShell";
import PageLoader from "@/components/shared/PageLoader";
import { markNavigation } from "@/services/api";
import { pages } from "@/pagesRegistry";
const Dashboard = lazy(pages.Dashboard);
const ManageStudents = lazy(pages.ManageStudents);
const ManageParents = lazy(pages.ManageParents);
const Staffs = lazy(pages.Staffs);
const DataManagement = lazy(pages.DataManagement);
const Settings = lazy(pages.Settings);
const Register = lazy(pages.Register);
const PendingApprovals = lazy(pages.PendingApprovals);
import Login from "@/pages/Login";
const ForgotPassword = lazy(pages.ForgotPassword);
const AdminProfile = lazy(pages.AdminProfile);
const StudentProfile = lazy(pages.StudentProfile);
const OrderDisplay = lazy(pages.OrderDisplay);
const StudentWallet = lazy(pages.StudentWallet);
const StudentHistory = lazy(pages.StudentHistory);
const Reports = lazy(pages.Reports);
const AuditLogs = lazy(pages.AuditLogs);
const UserProfile = lazy(pages.UserProfile);
const ParentProfile = lazy(pages.ParentProfile);
const ParentDashboard = lazy(pages.ParentDashboard);
const PayWithKopokopo = lazy(pages.PayWithKopokopo);
const ParentTopUpWallet = lazy(pages.ParentTopUpWallet);
const ParentManageWallet = lazy(pages.ParentManageWallet);
const ParentWalletHistory = lazy(pages.ParentWalletHistory);
const PosTerminal = lazy(pages.PosTerminal);
const MenuManagement = lazy(pages.MenuManagement);
const MenuListPage = lazy(pages.MenuListPage);
const MenuAddPage = lazy(pages.MenuAddPage);
const MenuEditPage = lazy(pages.MenuEditPage);
const MenuUpdatePage = lazy(pages.MenuUpdatePage);
const MenuDeletePage = lazy(pages.MenuDeletePage);
const MenuRecipesPage = lazy(pages.MenuRecipesPage);
const MenuCategoriesPage = lazy(pages.MenuCategoriesPage);
const InventoryPage = lazy(pages.InventoryPage);
const SuppliersPage = lazy(pages.SuppliersPage);
const ProductionPage = lazy(pages.ProductionPage);
const FinanceDashboard = lazy(pages.FinanceDashboard);
const ExpensesPage = lazy(pages.ExpensesPage);
const ReceiptsPage = lazy(pages.ReceiptsPage);
const CollectionsPage = lazy(pages.CollectionsPage);
const InvoicesPage = lazy(pages.InvoicesPage);
const DailyReportPage = lazy(pages.DailyReportPage);
const ProcurementPage = lazy(pages.ProcurementPage);
const StaffAttendanceTerminal = lazy(pages.StaffAttendanceTerminal);
const StaffAttendanceReport = lazy(pages.StaffAttendanceReport);

// A page refresh should also start at the top, not where the browser last was.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const R = (roles: UserRole[], element: JSX.Element) => (
  <RoleProtectedRoute roles={roles}>{element}</RoleProtectedRoute>
);

function AppRoutes() {
  const location = useLocation();
  // Layout effects run before any page's data-fetching effects, so the page's first requests
  // fall inside the navigation window and can be answered from the API cache.
  // Every page opens at the top: after a link, a redirect, or back/forward.
  useLayoutEffect(() => {
    markNavigation();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);
  const { status, user } = useAuth();
  const publicPages = ["/login", "/register", "/forgot-password", "/kiosk", "/attendance"];
  const isAuthPage = publicPages.includes(location.pathname);
  const isKioskPage = location.pathname === "/kiosk";
  const isAttendancePage = location.pathname === "/attendance";
  const showShell = status === "authenticated" && !!user && !isAuthPage && !isKioskPage && !isAttendancePage;

  if (status === "loading" && !isAuthPage) {
    return (
      <Loader
        size="sm"
        title="Loading SmartPOS..."
        subtitle="Verifying your session"
        className="min-h-screen py-24"
      />
    );
  }

  if (status === "unauthenticated" && !isAuthPage) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isKioskPage) {
    return (
      <Suspense fallback={<PageLoader height={360} />}>
        <Routes>
          <Route path="/kiosk" element={<OrderDisplay mode="kiosk" />} />
        </Routes>
      </Suspense>
    );
  }

  if (isAttendancePage) {
    return (
      <Suspense fallback={<PageLoader height={360} />}>
        <Routes>
          <Route path="/attendance" element={<StaffAttendanceTerminal />} />
        </Routes>
      </Suspense>
    );
  }

  const routes = (
        <Routes>
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />

          {/* Admin */}
          <Route path="/" element={R(["admin"], <Dashboard />)} />
          <Route path="/students" element={R(["admin"], <ManageStudents />)} />
          <Route path="/parents" element={R(["admin"], <ManageParents />)} />
          <Route path="/staffs" element={R(["admin"], <Staffs />)} />
          <Route path="/restaurant-staff" element={<Navigate to="/staffs" replace />} />
          <Route path="/finance-officers" element={<Navigate to="/staffs" replace />} />
          <Route path="/manage-users" element={R(["admin"], <Navigate to="/students" replace />)} />
          <Route path="/add-student" element={R(["admin"], <Navigate to="/students" replace />)} />
          <Route path="/reports" element={R(["admin"], <Reports />)} />
          <Route path="/audit-logs" element={R(["admin"], <AuditLogs />)} />
          <Route path="/pending-approvals" element={R(["admin"], <PendingApprovals />)} />
          <Route path="/staff-attendance" element={R(["admin", "finance"], <StaffAttendanceReport />)} />
          <Route path="/admin-profile" element={R(["admin"], <AdminProfile />)} />
          <Route path="/settings" element={R(["admin"], <Settings />)} />
          <Route path="/data-management" element={R(["admin"], <DataManagement />)} />

          {/* Student */}
          <Route path="/student/order" element={R(["student"], <OrderDisplay mode="student" />)} />
          <Route path="/student-fees" element={<Navigate to="/student/wallet" replace />} />
          <Route path="/student-dashboard" element={R(["student"], <Navigate to="/student/wallet" replace />)} />
          <Route path="/student/wallet" element={R(["student"], <StudentWallet />)} />
          <Route path="/student/history" element={R(["student"], <StudentHistory />)} />
          <Route path="/student-profile" element={R(["student"], <StudentProfile />)} />

          {/* Parent */}
          <Route path="/parent-dashboard" element={R(["parent"], <ParentDashboard />)} />
          <Route path="/pay-kopokopo" element={R(["parent", "admin", "restaurant", "finance"], <PayWithKopokopo />)} />
          <Route path="/pay-mpesa" element={<Navigate to="/pay-kopokopo" replace />} />
          <Route path="/parent/topup" element={R(["parent"], <ParentTopUpWallet />)} />
          <Route path="/parent/wallet" element={R(["parent"], <ParentManageWallet />)} />
          <Route path="/parent/history" element={R(["parent"], <ParentWalletHistory />)} />

          {/* Restaurant */}
          <Route path="/pos" element={R(["restaurant"], <PosTerminal />)} />
          <Route path="/menu-management" element={R(["restaurant"], <MenuManagement />)} />
          <Route path="/menu-management/list" element={R(["restaurant"], <MenuListPage />)} />
          <Route path="/menu-management/add" element={R(["restaurant"], <MenuAddPage />)} />
          <Route path="/menu-management/edit" element={R(["restaurant"], <MenuEditPage />)} />
          <Route path="/menu-management/update" element={R(["restaurant"], <MenuUpdatePage />)} />
          <Route path="/menu-management/delete" element={R(["restaurant"], <MenuDeletePage />)} />
          <Route path="/menu-management/recipes" element={R(["restaurant"], <MenuRecipesPage />)} />
          <Route path="/menu-management/categories" element={R(["restaurant"], <MenuCategoriesPage />)} />
          <Route path="/inventory" element={R(["admin", "restaurant", "finance"], <InventoryPage />)} />
          <Route path="/suppliers" element={R(["admin", "restaurant", "finance"], <SuppliersPage />)} />
          <Route path="/production" element={R(["admin", "restaurant", "finance"], <ProductionPage />)} />
          <Route path="/my-attendance" element={R(["restaurant", "finance"], <StaffAttendanceReport />)} />

          {/* Finance */}
          <Route path="/finance" element={R(["finance"], <FinanceDashboard />)} />
          <Route path="/expenses" element={R(["finance"], <ExpensesPage />)} />
          <Route path="/receipts" element={R(["finance"], <ReceiptsPage />)} />
          <Route path="/collections" element={R(["admin", "finance"], <CollectionsPage />)} />
          <Route path="/invoices" element={R(["admin", "finance", "restaurant"], <InvoicesPage />)} />
          <Route path="/daily-report" element={R(["admin", "finance", "restaurant"], <DailyReportPage />)} />
          <Route path="/procurement" element={R(["admin", "finance", "restaurant"], <ProcurementPage />)} />

          {/* Shared profile */}
          <Route
            path="/user-profile"
            element={R(
              ["admin", "student", "parent", "finance", "restaurant"],
              user?.role === "parent" ? <ParentProfile />
                : user?.role === "admin" ? <AdminProfile />
                : user?.role === "student" ? <StudentProfile />
                : <UserProfile />,
            )}
          />

          <Route
            path="*"
            element={
              status === "authenticated" && user
                ? <Navigate to={getDashboardPath(user.role)} replace />
                : <Navigate to="/login" replace />
            }
          />
        </Routes>
  );

  // Pages are code-split: each one is downloaded the first time it is opened.
  const content = <Suspense fallback={<PageLoader height={360} />}>{routes}</Suspense>;
  return showShell ? <AppShell>{content}</AppShell> : content;
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
