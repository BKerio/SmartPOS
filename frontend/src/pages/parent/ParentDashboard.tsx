import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, User, Plus, X } from "lucide-react";
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

const ParentDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [topUpStudent, setTopUpStudent] = useState<Student | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const name = localStorage.getItem("userName") || "Parent";

  const fetchStudents = async () => {
    try {
      const { data } = await API.get("/parents/students");
      setStudents(data);
    } catch (e: any) {
      toast.error("Failed to load students", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  const openTopUp = (student: Student) => {
    setTopUpStudent(student);
    setAmount("");
  };

  const submitTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpStudent) return;
    const topUpAmount = Number(amount);
    if (!topUpAmount || topUpAmount < 1) return toast.error("Enter a valid amount");

    setSubmitting(true);
    try {
      const { data } = await API.post("/wallet/deposit", {
        studentId: topUpStudent.id,
        amount: topUpAmount,
        description: `Parent top-up for ${topUpStudent.regNo}`,
      });
      toast.success(
        "Top-up successful!",
        `KES ${topUpAmount.toLocaleString()} added · Balance: KES ${data.newBalance.toLocaleString()}`,
      );
      setTopUpStudent(null);
      fetchStudents();
    } catch (e: any) {
      toast.error("Top-up failed", e.response?.data?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="bg-[#0A1F44] text-white rounded-3xl shadow-xl p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Welcome, {name}</h2>
          <p className="text-sm text-blue-200 mt-2">Top up your children's feeding wallets</p>
        </div>
        <div className="mt-4 sm:mt-0 w-14 h-14 rounded-full bg-white text-[#0A1F44] flex items-center justify-center font-bold text-xl">
          {name.charAt(0)}
        </div>
      </div>

      {loading ? (
        <Loader size="sm" title="Loading linked students..." subtitle="Fetching your children's accounts" className="py-8" />
      ) : students.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-gray-600">No students linked to your account yet.</p>
          <p className="text-sm text-gray-400 mt-2">Contact the school admin to link your children.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {students.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#0A1F44]">{s.name}</h3>
                  <p className="text-sm text-gray-500">{s.regNo}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Wallet Balance</p>
                  <p className="text-2xl font-bold text-green-600">KES {s.walletBalance.toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => openTopUp(s)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition justify-center"
                >
                  <Plus size={18} /> Top Up Wallet
                </button>
                
              </div>

              {s.transactions?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Transactions</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {s.transactions.map((tx) => (
                      <div key={tx.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-600 truncate mr-2">{tx.description || tx.type}</span>
                        <span className={tx.amount >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                          {tx.amount >= 0 ? "+" : ""}{tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        <Link to="/user-profile" className="flex items-center gap-2 text-sm text-[#0A1F44] font-medium hover:underline">
          <User size={16} /> My Profile
        </Link>
        <Link to="/settings" className="flex items-center gap-2 text-sm text-[#0A1F44] font-medium hover:underline">
          <Wallet size={16} /> Settings
        </Link>
      </div>

      {topUpStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#0A1F44]">Wallet top-up</h3>
              <button onClick={() => !submitting && setTopUpStudent(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Add funds for <span className="font-semibold text-[#0A1F44]">{topUpStudent.name}</span> ({topUpStudent.regNo})
            </p>
            <form onSubmit={submitTopUp} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Amount (KES)</label>
                <input
                  type="number"
                  placeholder="500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  min="1"
                  disabled={submitting}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-400 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-green-600 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader size="xs" showText={false} className="mr-2" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Wallet size={18} />
                    Add to Wallet
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;
