import { useEffect, useState } from "react";
import { Users, Building2, ShoppingBag } from "lucide-react";
import API from "@/services/api";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#0A1F44", "#1E3A8A", "#3B82F6"]; // Dark Blue, Deep Blue, Light Blue

// Inline DashboardCard Component
const DashboardCard = ({
  title,
  value,
  icon,
  color = "#0A1F44",
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}) => {
  const [count, setCount] = useState(0);

  // Smooth count-up animation
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;

    const duration = 1000; // ms
    const increment = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        start = end;
        clearInterval(timer);
      }
      setCount(start);
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm text-gray-500 font-medium group-hover:text-gray-700 transition-colors">{title}</h3>
          <p className="text-3xl font-bold text-[#0A1F44] mt-2 tracking-tight">{count.toLocaleString()}</p>
        </div>
        <div
          className="p-3.5 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{
            backgroundColor: `${color}15`,
            color: color,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const [userCount, setUserCount] = useState(0);
  const [propertyCount, setPropertyCount] = useState(0);
  const [marketplaceCount, setMarketplaceCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [usersRes, propertiesRes, marketplaceRes] = await Promise.all([
          API.get("/users"),
          API.get("/properties"),
          API.get("/marketplace"),
        ]);
        setUserCount(usersRes.data?.length || 0);
        setPropertyCount(propertiesRes.data?.length || 0);
        setMarketplaceCount(marketplaceRes.data?.length || 0);
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCounts();
  }, []);

  const data = [
    { name: "Total Users", value: userCount },
    { name: "Properties", value: propertyCount },
    { name: "Marketplace Items", value: marketplaceCount },
  ];

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#E8F4FD] min-h-screen font-sans">
      {/* Header */}
      <div className="bg-[#0A1F44] text-white rounded-3xl shadow-xl shadow-[#0A1F44]/10 p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between relative overflow-hidden">
        {/* Decorative background circle */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-sm text-blue-200 mt-2 font-medium">Platform statistics & overview</p>
        </div>
        <div className="mt-6 sm:mt-0 relative z-10">
          <div className="w-14 h-14 rounded-full bg-white text-[#0A1F44] flex items-center justify-center font-bold text-xl shadow-inner border-4 border-white/20">
            AD
          </div>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-gray-500 text-center animate-pulse">Loading dashboard data...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard
            title="Total Users"
            value={userCount}
            icon={<Users size={24} />}
            color="#0A1F44"
          />
          <DashboardCard
            title="Total Properties"
            value={propertyCount}
            icon={<Building2 size={24} />}
            color="#1E3A8A"
          />
          <DashboardCard
            title="Marketplace Items"
            value={marketplaceCount}
            icon={<ShoppingBag size={24} />}
            color="#3B82F6"
          />
        </div>
      )}

      {/* Pie Chart Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <h3 className="text-xl font-bold text-[#0A1F44] mb-6">Statistics Breakdown</h3>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-500 mt-10">
        © {new Date().getFullYear()} Housing Platform. All rights reserved.
      </p>
    </div>
  );
};

export default Dashboard;
