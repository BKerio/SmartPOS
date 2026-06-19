import { useState, useEffect, FormEvent } from "react";
import Swal from "sweetalert2";
import { Loader2, Smartphone } from "lucide-react";
import API from "@/services/api";

const PayWithMpesa = () => {
  const [phone, setPhone] = useState("");
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
    if (!/^(01|07)\d{8}$/.test(phone)) {
      return Swal.fire({ icon: "error", title: "Invalid phone", text: "Enter a valid 10-digit Kenyan number (e.g. 0712345678)" });
    }
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return Swal.fire({ icon: "error", title: "Invalid amount", text: "Enter a valid amount greater than 0" });
    }

    setLoading(true);
    try {
      const { data } = await API.post("/wallet/topup", { phone, amount: numericAmount });
      setBalance(data.newBalance);
      Swal.fire({
        icon: "success",
        title: "Top-up Successful!",
        html: `<p>KES <strong>${numericAmount}</strong> added to your wallet.</p>
               <p>New balance: <strong>KES ${data.newBalance.toLocaleString()}</strong></p>
               <p class="text-xs text-gray-500 mt-2">Ref: ${data.transaction.reference}</p>`,
      });
      setAmount("");
    } catch (err: any) {
      Swal.fire({ icon: "error", title: "Top-up Failed", text: err.response?.data?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans bg-[#E8F4FD]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-[#0A1F44]">Top Up Wallet via M-Pesa</h1>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">M-Pesa Phone Number</label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="tel" placeholder="0712345678" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-green-400 outline-none" disabled={loading} required />
            </div>
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

        <p className="text-xs text-gray-400 text-center mt-4">Simulated M-Pesa integration for demo purposes</p>
      </div>
    </div>
  );
};

export default PayWithMpesa;
