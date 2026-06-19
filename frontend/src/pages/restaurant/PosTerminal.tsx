import { useEffect, useState } from "react";
import { ShoppingCart, Search, Trash2, Plus, Minus } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";

interface MenuItem { id: string; name: string; price: number; category: string; isAvailable: boolean; }
interface CartItem { menuItemId: string; name: string; price: number; quantity: number; }
interface StudentInfo { name: string; regNo: string; walletBalance: number; }

const PosTerminal = () => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [regNo, setRegNo] = useState("");
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("All");

  useEffect(() => {
    API.get("/menu").then((r) => setMenu(r.data)).catch(() => {});
  }, []);

  const categories = ["All", ...new Set(menu.map((m) => m.category))];
  const filtered = category === "All" ? menu : menu.filter((m) => m.category === category);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const lookupStudent = async () => {
    if (!regNo.trim()) return;
    try {
      const { data } = await API.get(`/students/lookup/${regNo.trim()}`);
      setStudent(data);
    } catch {
      setStudent(null);
      toast.error("Student not found", `No student with reg no: ${regNo}`);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => c.menuItemId === id ? { ...c, quantity: c.quantity + delta } : c)
        .filter((c) => c.quantity > 0)
    );
  };

  const processSale = async () => {
    if (!student) return toast.warning("Look up a student first");
    if (cart.length === 0) return toast.warning("Cart is empty");

    setLoading(true);
    try {
      const { data } = await API.post("/pos/sale", {
        studentRegNo: student.regNo,
        items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
      });
      toast.success(
        "Sale complete",
        `Receipt #${data.receipt.id.slice(-8)} · KES ${total} · Balance: KES ${data.newBalance}`
      );
      setCart([]);
      setStudent({ ...student, walletBalance: data.newBalance });
    } catch (e: any) {
      toast.error("Sale failed", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6 mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart /> POS Terminal</h2>
        <p className="text-blue-200 text-sm mt-1">Process cafeteria sales and deduct from student wallets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${category === c ? "bg-[#0A1F44] text-white" : "bg-white text-gray-600 border"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md hover:border-indigo-200 transition text-left"
              >
                <p className="font-semibold text-[#0A1F44] text-sm">{item.name}</p>
                <p className="text-xs text-gray-400 mt-1">{item.category}</p>
                <p className="text-green-600 font-bold mt-2">KES {item.price}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 h-fit sticky top-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Student Reg No</label>
            <div className="flex gap-2 mt-1">
              <input
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupStudent()}
                placeholder="e.g. STU001"
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              />
              <button onClick={lookupStudent} className="px-3 py-2 bg-[#0A1F44] text-white rounded-lg">
                <Search size={18} />
              </button>
            </div>
            {student && (
              <div className="mt-2 p-3 bg-green-50 rounded-lg text-sm">
                <p className="font-semibold text-[#0A1F44]">{student.name}</p>
                <p className="text-gray-500">Balance: <span className="text-green-600 font-bold">KES {student.walletBalance}</span></p>
              </div>
            )}
          </div>

          <div className="border-t pt-3 space-y-2 max-h-48 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Cart is empty</p>
            ) : cart.map((item) => (
              <div key={item.menuItemId} className="flex items-center justify-between text-sm">
                <span className="flex-1 truncate">{item.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.menuItemId, -1)} className="p-1 hover:bg-gray-100 rounded"><Minus size={14} /></button>
                  <span className="w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.menuItemId, 1)} className="p-1 hover:bg-gray-100 rounded"><Plus size={14} /></button>
                </div>
                <span className="w-16 text-right font-medium">{(item.price * item.quantity).toFixed(0)}</span>
                <button onClick={() => updateQty(item.menuItemId, -item.quantity)} className="p-1 text-red-400 hover:text-red-600 ml-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 flex justify-between items-center">
            <span className="font-bold text-lg">Total</span>
            <span className="font-bold text-xl text-[#0A1F44]">KES {total.toFixed(0)}</span>
          </div>

          <button
            onClick={processSale}
            disabled={loading || cart.length === 0 || !student}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition"
          >
            {loading ? "Processing..." : "Complete Sale"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PosTerminal;
