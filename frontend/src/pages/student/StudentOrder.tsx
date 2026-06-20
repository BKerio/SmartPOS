import { useEffect, useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, Smartphone, Wallet } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import logo from "@/assets/LOGO.png";

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

const StudentOrder = () => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [category, setCategory] = useState("All");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);

  const studentName = localStorage.getItem("studentName") || "Student";
  const regNo = localStorage.getItem("regNo") || "";

  const fetchBalance = () => {
    API.get("/wallet/balance")
      .then((r) => setBalance(r.data.balance))
      .catch(() => {});
  };

  useEffect(() => {
    API.get("/menu")
      .then((r) => setMenu(r.data))
      .catch(() => toast.error("Could not load menu"))
      .finally(() => setMenuLoading(false));
    fetchBalance();
  }, []);

  const categories = ["All", ...new Set(menu.map((m) => m.category))];
  const filtered = category === "All" ? menu : menu.filter((m) => m.category === category);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const mpesaDue = Math.max(0, total - balance);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.menuItemId === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return toast.warning("Your cart is empty");
    if (!/^(01|07)\d{8}$/.test(phone)) {
      return toast.error("Invalid phone", "Enter a valid 10-digit number (e.g. 0712345678)");
    }

    setLoading(true);
    try {
      const { data } = await API.post("/pos/student-order", {
        phone,
        items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
      });

      const mpesaMsg =
        data.mpesaCharged > 0
          ? `M-Pesa KES ${data.mpesaCharged.toLocaleString()} · Ref ${data.mpesaReference}`
          : "Paid from wallet balance";

      toast.success(
        "Order placed!",
        `Receipt #${data.receipt.id.slice(-8)} · ${mpesaMsg} · Balance KES ${data.newBalance.toLocaleString()}`
      );
      setCart([]);
      setBalance(data.newBalance);
    } catch (e: any) {
      toast.error("Order failed", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src={logo} alt="SmartPOS" className="w-14 h-14 object-contain bg-white rounded-xl p-1" />
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart size={24} /> Cafeteria Menu
            </h2>
            <p className="text-blue-200 text-sm mt-1">
              {studentName} · {regNo}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2">
          <Wallet size={18} className="text-green-300" />
          <div>
            <p className="text-xs text-blue-200">Wallet Balance</p>
            <p className="font-bold text-green-300">KES {balance.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  category === c ? "bg-[#0A1F44] text-white" : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {menuLoading ? (
            <p className="text-center text-gray-500 py-12 animate-pulse">Loading menu...</p>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-500">
              No menu items available yet. Restaurant staff will add meals soon.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md hover:border-[#0A1F44]/30 transition text-left group"
                >
                  <p className="font-semibold text-[#0A1F44] text-sm group-hover:text-[#0A1F44]">
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{item.category}</p>
                  <p className="text-green-600 font-bold mt-2">KES {item.price}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 h-fit lg:sticky lg:top-4 shadow-sm">
          <h3 className="font-bold text-[#0A1F44]">Your Order</h3>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Tap menu items to add them</p>
            ) : (
              cart.map((item) => (
                <div key={item.menuItemId} className="flex items-center justify-between text-sm gap-2">
                  <span className="flex-1 truncate font-medium">{item.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateQty(item.menuItemId, -1)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.menuItemId, 1)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="w-14 text-right font-semibold text-[#0A1F44]">
                    {(item.price * item.quantity).toFixed(0)}
                  </span>
                  <button
                    onClick={() => updateQty(item.menuItemId, -item.quantity)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-bold text-[#0A1F44]">KES {total.toFixed(0)}</span>
            </div>
            {balance > 0 && total > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>From wallet</span>
                <span>- KES {Math.min(balance, total).toFixed(0)}</span>
              </div>
            )}
            {mpesaDue > 0 && total > 0 && (
              <div className="flex justify-between text-xs text-green-700 font-medium">
                <span>M-Pesa due</span>
                <span>KES {mpesaDue.toFixed(0)}</span>
              </div>
            )}
          </div>

          <form onSubmit={placeOrder} className="space-y-3 border-t pt-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1 mb-1">
                <Smartphone size={14} /> M-Pesa Phone
              </label>
              <input
                type="tel"
                placeholder="0712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#0A1F44]/40 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              <Smartphone size={18} />
              {loading ? "Processing..." : `Pay KES ${total.toFixed(0)} with M-Pesa`}
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              Wallet balance is applied first; any shortfall is charged via M-Pesa
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentOrder;
