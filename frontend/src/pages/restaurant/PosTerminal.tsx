import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart,
  Search,
  Trash2,
  Plus,
  Minus,
  Fingerprint,
  KeyRound,
  X,
  Loader2,
  TrendingUp,
  Receipt,
  Package,
  BarChart3,
  Calendar,
} from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { captureFingerprint, checkScannerHealth, prepareScanner } from "@/services/fingerprintScanner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface MenuItem { id: string; name: string; price: number; category: string; isAvailable: boolean; imageUrl?: string; }
interface CartItem { menuItemId: string; name: string; price: number; quantity: number; }
interface StudentInfo {
  name: string;
  regNo: string;
  walletBalance: number;
  pinEnabled?: boolean;
  hasFingerprint?: boolean;
  walletFrozen?: boolean;
}

interface SalesSummary {
  date: string;
  totalSales: number;
  transactionCount: number;
  itemsSold: number;
  hourlyBreakdown: { hour: string; amount: number; count: number }[];
}

interface ReceiptItem {
  id: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  student: { name: string; regNo: string };
  items: { quantity: number; price: number; menuItem: { name: string } }[];
}

type PosView = "checkout" | "sales";

const todayDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const PosTerminal = () => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [regNo, setRegNo] = useState("");
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [searchResults, setSearchResults] = useState<StudentInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [pin, setPin] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  const [view, setView] = useState<PosView>("checkout");
  const [salesDate, setSalesDate] = useState(todayDateString);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesReceipts, setSalesReceipts] = useState<ReceiptItem[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);

  const fetchSalesData = useCallback(async (date: string) => {
    setSalesLoading(true);
    try {
      const [summaryRes, receiptsRes] = await Promise.all([
        API.get<SalesSummary>("/pos/sales/summary", { params: { date } }),
        API.get<ReceiptItem[]>("/pos/receipts", { params: { date } }),
      ]);
      setSalesSummary(summaryRes.data);
      setSalesReceipts(receiptsRes.data);
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message ?? "Failed to load sales data");
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    API.get("/menu").then((r) => setMenu(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (view === "sales") {
      fetchSalesData(salesDate);
    }
  }, [view, salesDate, fetchSalesData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const query = regNo.trim();
    if (student || query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setHighlightIndex(-1);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await API.get<StudentInfo[]>(`/students/search`, { params: { q: query } });
        setSearchResults(data);
        setShowResults(true);
        setHighlightIndex(data.length > 0 ? 0 : -1);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [regNo, student]);

  const categories = ["All", ...new Set(menu.map((m) => m.category))];
  
  const filtered = useMemo(() => {
    return menu.filter((m) => {
      const matchesCategory = category === "All" || m.category === category;
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            m.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, category, searchQuery]);

  const hourlyChartData = useMemo(() => {
    if (!salesSummary) return [];
    return salesSummary.hourlyBreakdown.filter((row) => row.amount > 0);
  }, [salesSummary]);

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const authOptions = useMemo(() => {
    return {
      pin: Boolean(student?.pinEnabled),
      fingerprint: Boolean(student?.hasFingerprint),
    };
  }, [student]);

  const selectStudent = (picked: StudentInfo) => {
    setStudent(picked);
    setRegNo(picked.regNo);
    setSearchResults([]);
    setShowResults(false);
    setHighlightIndex(-1);
    setPin("");
    setShowAuth(false);
  };

  const clearStudent = () => {
    setStudent(null);
    setRegNo("");
    setSearchResults([]);
    setShowResults(false);
    setHighlightIndex(-1);
  };

  const lookupStudent = async () => {
    const query = regNo.trim();
    if (!query) {
      return toast.warning("Enter a search term", "Type a name, reg no, or phone number");
    }

    if (highlightIndex >= 0 && searchResults[highlightIndex]) {
      selectStudent(searchResults[highlightIndex]);
      return;
    }

    if (searchResults.length === 1) {
      selectStudent(searchResults[0]);
      return;
    }

    if (query.length < 2) {
      return toast.warning("Keep typing", "Enter at least 2 characters to search");
    }

    try {
      const { data } = await API.get(`/students/lookup/${encodeURIComponent(query)}`);
      selectStudent(data);
    } catch {
      setStudent(null);
      toast.error("Student not found", `No student matches "${query}"`);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!showResults || searchResults.length === 0) return;
      setHighlightIndex((prev) => (prev + 1) % searchResults.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!showResults || searchResults.length === 0) return;
      setHighlightIndex((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      return;
    }
    if (e.key === "Escape") {
      setShowResults(false);
      setHighlightIndex(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      lookupStudent();
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

  const beginCheckout = async () => {
    if (!student) return toast.warning("Look up a student first");
    if (cart.length === 0) return toast.warning("Cart is empty");
    if (student.walletFrozen) return toast.error("Wallet frozen", "This student wallet is frozen");

    setShowAuth(true);
    try {
      const h = await checkScannerHealth();
      setScannerReady(h.deviceConnected);
      if (h.deviceConnected) await prepareScanner();
    } catch {
      setScannerReady(false);
    }
  };

  const processSale = async (auth: { pin?: string; fingerprintTemplate?: string }) => {
    if (!student) return;

    setLoading(true);
    try {
      const { data } = await API.post("/pos/sale", {
        studentRegNo: student.regNo,
        items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
        auth,
      });
      toast.success(
        "Sale complete",
        `Receipt #${data.receipt.id.slice(-8)} · KES ${total} · Balance: KES ${data.newBalance}`
      );
      setCart([]);
      setStudent({ ...student, walletBalance: data.newBalance });
      if (view === "sales" || salesDate === todayDateString()) {
        fetchSalesData(salesDate);
      }
    } catch (e: any) {
      toast.error("Sale failed", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  const payWithPin = async () => {
    if (!student) return;
    if (!authOptions.pin) return toast.error("PIN not set", "Parent must set a wallet PIN first");
    if (!/^\d{4}$/.test(pin)) return toast.error("Invalid PIN", "Enter a 4-digit PIN");
    setAuthLoading(true);
    try {
      await processSale({ pin });
      setShowAuth(false);
      setPin("");
    } finally {
      setAuthLoading(false);
    }
  };

  const payWithFingerprint = async () => {
    if (!student) return;
    if (!authOptions.fingerprint) return toast.error("Fingerprint not enrolled", "Enroll fingerprint first");
    if (scannerReady === false) return toast.error("Scanner offline", "Start the fingerprint scanner service");
    setAuthLoading(true);
    try {
      await prepareScanner();
      const tpl = await captureFingerprint();
      await processSale({ fingerprintTemplate: tpl });
      setShowAuth(false);
      setPin("");
    } catch (e: any) {
      toast.error("Fingerprint failed", e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-[#E8F4FD] min-h-screen font-sans">
      {/* Header Panel */}
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6 mb-6 shadow-sm border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2"><ShoppingCart className="text-indigo-400" /> POS Terminal</h2>
          <p className="text-blue-200 text-sm mt-1">
            {view === "checkout"
              ? "Deduct meals and snacks from registered student wallets"
              : "Track cafeteria sales and receipts by day"}
          </p>
        </div>
        <div className="flex gap-2 bg-white/10 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setView("checkout")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              view === "checkout" ? "bg-white text-[#0A1F44]" : "text-blue-100 hover:bg-white/10"
            }`}
          >
            Checkout
          </button>
          <button
            type="button"
            onClick={() => setView("sales")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              view === "sales" ? "bg-white text-[#0A1F44]" : "text-blue-100 hover:bg-white/10"
            }`}
          >
            Sales Tracker
          </button>
        </div>
      </div>

      {view === "sales" ? (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Filter by day</p>
              <p className="text-sm font-semibold text-[#0A1F44] mt-1">View sales for a specific date</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={salesDate}
                  max={todayDateString()}
                  onChange={(e) => setSalesDate(e.target.value)}
                  className="pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
                />
              </div>
              <button
                type="button"
                onClick={() => setSalesDate(todayDateString())}
                className="px-3 py-2.5 text-xs font-bold text-[#0A1F44] border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              >
                Today
              </button>
            </div>
          </div>

          {salesLoading ? (
            <Loader size="sm" title="Loading sales..." subtitle="Fetching daily summary and receipts" className="py-8" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Total Sales</p>
                      <p className="text-3xl font-bold text-green-600 mt-1">
                        KES {(salesSummary?.totalSales ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-xl text-green-600">
                      <TrendingUp size={24} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Completed POS transactions</p>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Transactions</p>
                      <p className="text-3xl font-bold text-[#0A1F44] mt-1">
                        {salesSummary?.transactionCount ?? 0}
                      </p>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                      <Receipt size={24} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Receipts for selected day</p>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Items Sold</p>
                      <p className="text-3xl font-bold text-indigo-600 mt-1">
                        {salesSummary?.itemsSold ?? 0}
                      </p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                      <Package size={24} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Total menu items checked out</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="font-bold text-[#0A1F44] mb-4 flex items-center gap-2">
                  <BarChart3 size={18} /> Hourly Sales
                </h3>
                {hourlyChartData.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">No sales recorded for this day.</p>
                ) : (
                  <div className="w-full min-w-0" style={{ height: 256 }}>
                    <ResponsiveContainer width="100%" height={256} minWidth={0}>
                      <BarChart data={hourlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip formatter={(v: number) => `KES ${v.toLocaleString()}`} />
                        <Bar dataKey="amount" fill="#0A1F44" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-[#0A1F44] flex items-center gap-2">
                    <Receipt size={18} /> Day Receipts
                  </h3>
                  <p className="text-xs text-gray-400">
                    {new Date(`${salesDate}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                {salesReceipts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No receipts for this day</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {salesReceipts.map((r) => (
                      <div key={r.id}>
                        <button
                          type="button"
                          onClick={() => setExpandedReceipt(expandedReceipt === r.id ? null : r.id)}
                          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition text-left"
                        >
                          <div>
                            <p className="font-semibold text-[#0A1F44]">
                              {r.student.name}{" "}
                              <span className="text-gray-400 font-normal">({r.student.regNo})</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(r.createdAt).toLocaleString()} · #{r.id.slice(-8)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">KES {r.totalAmount.toLocaleString()}</p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                r.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {r.status}
                            </span>
                          </div>
                        </button>
                        {expandedReceipt === r.id && (
                          <div className="px-5 pb-4 border-t border-gray-50 bg-slate-50/50">
                            {r.items.map((item, i) => (
                              <div key={i} className="flex justify-between text-sm py-1.5">
                                <span>
                                  {item.menuItem.name} × {item.quantity}
                                </span>
                                <span className="font-medium">
                                  KES {(item.price * item.quantity).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Categories and Menu Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    category === c 
                      ? "bg-[#0A1F44] text-white shadow-sm" 
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-gray-400 shadow-sm">
              <ShoppingCart size={40} className="mx-auto mb-2 text-gray-300" strokeWidth={1.5} />
              <p className="text-sm font-semibold">No items match your search filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((item) => {
                const available = item.isAvailable !== false;
                return (
                  <button
                    key={item.id}
                    onClick={() => available && addToCart(item)}
                    disabled={!available}
                    className={`bg-white rounded-2xl border transition-all duration-200 text-left relative flex flex-col overflow-hidden select-none ${
                      available 
                        ? "border-slate-100 hover:shadow-md hover:border-indigo-200 active:scale-[0.98]" 
                        : "opacity-60 cursor-not-allowed border-gray-200 bg-gray-50/50"
                    }`}
                  >
                    {/* Food image / placeholder */}
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        draggable={false}
                        className="w-full h-24 object-cover"
                      />
                    ) : (
                      <div className="w-full h-24 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <span className="text-3xl font-black text-slate-300 select-none">
                          {item.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Out of stock badge */}
                    {!available && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[8px] font-black uppercase bg-red-600 text-white rounded shadow-sm">
                        Out
                      </span>
                    )}
                    {/* Card body */}
                    <div className="p-3 flex flex-col gap-1">
                      <p className="font-extrabold text-[#0A1F44] text-xs leading-tight line-clamp-2">{item.name}</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-wider font-bold">{item.category}</p>
                      <p className="text-emerald-600 font-black text-sm mt-1">KES {item.price.toLocaleString()}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Checkout Panel */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm h-fit sticky top-6">
          {/* Student Lookup Section */}
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Student Account</label>
            {!student ? (
              <div className="relative" ref={searchRef}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Search size={14} />
                    </span>
                    <input
                      value={regNo}
                      onChange={(e) => {
                        setRegNo(e.target.value);
                        setShowResults(true);
                      }}
                      onFocus={() => searchResults.length > 0 && setShowResults(true)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Name, reg no, or phone"
                      autoComplete="off"
                      className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200"
                    />
                    {searching && (
                      <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">
                        <Loader2 size={14} className="animate-spin" />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={lookupStudent}
                    className="px-4 py-2.5 bg-[#0A1F44] text-white rounded-xl hover:bg-[#0A1F44]/90 active:scale-[0.97] transition duration-200 flex items-center justify-center shadow-sm shrink-0"
                    title="Select student"
                  >
                    <Search size={16} />
                  </button>
                </div>

                {showResults && regNo.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {searching && searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400">Searching...</p>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400">No students found</p>
                    ) : (
                      <ul className="max-h-56 overflow-y-auto">
                        {searchResults.map((result, index) => (
                          <li key={result.regNo}>
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightIndex(index)}
                              onClick={() => selectStudent(result)}
                              className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition ${
                                highlightIndex === index ? "bg-indigo-50" : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#0A1F44]/10 text-[#0A1F44] font-extrabold text-[10px] shrink-0 uppercase">
                                {result.name.slice(0, 2)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-[#0A1F44] text-xs truncate">{result.name}</p>
                                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{result.regNo}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[10px] font-black text-emerald-600">
                                  KES {Number(result.walletBalance || 0).toLocaleString()}
                                </p>
                                {result.walletFrozen && (
                                  <p className="text-[9px] font-bold text-red-500 mt-0.5">Frozen</p>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="px-3 py-2 border-t border-slate-100 text-[9px] text-gray-400 bg-slate-50">
                      ↑↓ to navigate · Enter to select
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl relative">
                <button
                  onClick={clearStudent}
                  className="absolute top-3 right-3 text-emerald-600 hover:bg-emerald-100 p-1 rounded-lg transition"
                  title="Clear selection"
                >
                  <X size={14} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 flex items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-xs shrink-0 uppercase select-none">
                    {student.name.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-[#0A1F44] text-xs truncate leading-tight">{student.name}</p>
                    <p className="text-[9px] text-emerald-700 font-bold tracking-wider uppercase mt-1">{student.regNo}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-emerald-100/50 flex items-center justify-between text-xs">
                  <span className="text-emerald-700/80 font-semibold">Wallet Balance</span>
                  <span className="text-emerald-800 font-black text-sm">KES {Number(student.walletBalance || 0).toLocaleString()}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {student.walletFrozen ? (
                    <span className="px-2 py-0.5 text-[8px] font-black normal bg-red-100 text-red-700 rounded">Your Wallet is Frozen</span>
                  ) : (
                    <>
                      {student.pinEnabled && (
                        <span className="px-2 py-0.5 text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 rounded">PIN Active</span>
                      )}
                      {student.hasFingerprint && (
                        <span className="px-2 py-0.5 text-[8px] font-black uppercase bg-teal-100 text-teal-700 rounded">Use Fingerprint</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cart Section */}
          <div className="space-y-2 flex flex-col border-t border-gray-100 pt-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Cart Items</span>
              {cart.length > 0 && (
                <button 
                  onClick={() => setCart([])} 
                  className="text-xs font-bold text-red-500 hover:text-red-600 hover:underline transition"
                >
                  Clear Cart
                </button>
              )}
            </div>
            
            <div className="space-y-2 overflow-y-auto max-h-56 pr-1 hidden-scrollbar">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-gray-300">
                  <ShoppingCart size={28} strokeWidth={1.5} className="mb-1" />
                  <p className="text-[11px] font-bold">No items in checkout cart</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.menuItemId} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-100 rounded-xl select-none">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-[#0A1F44] text-xs truncate leading-tight">{item.name}</p>
                      <p className="text-[9px] text-gray-400 font-semibold mt-0.5">KES {item.price.toLocaleString()} each</p>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-gray-150 rounded-lg p-0.5 shadow-sm shrink-0">
                      <button 
                        onClick={() => updateQty(item.menuItemId, -1)} 
                        className="p-1 hover:bg-gray-50 rounded text-gray-650 hover:text-gray-800 transition"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="w-4 text-center font-black text-[11px] text-[#0A1F44]">{item.quantity}</span>
                      <button 
                        onClick={() => updateQty(item.menuItemId, 1)} 
                        className="p-1 hover:bg-gray-50 rounded text-gray-655 hover:text-gray-805 transition"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                    <div className="w-16 text-right font-black text-[#0A1F44] text-xs shrink-0">
                      KES {(item.price * item.quantity).toLocaleString()}
                    </div>
                    <button 
                      onClick={() => updateQty(item.menuItemId, -item.quantity)} 
                      className="p-1 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition shrink-0"
                      title="Remove item"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Checkout Action Section */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500">Checkout Total</span>
              <span className="font-black text-lg text-[#0A1F44]">KES {total.toLocaleString()}</span>
            </div>

            <button
              onClick={beginCheckout}
              disabled={loading || cart.length === 0 || !student}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-extrabold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition duration-200 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader size="xs" showText={false} />
                  <span>Processing Sale...</span>
                </>
              ) : (
                <span>Complete Sale</span>
              )}
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Payment Authentication Overlay */}
      {showAuth && student && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-[#0A1F44] text-white flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-black tracking-wider uppercase">Authorize Payment</p>
                <p className="text-xs text-blue-200 truncate mt-0.5">{student.name} ({student.regNo})</p>
              </div>
              <button 
                onClick={() => setShowAuth(false)} 
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Receipt Info Panel */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 border border-gray-150 rounded-2xl">
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider font-extrabold">Checkout Total</p>
                  <p className="text-base font-black text-[#0A1F44] mt-0.5">KES {total.toLocaleString()}</p>
                </div>
                <div className="text-right border-l pl-4 border-gray-200">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider font-extrabold">Wallet Balance</p>
                  <p className="text-xs font-black text-emerald-600 mt-1">
                    KES {Number(student.walletBalance || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* PIN Option */}
              <div className="space-y-2">
                <p className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Option A: Wallet PIN</p>
                <div className="flex gap-2">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter 4-digit PIN"
                    inputMode="numeric"
                    maxLength={4}
                    className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-mono tracking-widest text-center"
                    disabled={!authOptions.pin || authLoading || loading}
                  />
                  <button
                    onClick={payWithPin}
                    disabled={!authOptions.pin || authLoading || loading}
                    className="px-5 py-2.5 rounded-xl bg-[#0A1F44] hover:bg-[#0A1F44]/90 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition shrink-0"
                  >
                    <KeyRound size={14} /> 
                    <span>Verify & Pay</span>
                  </button>
                </div>
                {!authOptions.pin && (
                  <p className="text-[10px] text-amber-600 font-medium">PIN authentication is not set up on this wallet.</p>
                )}
              </div>

              {/* Fingerprint Option */}
              <div className="border-t border-gray-100 pt-5 space-y-2.5">
                <p className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Option B: Biometrics</p>
                <button
                  onClick={payWithFingerprint}
                  disabled={!authOptions.fingerprint || scannerReady === false || authLoading || loading}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:scale-[0.99] text-gray-700 font-extrabold text-xs rounded-xl transition duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm border border-gray-200/50"
                >
                  <Fingerprint size={16} className={authOptions.fingerprint && scannerReady !== false ? "text-indigo-655 animate-pulse" : ""} />
                  <span>{authLoading ? "Capturing Fingerprint..." : "Authorize with Biometrics"}</span>
                </button>
                {!authOptions.fingerprint && (
                  <p className="text-[10px] text-amber-600 font-medium">Student has not enrolled a fingerprint template.</p>
                )}
                {scannerReady === false && (
                  <p className="text-[10px] text-amber-600 font-medium">Fingerprint scanner hardware is currently offline.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PosTerminal;