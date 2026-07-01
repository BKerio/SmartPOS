import { useEffect, useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import API from "@/services/api";
import Loader from "@/components/ui/loader";

type CollectionRow = {
  mpesaNumber: string;
  date: string;
  name: string;
  admNo: string;
  method: string;
  amount: number;
  type: string;
};

const formatKes = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

const CollectionsPage = () => {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get<CollectionRow[]>("/finance/collections")
      .then((r) => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    const topUps = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const usage = rows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
    return { topUps, usage };
  }, [rows]);

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans space-y-6">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Receipt /> Collections Report
          </h2>
          <p className="text-blue-200 text-sm mt-1">Wallet top-ups (+) and student usage (−)</p>
        </div>
        <div className="text-right">
          <p className="text-blue-200 text-xs">Top-ups / Usage</p>
          <p className="text-lg font-bold">
            <span className="text-emerald-300">{formatKes(totals.topUps)}</span>
            <span className="text-blue-200"> · </span>
            <span className="text-rose-300">{formatKes(totals.usage)}</span>
          </p>
        </div>
      </div>

      {loading ? (
        <Loader size="sm" title="Loading collections..." subtitle="Fetching wallet movements" className="py-8" />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">No collections found</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 uppercase text-xs bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4">No</th>
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Adm No</th>
                <th className="text-left py-3 px-4">Mpesa Number</th>
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-left py-3 px-4">Method</th>
                <th className="text-right py-3 px-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.date}-${idx}`} className="border-t border-gray-100">
                  <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                  <td className="py-3 px-4 font-semibold text-[#0A1F44]">{r.name || "-"}</td>
                  <td className="py-3 px-4 text-gray-600">{r.admNo || "-"}</td>
                  <td className="py-3 px-4">{r.mpesaNumber || "-"}</td>
                  <td className="py-3 px-4 text-gray-600">{new Date(r.date).toLocaleString()}</td>
                  <td className="py-3 px-4 text-gray-700">{r.method || "-"}</td>
                  <td
                    className={`py-3 px-4 text-right font-bold ${
                      r.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {r.amount >= 0 ? "+" : "−"} {formatKes(Math.abs(r.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CollectionsPage;

