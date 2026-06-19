import React from "react";
import { ClipboardCheck, DollarSign, User } from "lucide-react";
import { Link } from "react-router-dom";

const Card = ({
  title,
  description,
  to,
  icon,
}: {
  title: string;
  description: string;
  to: string;
  icon: React.ReactNode;
}) => (
  <Link
    to={to}
    className="group relative bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col items-start gap-4"
  >
    <div className="p-3.5 bg-[#E8F4FD] text-[#0A1F44] rounded-xl group-hover:bg-[#0A1F44] group-hover:text-white transition-colors duration-300 shadow-sm">
      {icon}
    </div>
    <div>
      <h3 className="text-lg font-bold text-[#0A1F44] group-hover:text-indigo-900 transition-colors">
        {title}
      </h3>
      <p className="text-sm font-medium text-gray-500 mt-1">{description}</p>
    </div>
  </Link>
);

const StudentDashboard: React.FC = () => {
  const name = localStorage.getItem("studentName") || "Student";
  const regNo = localStorage.getItem("regNo") || "";

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#E8F4FD] min-h-screen font-sans">
      {/* Header */}
      <div className="bg-[#0A1F44] text-white rounded-3xl shadow-xl shadow-[#0A1F44]/10 p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between relative overflow-hidden">
        {/* Decorative background circle */}
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight">Welcome back, {name}! 👋</h2>
          <p className="text-sm text-blue-200 mt-2 font-medium">
            Admission Number: <span className="font-bold text-white tracking-wide">{regNo}</span>
          </p>
        </div>
        <div className="mt-6 sm:mt-0 relative z-10">
          <div className="w-14 h-14 rounded-full bg-white text-[#0A1F44] flex items-center justify-center font-bold text-xl shadow-inner border-4 border-white/20">
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card
          title="Enroll"
          description="Enroll for the current semester"
          to="/student-enroll"
          icon={<ClipboardCheck size={24} />}
        />
        <Card
          title="My Rent Balance"
          description="View your current fee balance"
          to="/student-fees"
          icon={<DollarSign size={24} />}
        />
        <Card
          title="Profile"
          description="Update your profile details"
          to="/student-profile"
          icon={<User size={24} />}
        />
      </div>

      {/* Optional footer note */}
      <p className="text-center text-xs text-gray-500 mt-10">
        © {new Date().getFullYear()} Housing Platform. All rights reserved.
      </p>
    </div>
  );
};

export default StudentDashboard;
