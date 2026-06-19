import React, { useEffect, useState } from "react";
import API from "@/services/api";
import Swal from "sweetalert2";
import {
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  FileText,
  TrendingUp,
  TrendingDown,
  Loader2,
  UserCog,
  CreditCard,
  ClipboardList,
} from "lucide-react";

interface ReportsData {
  summary: {
    students: number;
    staff: number;
    courses: number;
    enrollments: number;
    payments: {
      total: number;
      successful: number;
      pending: number;
      failed: number;
    };
    budgets: number;
  };
  students: {
    byCourse: Array<{ _id: string; count: number }>;
    byYear: Array<{ _id: number; count: number }>;
  };
  staff: {
    byRole: Array<{ _id: string; count: number }>;
  };
  courses: {
    total: number;
    withFees: number;
    totalCourseFees: number;
    byHOD: Array<{ _id: string; count: number; courses: Array<{ name: string; code: string }> }>;
  };
  enrollments: {
    total: number;
    bySemester: Array<{ _id: string; count: number }>;
    stats: {
      totalFees: number;
      totalPaid: number;
      avgFee: number;
    };
  };
  payments: {
    total: number;
    successful: number;
    pending: number;
    failed: number;
    stats: {
      totalAmount: number;
      avgAmount: number;
      count: number;
    };
    byMonth: Array<{
      _id: { year: number; month: number };
      totalAmount: number;
      count: number;
    }>;
  };
  budgets: {
    total: number;
    byStatus: Array<{ _id: string; count: number }>;
    stats: {
      totalAmount: number;
      avgAmount: number;
    };
  };
  outstanding: {
    total: number;
    count: number;
    enrollments: Array<{
      enrollmentId: string;
      semester: string;
      student: any;
      courses: any[];
      totalFee: number;
      paidAmount: number;
      balance: number;
    }>;
  };
  financial: {
    totalFeesExpected: number;
    totalFeesPaid: number;
    totalOutstanding: number;
    paymentRate: string;
  };
  recentActivity: {
    payments: any[];
    enrollments: any[];
  };
  meta?: {
    generatedFor?: string;
    generatedBy?: string | null;
    generatedAt?: string;
    scope?: string;
  };
}

const Reports: React.FC = () => {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const authHeader = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const fetchReports = async () => {
    try {
      const { data } = await API.get("/reports/system", { headers: authHeader });
      setData(data);
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Failed to load reports",
        text: error.response?.data?.message || error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading reports...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const StatCard = ({
    title,
    value,
    icon,
    color = "indigo",
    trend,
  }: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color?: string;
    trend?: React.ReactNode;
  }) => {
    const colorClasses = {
      indigo: "bg-indigo-50 border-indigo-200 text-indigo-600",
      green: "bg-green-50 border-green-200 text-green-600",
      blue: "bg-blue-50 border-blue-200 text-blue-600",
      purple: "bg-purple-50 border-purple-200 text-purple-600",
      orange: "bg-orange-50 border-orange-200 text-orange-600",
      red: "bg-red-50 border-red-200 text-red-600",
    };

    return (
      <div className={`p-6 rounded-xl border ${colorClasses[color as keyof typeof colorClasses]}`}>
        <div className="flex items-center justify-between mb-2">
          <div className={`p-3 rounded-lg bg-white ${colorClasses[color as keyof typeof colorClasses].split(" ")[0]}`}>
            {icon}
          </div>
          {trend}
        </div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
        <p className="text-2xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">System Reports</h2>
          <p className="text-gray-600 mt-1">Comprehensive overview of all system activities</p>
          {data.meta?.generatedAt && (
            <p className="text-sm text-gray-500 mt-1">
              Generated for {data.meta.generatedFor || "System"} on{" "}
              {new Date(data.meta.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchReports}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          value={data.summary.students}
          icon={<GraduationCap size={24} />}
          color="blue"
        />
        <StatCard
          title="Total Staff"
          value={data.summary.staff}
          icon={<UserCog size={24} />}
          color="purple"
        />
        <StatCard
          title="Total Courses"
          value={data.summary.courses}
          icon={<BookOpen size={24} />}
          color="indigo"
        />
        <StatCard
          title="Total Enrollments"
          value={data.summary.enrollments}
          icon={<ClipboardList size={24} />}
          color="green"
        />
      </div>

      {/* Financial Overview */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign className="text-green-600" size={24} />
          Financial Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600 mb-1">Total Fees Expected</p>
            <p className="text-2xl font-bold text-green-700">
              Ksh {data.financial.totalFeesExpected.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-blue-700">
              Ksh {data.financial.totalFeesPaid.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-gray-600 mb-1">Outstanding Balance</p>
            <p className="text-2xl font-bold text-red-700">
              Ksh {data.financial.totalOutstanding.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-gray-600 mb-1">Payment Rate</p>
            <p className="text-2xl font-bold text-purple-700">{data.financial.paymentRate}%</p>
          </div>
        </div>
      </div>

      {/* Payment Statistics */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard className="text-indigo-600" size={24} />
          Payment Statistics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Total Payments</p>
            <p className="text-2xl font-bold">{data.payments.total}</p>
          </div>
          <div>
            <p className="text-sm text-green-600">Successful</p>
            <p className="text-2xl font-bold text-green-700">{data.payments.successful}</p>
          </div>
          <div>
            <p className="text-sm text-yellow-600">Pending</p>
            <p className="text-2xl font-bold text-yellow-700">{data.payments.pending}</p>
          </div>
          <div>
            <p className="text-sm text-red-600">Failed</p>
            <p className="text-2xl font-bold text-red-700">{data.payments.failed}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Amount Collected</p>
            <p className="text-xl font-bold">Ksh {data.payments.stats.totalAmount.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Average Payment</p>
            <p className="text-xl font-bold">Ksh {Math.round(data.payments.stats.avgAmount).toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Success Rate</p>
            <p className="text-xl font-bold">
              {data.payments.total > 0
                ? ((data.payments.successful / data.payments.total) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Student Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Students by Course</h3>
          <div className="space-y-2">
            {data.students.byCourse.length > 0 ? (
              data.students.byCourse.map((item) => (
                <div key={item._id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium">{item._id || "Not specified"}</span>
                  <span className="text-indigo-600 font-bold">{item.count} students</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Students by Year</h3>
          <div className="space-y-2">
            {data.students.byYear.length > 0 ? (
              data.students.byYear.map((item) => (
                <div key={item._id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium">Year {item._id}</span>
                  <span className="text-blue-600 font-bold">{item.count} students</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Staff & Course Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Staff by Role</h3>
          <div className="space-y-2">
            {data.staff.byRole.length > 0 ? (
              data.staff.byRole.map((item) => (
                <div key={item._id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium">{item._id}</span>
                  <span className="text-purple-600 font-bold">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Courses by HOD</h3>
          <div className="space-y-3">
            {data.courses.byHOD.length > 0 ? (
              data.courses.byHOD.map((item) => (
                <div key={item._id || "Unknown"} className="p-3 bg-gray-50 rounded">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{item._id || "Unknown HOD"}</span>
                    <span className="text-indigo-600 font-bold">{item.count} courses</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {item.courses.slice(0, 3).map((c) => c.name).join(", ")}
                    {item.courses.length > 3 && ` +${item.courses.length - 3} more`}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Outstanding Balances */}
      {data.outstanding.enrollments.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Outstanding Balances ({data.outstanding.count} enrollments)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Reg No</th>
                  <th className="px-4 py-3 text-left">Semester</th>
                  <th className="px-4 py-3 text-right">Total Fee</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.outstanding.enrollments.slice(0, 20).map((en) => (
                  <tr key={en.enrollmentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{en.student?.name || "N/A"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{en.student?.regNo || "N/A"}</td>
                    <td className="px-4 py-3">{en.semester}</td>
                    <td className="px-4 py-3 text-right">Ksh {en.totalFee.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-600">Ksh {en.paidAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      Ksh {en.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.outstanding.enrollments.length > 20 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              Showing 20 of {data.outstanding.enrollments.length} enrollments
            </p>
          )}
        </div>
      )}

      {/* Enrollment Statistics */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Enrollment Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Fees (All Enrollments)</p>
            <p className="text-xl font-bold">Ksh {data.enrollments.stats.totalFees.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Paid (All Enrollments)</p>
            <p className="text-xl font-bold">Ksh {data.enrollments.stats.totalPaid.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Average Fee</p>
            <p className="text-xl font-bold">Ksh {Math.round(data.enrollments.stats.avgFee).toLocaleString()}</p>
          </div>
        </div>
        <div>
          <h4 className="font-medium text-gray-700 mb-2">Enrollments by Semester</h4>
          <div className="space-y-2">
            {data.enrollments.bySemester.length > 0 ? (
              data.enrollments.bySemester.map((item) => (
                <div key={item._id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span>{item._id}</span>
                  <span className="font-bold">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No semester data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;


