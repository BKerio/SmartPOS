import { useState, useEffect, FormEvent } from "react";
import { toast } from "@/services/toast";
import { Loader2, Wallet } from "lucide-react";
import API from "@/services/api";

const TopUpWallet = () => {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const regNo = localStorage.getItem("regNo") || "";

  useEffect(() => {
    API.get("/wallet/balance").then((r) => setBalance(r.data.balance)).catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return toast.error("Invalid amount", "Enter a valid amount greater than 0");
    }

    setLoading(true);
    try {
      const { data } = await API.post("/wallet/topup", { amount: numericAmount });
      setBalance(data.newBalance);
      toast.success(
        "Top-up successful!",
        `KES ${numericAmount} added. New balance: KES ${data.newBalance.toLocaleString()}`
      );
      setAmount("");
    } catch (err: any) {
      toast.error("Top-up failed", err.response?.data?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans bg-[#E8F4FD]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-[#0A1F44]">Top Up Wallet</h1>
          <p className="mt-2 text-gray-500 text-sm">Add funds to your school feeding wallet</p>
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-xs text-gray-500">Current Balance</p>
            <p className="text-2xl font-bold text-green-600">KES {balance.toLocaleString()}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
            <input value={regNo} readOnly className="w-full py-2.5 px-3 rounded-lg bg-gray-100 border text-gray-600 cursor-not-allowed" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
            <input type="number" placeholder="e.g. 500" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full py-2.5 px-3 rounded-lg border focus:ring-2 focus:ring-green-400 outline-none" disabled={loading} required min="1" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center py-3 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50 transition">
            {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</> : `Top Up KES ${Number(amount) || 0}`}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-4">Simulated top-up for demo purposes</p>
      </div>
    </div>
  );
};

export default TopUpWallet;
