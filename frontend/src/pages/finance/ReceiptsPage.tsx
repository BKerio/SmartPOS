import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import API from "@/services/api";

interface ReceiptItem {
  id: string; totalAmount: number; status: string; createdAt: string;
  student: { name: string; regNo: string };
  items: { quantity: number; price: number; menuItem: { name: string } }[];
}

const ReceiptsPage = () => {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    API.get("/pos/receipts")
      .then((r) => setReceipts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSales = receipts.reduce((s, r) => s + r.totalAmount, 0);

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans space-y-6">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Receipt /> POS Receipts</h2>
          <p className="text-blue-200 text-sm mt-1">Cafeteria sales and transaction history</p>
        </div>
        <div className="text-right">
          <p className="text-blue-200 text-xs">Total Sales</p>
          <p className="text-2xl font-bold">KES {totalSales.toLocaleString()}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 animate-pulse">Loading receipts...</p>
      ) : receipts.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">No receipts yet</div>
      ) : (
        <div className="space-y-3">
          {receipts.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition text-left"
              >
                <div>
                  <p className="font-semibold text-[#0A1F44]">{r.student.name} <span className="text-gray-400 font-normal">({r.student.regNo})</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(r.createdAt).toLocaleString()} · #{r.id.slice(-8)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">KES {r.totalAmount}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{r.status}</span>
                </div>
              </button>
              {expanded === r.id && (
                <div className="px-5 pb-4 border-t border-gray-50">
                  {r.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm py-1.5">
                      <span>{item.menuItem.name} × {item.quantity}</span>
                      <span className="font-medium">KES {(item.price * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReceiptsPage;
