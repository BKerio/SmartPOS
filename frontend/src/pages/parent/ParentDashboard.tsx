import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, User, PlusCircle } from "lucide-react";
import API from "@/services/api";
import Swal from "sweetalert2";

interface Student {
  id: string;
  name: string;
  regNo: string;
  course: string;
  walletBalance: number;
  transactions: { id: string; amount: number; type: string; description?: string; createdAt: string }[];
}

const ParentDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const name = localStorage.getItem("userName") || "Parent";

  const fetchStudents = async () => {
    try {
      const { data } = await API.get("/parents/students");
      setStudents(data);
    } catch (e: any) {
      Swal.fire({ icon: "error", title: "Failed to load students", text: e.response?.data?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  const handleTopUp = async (student: Student) => {
    const { value: amount } = await Swal.fire({
      title: `Top up ${student.name}`,
      input: "number",
      inputLabel: "Amount (KES)",
      inputPlaceholder: "e.g. 500",
      showCancelButton: true,
      confirmButtonColor: "#0A1F44",
      inputValidator: (v) => (!v || Number(v) <= 0 ? "Enter a valid amount" : null),
    });
    if (!amount) return;

    const { value: reference } = await Swal.fire({
      title: "Payment reference (optional)",
      input: "text",
      inputPlaceholder: "M-Pesa code",
      showCancelButton: true,
      confirmButtonColor: "#0A1F44",
    });

    try {
      const { data } = await API.post("/wallet/deposit", {
        studentId: student.id,
        amount: Number(amount),
        reference: reference || undefined,
        description: "Parent wallet top-up",
      });
      Swal.fire({ icon: "success", title: "Top-up successful", text: `New balance: KES ${data.newBalance.toLocaleString()}` });
      fetchStudents();
    } catch (e: any) {
      Swal.fire({ icon: "error", title: "Top-up failed", text: e.response?.data?.message });
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="bg-[#0A1F44] text-white rounded-3xl shadow-xl p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Welcome, {name}</h2>
          <p className="text-sm text-blue-200 mt-2">Monitor and manage your children's feeding accounts</p>
        </div>
        <div className="mt-4 sm:mt-0 w-14 h-14 rounded-full bg-white text-[#0A1F44] flex items-center justify-center font-bold text-xl">
          {name.charAt(0)}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 animate-pulse">Loading linked students...</p>
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
                  <p className="text-sm text-gray-500">{s.regNo} · {s.course}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Wallet Balance</p>
                  <p className="text-2xl font-bold text-green-600">KES {s.walletBalance.toLocaleString()}</p>
                </div>
              </div>

              <button
                onClick={() => handleTopUp(s)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition"
              >
                <PlusCircle size={18} /> Top Up Wallet
              </button>

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
    </div>
  );
};

export default ParentDashboard;
