import { useEffect, useState } from "react";
import { Users, GraduationCap, UtensilsCrossed, DollarSign, AlertCircle } from "lucide-react";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#0A1F44", "#1E3A8A", "#3B82F6", "#10B981"];

const DashboardCard = ({
  title,
  value,
  icon,
  color = "#0A1F44",
  prefix = "",
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  prefix?: string;
}) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;
    const timer = setInterval(() => {
      start += Math.ceil(end / 60);
      if (start >= end) { start = end; clearInterval(timer); }
      setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm text-gray-500 font-medium">{title}</h3>
          <p className="text-3xl font-bold text-[#0A1F44] mt-2">{prefix}{count.toLocaleString()}</p>
        </div>
        <div className="p-3.5 rounded-xl" style={{ backgroundColor: `${color}15`, color }}>{icon}</div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [studentCount, setStudentCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [menuCount, setMenuCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCounts = async () => {
      setLoadError(null);
      try {
        const [studentsRes, usersRes, menuRes] = await Promise.all([
          API.get("/students"),
          API.get("/users"),
          API.get("/menu"),
        ]);
        setStudentCount(studentsRes.data?.length || 0);
        setStaffCount(usersRes.data?.length || 0);
        setMenuCount(menuRes.data?.length || 0);
        try {
          const finRes = await API.get("/finance/summary");
          setRevenue(finRes.data?.revenue || 0);
        } catch { /* optional */ }
      } catch (error: unknown) {
        const msg =
          error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ERR_NETWORK"
            ? "Cannot reach the backend. Start it with: cd backend && npm run dev"
            : "Failed to load dashboard data";
        setLoadError(msg);
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCounts();
  }, []);

  const data = [
    { name: "Students", value: studentCount },
    { name: "Staff Users", value: staffCount },
    { name: "Menu Items", value: menuCount },
  ];
  const chartTotal = data.reduce((sum, item) => sum + item.value, 0);
  const showChart = !loading && !loadError && chartTotal > 0;

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="bg-[#0A1F44] text-white rounded-3xl shadow-xl p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-sm text-blue-200 mt-2 font-medium">School feeding program overview</p>
        </div>
        <div className="mt-6 sm:mt-0 w-14 h-14 rounded-full bg-white text-[#0A1F44] flex items-center justify-center font-bold text-xl">AD</div>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <Loader size="sm" title="Loading dashboard..." subtitle="Fetching platform statistics" className="py-8" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard title="Students" value={studentCount} icon={<GraduationCap size={24} />} color="#0A1F44" />
          <DashboardCard title="Staff Users" value={staffCount} icon={<Users size={24} />} color="#1E3A8A" />
          <DashboardCard title="Menu Items" value={menuCount} icon={<UtensilsCrossed size={24} />} color="#3B82F6" />
          <DashboardCard title="Cafeteria Revenue" value={revenue} icon={<DollarSign size={24} />} color="#10B981" prefix="KES " />
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <h3 className="text-xl font-bold text-[#0A1F44] mb-6">Platform Statistics</h3>
        {showChart ? (
          <div className="w-full min-w-0" style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height={350} minWidth={0}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : loading ? (
          <Loader size="sm" title="Loading chart..." subtitle="Preparing platform statistics" className="py-8" />
        ) : (
          <p className="text-center text-gray-400 py-16 text-sm">
            {loadError ? "Chart unavailable while offline" : "No data to chart yet"}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-gray-500">© {new Date().getFullYear()} SmartPOS School Feeding System</p>
    </div>
  );
};

export default Dashboard;
