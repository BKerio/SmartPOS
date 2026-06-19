import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import AdminSidebar from "@/components/AdminSidebar";
import StudentSidebar from "@/components/StudentSidebar";
import AdminNavbar from "@/components/AdminNavbar";
import StudentNavbar from "@/components/StudentNavbar";
import UserSidebar from "@/components/UserSidebar";
import UserNavbar from "@/components/UserNavbar";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/students";
import AddStudent from "@/pages/AddStudent";
import Settings from "@/pages/settings";
import Register from "@/pages/Register";
import PendingApprovals from "@/pages/PendingApprovals";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import StudentDashboard from "@/pages/StudentDashboard";
import AdminProfile from "@/pages/AdminProfile";
import StudentProfile from "@/pages/StudentProfile";
import StudentFees from "@/pages/StudentFees";
import PayWithMpesa from "@/pages/paymyfees";
import Reports from "@/pages/Reports";
import AuditLogs from "@/pages/AuditLogs";
import SearchPage from "@/pages/housing/SearchPage";
import PropertyDetailPage from "@/pages/housing/PropertyDetailPage";
import BookingPage from "@/pages/housing/BookingPage";
import MarketplacePage from "@/pages/marketplace/MarketplacePage";
import UserDashboard from "@/pages/UserDashboard";

function AppShell() {
  const location = useLocation();
  const authPages = ["/login", "/register", "/forgot-password"];
  const isAuthPage = authPages.includes(location.pathname);
  const role = (localStorage.getItem("role") || "admin").toLowerCase();

  let SidebarComponent: any = AdminSidebar;
  let NavbarComponent: any = AdminNavbar;

  if (role === "student") {
    SidebarComponent = StudentSidebar;
    NavbarComponent = StudentNavbar;
  } else if (["tenant", "alumni", "owner", "hostel", "manager", "provider", "merchant"].includes(role)) {
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
          <Route path="/user-dashboard" element={<UserDashboard />} />
          <Route path="/tenant-dashboard" element={<UserDashboard />} />
          <Route path="/alumni-dashboard" element={<UserDashboard />} />
          <Route path="/owner-dashboard" element={<UserDashboard />} />
          <Route path="/hostel-dashboard" element={<UserDashboard />} />
          <Route path="/manager-dashboard" element={<UserDashboard />} />
          <Route path="/provider-dashboard" element={<UserDashboard />} />
          <Route path="/merchant-dashboard" element={<UserDashboard />} />
          <Route path="/pending-approvals" element={<ProtectedRoute><PendingApprovals /></ProtectedRoute>} />
          <Route path="/student-dashboard" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />

          <Route path="/student-fees" element={<ProtectedRoute><StudentFees /></ProtectedRoute>} />
          <Route path="/paymyfees" element={<ProtectedRoute><PayWithMpesa /></ProtectedRoute>} />

          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
          <Route path="/admin-profile" element={<ProtectedRoute><AdminProfile /></ProtectedRoute>} />
          <Route path="/student-profile" element={<ProtectedRoute><StudentProfile /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
          <Route path="/add-student" element={<ProtectedRoute><AddStudent /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/property/:id" element={<ProtectedRoute><PropertyDetailPage /></ProtectedRoute>} />
          <Route path="/book/:id" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
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
