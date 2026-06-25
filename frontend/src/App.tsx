import React from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import AdminSidebar from "@/components/AdminSidebar";
import StudentSidebar from "@/components/StudentSidebar";
import AdminNavbar from "@/components/AdminNavbar";
import StudentNavbar from "@/components/StudentNavbar";
import UserSidebar from "@/components/UserSidebar";
import UserNavbar from "@/components/UserNavbar";
import Dashboard from "@/pages/Dashboard";
import ManageStudents from "@/pages/admin/ManageStudents";
import ManageParents from "@/pages/admin/ManageParents";
import ManageRestaurantStaff from "@/pages/admin/ManageRestaurantStaff";
import ManageFinanceOfficers from "@/pages/admin/ManageFinanceOfficers";
import Settings from "@/pages/settings";
import Register from "@/pages/Register";
import PendingApprovals from "@/pages/PendingApprovals";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import AdminProfile from "@/pages/AdminProfile";
import StudentProfile from "@/pages/StudentProfile";
import StudentWallet from "@/pages/student/StudentWallet";
import StudentHistory from "@/pages/student/StudentHistory";
import Reports from "@/pages/Reports";
import AuditLogs from "@/pages/AuditLogs";
import UserProfile from "@/pages/UserProfile";
import ParentProfile from "@/pages/parent/ParentProfile";
import ParentDashboard from "@/pages/parent/ParentDashboard";
import PayWithMpesa from "@/pages/parent/PayWithMpesa";
import ParentTopUpWallet from "@/pages/parent/ParentTopUpWallet";
import ParentManageWallet from "@/pages/parent/ParentManageWallet";
import ParentWalletHistory from "@/pages/parent/ParentWalletHistory";
import PosTerminal from "@/pages/restaurant/PosTerminal";
import MenuManagement from "@/pages/restaurant/MenuManagement";
import MenuListPage from "@/pages/restaurant/MenuListPage";
import MenuAddPage from "@/pages/restaurant/MenuAddPage";
import MenuEditPage from "@/pages/restaurant/MenuEditPage";
import MenuUpdatePage from "@/pages/restaurant/MenuUpdatePage";
import MenuDeletePage from "@/pages/restaurant/MenuDeletePage";
import MenuRecipesPage from "@/pages/restaurant/MenuRecipesPage";
import InventoryPage from "@/pages/restaurant/InventoryPage";
import FinanceDashboard from "@/pages/finance/FinanceDashboard";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import ReceiptsPage from "@/pages/finance/ReceiptsPage";

const USER_ROLES = ["parent", "finance", "restaurant"];

function AppShell() {
  const location = useLocation();
  const authPages = ["/login", "/register"];
  const isAuthPage = authPages.includes(location.pathname);
  const role = (localStorage.getItem("role") || "admin").toLowerCase();

  let SidebarComponent: React.FC = AdminSidebar;
  let NavbarComponent: React.FC = AdminNavbar;

  if (role === "student") {
    SidebarComponent = StudentSidebar;
    NavbarComponent = StudentNavbar;
  } else if (USER_ROLES.includes(role)) {
    SidebarComponent = UserSidebar;
    NavbarComponent = UserNavbar;
  }

  return (
    <div className="flex">
      {!isAuthPage && <SidebarComponent />}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        {!isAuthPage && <NavbarComponent />}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Admin */}
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/students" element={<ProtectedRoute><ManageStudents /></ProtectedRoute>} />
          <Route path="/parents" element={<ProtectedRoute><ManageParents /></ProtectedRoute>} />
          <Route path="/restaurant-staff" element={<ProtectedRoute><ManageRestaurantStaff /></ProtectedRoute>} />
          <Route path="/finance-officers" element={<ProtectedRoute><ManageFinanceOfficers /></ProtectedRoute>} />
          <Route path="/manage-users" element={<Navigate to="/students" replace />} />
          <Route path="/add-student" element={<Navigate to="/students" replace />} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
          <Route path="/pending-approvals" element={<ProtectedRoute><PendingApprovals /></ProtectedRoute>} />
          <Route path="/admin-profile" element={<ProtectedRoute><AdminProfile /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

          {/* Student */}
          <Route path="/student/order" element={<Navigate to="/student/wallet" replace />} />
          <Route path="/student-fees" element={<Navigate to="/student/wallet" replace />} />
          <Route path="/student-dashboard" element={<ProtectedRoute><Navigate to="/student/wallet" replace /></ProtectedRoute>} />
          <Route path="/student/wallet" element={<ProtectedRoute><StudentWallet /></ProtectedRoute>} />
          <Route path="/student/history" element={<ProtectedRoute><StudentHistory /></ProtectedRoute>} />
          <Route path="/student-profile" element={<ProtectedRoute><StudentProfile /></ProtectedRoute>} />

          {/* Parent */}
          <Route path="/parent-dashboard" element={<ProtectedRoute><ParentDashboard /></ProtectedRoute>} />
          <Route path="/pay-mpesa" element={<ProtectedRoute><PayWithMpesa /></ProtectedRoute>} />
          <Route path="/parent/topup" element={<ProtectedRoute><ParentTopUpWallet /></ProtectedRoute>} />
          <Route path="/parent/wallet" element={<ProtectedRoute><ParentManageWallet /></ProtectedRoute>} />
          <Route path="/parent/history" element={<ProtectedRoute><ParentWalletHistory /></ProtectedRoute>} />

          {/* Restaurant */}
          <Route path="/pos" element={<ProtectedRoute><PosTerminal /></ProtectedRoute>} />
          <Route path="/menu-management" element={<ProtectedRoute><MenuManagement /></ProtectedRoute>} />
          <Route path="/menu-management/list" element={<ProtectedRoute><MenuListPage /></ProtectedRoute>} />
          <Route path="/menu-management/add" element={<ProtectedRoute><MenuAddPage /></ProtectedRoute>} />
          <Route path="/menu-management/edit" element={<ProtectedRoute><MenuEditPage /></ProtectedRoute>} />
          <Route path="/menu-management/update" element={<ProtectedRoute><MenuUpdatePage /></ProtectedRoute>} />
          <Route path="/menu-management/delete" element={<ProtectedRoute><MenuDeletePage /></ProtectedRoute>} />
          <Route path="/menu-management/recipes" element={<ProtectedRoute><MenuRecipesPage /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />

          {/* Finance */}
          <Route path="/finance" element={<ProtectedRoute><FinanceDashboard /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
          <Route path="/receipts" element={<ProtectedRoute><ReceiptsPage /></ProtectedRoute>} />

          {/* Shared */}
          <Route
            path="/user-profile"
            element={
              <ProtectedRoute>
                {role === "parent" ? <ParentProfile /> : <UserProfile />}
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
