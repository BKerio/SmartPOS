import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, User, GraduationCap, RefreshCw } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

interface Student {
  id: string;
  name: string;
  regNo: string;
  walletBalance: number;
  transactions: { id: string; amount: number; type: string; description?: string; createdAt: string }[];
}

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ParentDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const name = localStorage.getItem("userName") || "Parent";
  const firstName = name.split(" ")[0];

  const fetchStudents = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await API.get("/parents/students");
      setStudents(data);
    } catch (e: any) {
      toast.error("Failed to load students", e.response?.data?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  return (
    <div className="min-h-screen bg-[#efefed] font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .db { font-family: 'Inter', sans-serif; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card-in { animation: fadeUp 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .card-in:nth-child(2) { animation-delay: 0.07s; }

        .s-card {
          background: #fff;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.05);
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        .s-card:hover {
          box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 10px 32px rgba(0,0,0,0.09);
          transform: translateY(-2px);
        }

        .action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f5f5f3;
          padding: 16px 24px;
          text-decoration: none;
          transition: background 0.15s ease;
          cursor: pointer;
        }
        .action-row:hover { background: #efefed; }
        .action-row:active { background: #e8e8e5; }

        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          color: #888;
          background: #fff;
          border: 1px solid #e5e5e5;
          padding: 6px 13px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .refresh-btn:hover { color: #333; border-color: #ccc; }
      `}</style>

      <div className="db max-w-3xl mx-auto p-5 md:p-10 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">Parent Portal</p>
            <h1 className="text-2xl font-extrabold text-[#111] tracking-tight">Hello, {firstName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchStudents(true)}
              disabled={refreshing}
              className="refresh-btn"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#111] text-white flex items-center justify-center font-bold text-sm">
              {name.charAt(0)}
            </div>
          </div>
        </div>

        {/* ── Section label ── */}
        <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest -mb-4">
          Linked Students · {students.length}
        </p>

        {/* ── Cards ── */}
        {loading ? (
          <Loader size="sm" title="Loading students..." subtitle="Fetching your children's accounts" className="py-12" />
        ) : students.length === 0 ? (
          <div className="s-card p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-6 h-6 text-stone-400" />
            </div>
            <p className="font-semibold text-stone-700">No students linked yet</p>
            <p className="text-sm text-stone-400 mt-1">Contact the school admin to link your children.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {students.map((s, i) => {
              const funded = s.walletBalance > 0;
              return (
                <div key={s.id} className="s-card card-in" style={{ animationDelay: `${i * 0.07}s` }}>

                  {/* ── Card body ── */}
                  <div className="p-6 space-y-5">

                    {/* Title + subtitle */}
                    <div>
                      <h2 className="text-[17px] font-bold text-[#111] leading-tight">{s.name}</h2>
                      <p className="text-sm text-stone-400 mt-1 font-medium leading-snug">
                        School feeding wallet for student <span className="text-stone-500 font-semibold">{s.regNo}</span>.
                      </p>
                    </div>

                    {/* Info rows with orange arrows */}
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3">
                        <ArrowRight />
                        <span className="text-sm text-stone-600 font-medium">
                          Balance&nbsp;
                          <span className={`font-bold ${funded ? "text-[#111]" : "text-stone-400"}`}>
                            KES {s.walletBalance.toLocaleString()}
                          </span>
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <ArrowRight />
                        <span className="text-sm text-stone-600 font-medium">School Feeding Account</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <ArrowRight />
                        <span className="text-sm text-stone-600 font-medium">
                          Status&nbsp;
                          <span className="font-bold text-[#111]">{funded ? "Funded" : "Unfunded"}</span>
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <ArrowRight />
                        <span className="text-sm text-stone-600 font-medium">Pay via M-Pesa STK Push</span>
                      </li>
                    </ul>
                  </div>

                  {/* Divider */}
                  <div className="mx-6 h-px bg-stone-100" />

                  {/* ── Action row ── */}
                  <Link
                    to="/pay-mpesa"
                    state={{ studentId: s.id, studentName: s.name, regNo: s.regNo, currentBalance: s.walletBalance }}
                    className="action-row"
                  >
                    <span className="text-[15px] font-bold text-[#111]">Lipa na M-Pesa</span>
                    <ArrowRight />
                  </Link>

                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex gap-5 pb-4">
          <Link to="/user-profile" className="flex items-center gap-2 text-sm text-stone-400 font-semibold hover:text-stone-700 transition-colors">
            <User size={14} /> My Profile
          </Link>
          <Link to="/settings" className="flex items-center gap-2 text-sm text-stone-400 font-semibold hover:text-stone-700 transition-colors">
            <Wallet size={14} /> Settings
          </Link>
        </div>

      </div>
    </div>
  );
};

export default ParentDashboard;
