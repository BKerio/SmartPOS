import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  Search,
  Fingerprint,
  X,
  Banknote,
  Smartphone,
  Phone,
  Check,
  ArrowRight,
  ShieldCheck,
  Wallet,
  Delete,
} from "lucide-react";
import FormModal, { FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { captureFingerprint, checkScannerHealth, matchFingerprint, prepareScanner } from "@/services/fingerprintScanner";
import { receiptFromApiResponse, receiptFromGuestCash, type OrderReceiptData } from "@/lib/orderReceipt";
import { initiateStkPushAndWait } from "@/services/kopokopoPayment";
import OrderReceiptCard from "@/components/OrderReceiptCard";
import CounterPaymentModal from "@/components/CounterPaymentModal";
import logo from "@/assets/LOGO.png";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string;
  imageUrl?: string;
  stockLevel?: number | null;
  batchYield?: number | null;
  isAvailable?: boolean;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

interface StudentPreview {
  name: string;
  regNo: string;
  walletBalance: number;
  walletFrozen: boolean;
  pinEnabled: boolean;
  hasFingerprint: boolean;
}

type OrderDisplayProps = {
  mode: "kiosk" | "student";
};

type CheckoutStep = "cart" | "identify" | "auth" | "success";

const publicOpts = { skipAuthRedirect: true as const };

/** Seconds the kiosk shows the receipt before returning to the menu for the next customer. */
const RESET_AFTER_SUCCESS_S = 45;

/** Menu names are typed in mixed styles ("BHAJIA", "blackcoffe"); show ALL-CAPS / all-lower names in Title Case. */
function displayName(name: string): string {
  const trimmed = name.trim();
  if (trimmed !== trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

// Flat tile colours for dishes without a photo (soft tints from the design system), stable per category.
const TONES = [
  { bg: "#E8EEFB", ink: "#1E3A8A" },
  { bg: "#FBF3DD", ink: "#8A6410" },
  { bg: "#E1F5F2", ink: "#0D7468" },
  { bg: "#FCE7F0", ink: "#A61E5A" },
  { bg: "#F1E8FD", ink: "#6328C4" },
  { bg: "#E0F4F7", ink: "#076F88" },
  { bg: "#E9F7F0", ink: "#0F6B42" },
  { bg: "#FBEAEA", ink: "#9B1A1A" },
];
function toneFor(category: string) {
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

function greeting(d: Date): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const OrderDisplay = ({ mode }: OrderDisplayProps) => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState("All");
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [regNo, setRegNo] = useState("");
  const [pin, setPin] = useState("");
  const [studentPreview, setStudentPreview] = useState<StudentPreview | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentPreview | null>(null);
  const [searchResults, setSearchResults] = useState<StudentPreview[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<OrderReceiptData | null>(null);
  const [fingerprintEnrolled, setFingerprintEnrolled] = useState(false);
  const [showMpesa, setShowMpesa] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [showCash, setShowCash] = useState(false);

  const isKiosk = mode === "kiosk";

  const fetchMenu = useCallback(() => {
    API.get<MenuItem[]>("/menu/display", isKiosk ? publicOpts : undefined)
      .then((r) => setMenu(r.data))
      .catch(() => toast.error("Could not load menu"))
      .finally(() => setLoadingMenu(false));
  }, [isKiosk]);

  useEffect(() => {
    fetchMenu();
    if (!isKiosk) return;
    const timer = window.setInterval(fetchMenu, 30_000);
    return () => window.clearInterval(timer);
  }, [fetchMenu, isKiosk]);

  useEffect(() => {
    if (!isKiosk) {
      API.get("/students/me")
        .then((r) => {
          const s = r.data;
          setStudentProfile({
            name: s.name,
            regNo: s.regNo,
            walletBalance: s.walletBalance || 0,
            walletFrozen: Boolean(s.walletFrozen),
            pinEnabled: Boolean(s.walletPinSetAt),
            hasFingerprint: Boolean(s.hasFingerprint),
          });
        })
        .catch(() => toast.error("Failed to load your profile"));
    }
  }, [isKiosk]);

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
    if (!isKiosk || checkoutStep !== "identify") return;

    const query = regNo.trim();
    if (studentPreview || query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setHighlightIndex(-1);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await API.get<StudentPreview[]>("/pos/kiosk/search", {
          params: { q: query },
          ...publicOpts,
        });
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
  }, [regNo, studentPreview, isKiosk, checkoutStep]);

  const prepareAuthScanner = useCallback(async () => {
    try {
      const h = await checkScannerHealth();
      setScannerReady(h.deviceConnected);
      if (h.deviceConnected) await prepareScanner();
    } catch {
      setScannerReady(false);
    }
  }, []);

  useEffect(() => {
    if (checkoutStep === "auth") {
      prepareAuthScanner();
    }
  }, [checkoutStep, prepareAuthScanner]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menu.map((m) => m.category)))],
    [menu],
  );

  const filtered = useMemo(() => {
    return menu.filter((m) => category === "All" || m.category === category);
  }, [menu, category]);

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const authOptions = useMemo(() => {
    const active = isKiosk ? studentPreview : studentProfile;
    return {
      pin: Boolean(active?.pinEnabled),
      fingerprint: Boolean(active?.hasFingerprint),
      canEnrollFingerprint: Boolean(active && !active.hasFingerprint && scannerReady !== false),
    };
  }, [isKiosk, studentPreview, studentProfile, scannerReady]);

  const validateStudentForCheckout = (student: StudentPreview): boolean => {
    if (student.walletFrozen) {
      toast.error("Wallet frozen", "Contact your parent or school admin");
      return false;
    }
    return true;
  };

  const selectStudent = (picked: StudentPreview) => {
    if (!validateStudentForCheckout(picked)) return;
    setStudentPreview(picked);
    setRegNo(picked.regNo);
    setSearchResults([]);
    setShowResults(false);
    setHighlightIndex(-1);
    setPin("");
    setCheckoutStep("auth");
  };

  const clearStudent = () => {
    setStudentPreview(null);
    setRegNo("");
    setSearchResults([]);
    setShowResults(false);
    setHighlightIndex(-1);
  };

  const isItemAvailable = (item: MenuItem) => {
    if (item.isAvailable === false) return false;
    if (item.batchYield) return (item.stockLevel ?? 0) > 0;
    return item.stockLevel == null || item.stockLevel > 0;
  };

  const maxQtyForItem = (menuItemId: string) => {
    const item = menu.find((m) => m.id === menuItemId);
    if (!item || item.stockLevel == null) return Infinity;
    return item.stockLevel;
  };

  const addToCart = (item: MenuItem) => {
    if (!isItemAvailable(item)) {
      return toast.warning("Out of stock", `${item.name} is not available right now`);
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      const maxQty = maxQtyForItem(item.id);
      if (existing && existing.quantity >= maxQty) {
        toast.warning("Stock limit", `Only ${maxQty} available`);
        return prev;
      }
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.menuItemId !== id) return c;
          const maxQty = maxQtyForItem(id);
          const next = c.quantity + delta;
          if (next > maxQty) {
            toast.warning("Stock limit", `Only ${maxQty} available`);
            return { ...c, quantity: maxQty };
          }
          return { ...c, quantity: next };
        })
        .filter((c) => c.quantity > 0),
    );
  };

  const startCheckout = () => {
    if (cart.length === 0) return toast.warning("Cart is empty", "Add items before checkout");
    if (isKiosk) {
      setCheckoutStep("identify");
      setRegNo("");
      setPin("");
      setStudentPreview(null);
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    if (!studentProfile) return toast.error("Profile not loaded");
    if (!validateStudentForCheckout(studentProfile)) return;
    setCheckoutStep("auth");
    setPin("");
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

    setProcessing(true);
    try {
      const { data } = await API.get<StudentPreview>(
        `/pos/kiosk/lookup/${encodeURIComponent(query)}`,
        publicOpts,
      );
      selectStudent(data);
    } catch (e: any) {
      setStudentPreview(null);
      toast.error("Student not found", e.response?.data?.message || `No student matches "${query}"`);
    } finally {
      setProcessing(false);
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

  const submitOrder = async (
    auth: { pin?: string; fingerprintTemplate?: string; fingerprintMatchScore?: number },
    options?: { enrollFingerprint?: boolean },
  ) => {
    const active = isKiosk ? studentPreview : studentProfile;
    if (!active) return;

    if (active.walletBalance < total) {
      return toast.error("Insufficient balance", `You need KES ${total} but have KES ${active.walletBalance}`);
    }

    setProcessing(true);
    try {
      const payload = {
        items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
        auth,
        enrollFingerprint: options?.enrollFingerprint,
      };

      const { data } = isKiosk
        ? await API.post("/pos/kiosk-order", { regNo: active.regNo, ...payload }, publicOpts)
        : await API.post("/pos/student-order", payload);

      setLastReceipt(
        receiptFromApiResponse(data.receipt, { name: active.name, regNo: active.regNo }),
      );
      setFingerprintEnrolled(Boolean(data.fingerprintEnrolled));
      setCart([]);
      setPin("");
      setCheckoutStep("success");

      const profilePatch = {
        walletBalance: data.newBalance,
        hasFingerprint: active.hasFingerprint || Boolean(data.fingerprintEnrolled),
      };
      if (!isKiosk && studentProfile) {
        setStudentProfile({ ...studentProfile, ...profilePatch });
      }
      if (isKiosk && studentPreview) {
        setStudentPreview({ ...studentPreview, ...profilePatch });
      }

      fetchMenu();

      if (data.fingerprintEnrolled) {
        toast.success("Fingerprint enrolled", "Your fingerprint is saved for future orders");
      }
    } catch (e: any) {
      toast.error("Order failed", e.response?.data?.message || "Could not complete order");
    } finally {
      setProcessing(false);
    }
  };

  const payWithCashGuest = () => {
    if (cart.length === 0) return toast.warning("Cart is empty");
    setShowCash(true);
  };

  /** Completes a counter sale; paymentReference is the M-Pesa code when the customer paid the till. */
  const completeCashSale = async (paymentReference: string) => {
    setProcessing(true);
    try {
      const payload = {
        items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
        paymentReference: paymentReference || undefined,
      };
      const { data } = await API.post("/pos/kiosk-cash-order", payload, publicOpts);
      setLastReceipt(receiptFromGuestCash(data.receipt));
      setCart([]);
      setShowCash(false);
      setCheckoutStep("success");
      fetchMenu();
      toast.success("Cash sale complete", `Receipt ${data.receipt.receiptNo || ""}`);
    } catch (e: any) {
      toast.error("Cash payment failed", e.response?.data?.message || "Could not complete order");
    } finally {
      setProcessing(false);
    }
  };

  const payWithMpesaGuest = async () => {
    if (cart.length === 0) return toast.warning("Cart is empty");
    if (!/^(01|07)\d{8}$/.test(mpesaPhone.trim())) {
      return toast.error("Invalid phone", "Enter a valid 10-digit M-Pesa number");
    }

    setMpesaLoading(true);
    try {
      const result = await initiateStkPushAndWait(
        {
          phone: mpesaPhone.trim(),
          amount: total,
          description: "SmartPOS Kiosk Cafeteria Sale",
          purpose: "pos_sale",
          items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
          useAuth: false,
          kiosk: true,
        },
        () => toast.info("STK sent", "Enter M-Pesa PIN on your phone"),
      );

      const status = (result.status || "").toLowerCase();
      if (status === "success" || status === "received" || status === "complete") {
        const cartSnapshot = [...cart];
        const saleTotal = total;
        const phone = mpesaPhone.trim();

        let receiptData: OrderReceiptData = {
          receiptNo: result.posReceiptNo || `ORDER-${Date.now()}`,
          studentName: "Guest",
          regNo: phone,
          items: cartSnapshot.map((c) => ({
            name: c.name,
            quantity: c.quantity,
            price: c.price,
          })),
          total: saleTotal,
          paidAt: new Date().toISOString(),
          paymentMethod: "M-Pesa",
        };

        setLastReceipt(receiptData);
        setCart([]);
        setShowMpesa(false);
        setMpesaPhone("");
        setCheckoutStep("success");
        fetchMenu();
        toast.success("M-Pesa payment complete", `${receiptData.receiptNo} · KES ${saleTotal.toLocaleString()}`);
      } else if (status === "failed" || status === "error") {
        toast.error("Payment failed", "M-Pesa payment was not completed");
      } else {
        toast.warning("Payment status", result.status || "Unknown");
      }
    } catch (e: any) {
      toast.error("M-Pesa failed", e.message || "Could not complete STK push");
    } finally {
      setMpesaLoading(false);
    }
  };

  const placeOrderWithPin = async () => {
    if (!authOptions.pin) return toast.error("PIN not set", "Ask your parent to set a wallet PIN first");
    if (!/^\d{4}$/.test(pin)) return toast.error("Invalid PIN", "Enter your 4-digit wallet PIN");
    await submitOrder({ pin });
  };

  const placeOrderWithFingerprint = async () => {
    const active = isKiosk ? studentPreview : studentProfile;
    if (!active) return;
    if (!authOptions.fingerprint) {
      return toast.error("Fingerprint not enrolled", "Enroll your fingerprint first");
    }
    if (scannerReady === false) {
      return toast.error("Scanner offline", "Fingerprint scanner is not available on this kiosk");
    }
    setProcessing(true);
    try {
      await prepareScanner();
      const { data: enrolled } = await API.get<{ fingerprintTemplate: string }>(
        `/pos/kiosk/student-fingerprint/${encodeURIComponent(active.regNo)}`,
        isKiosk ? publicOpts : undefined,
      );
      const tpl = await captureFingerprint();
      const { matched, score } = await matchFingerprint(tpl, [enrolled.fingerprintTemplate]);
      if (!matched) {
        toast.error("Fingerprint did not match", "Use the same finger that was enrolled");
        setProcessing(false);
        return;
      }
      await submitOrder({ fingerprintTemplate: tpl, fingerprintMatchScore: score });
    } catch (e: any) {
      toast.error("Fingerprint failed", e.response?.data?.message || e.message || "Could not verify fingerprint");
      setProcessing(false);
    }
  };

  const enrollFingerprintAndPay = async () => {
    if (authOptions.fingerprint) {
      return placeOrderWithFingerprint();
    }
    if (scannerReady === false) {
      return toast.error("Scanner offline", "Fingerprint scanner is not available on this kiosk");
    }
    if (authOptions.pin && !/^\d{4}$/.test(pin)) {
      return toast.error("PIN required", "Enter your wallet PIN to enroll your fingerprint");
    }
    setProcessing(true);
    try {
      await prepareScanner();
      const tpl = await captureFingerprint();
      await submitOrder(
        {
          fingerprintTemplate: tpl,
          pin: authOptions.pin ? pin : undefined,
        },
        { enrollFingerprint: true },
      );
    } catch (e: any) {
      toast.error("Enrollment failed", e.message || "Could not enroll fingerprint");
      setProcessing(false);
    }
  };

  const appendPin = (digit: string) => {
    if (pin.length < 4) setPin((p) => p + digit);
  };

  const resetOrder = () => {
    setCheckoutStep("cart");
    setRegNo("");
    setPin("");
    setStudentPreview(null);
    setSearchResults([]);
    setShowResults(false);
    setLastReceipt(null);
    setFingerprintEnrolled(false);
    setShowMpesa(false);
    setMpesaPhone("");
    setShowCash(false);
  };

  const activeStudent = isKiosk ? studentPreview : studentProfile;

  // ── Presentation helpers (kiosk look) ────────────────────────────────────────
  const [menuQuery, setMenuQuery] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [resetIn, setResetIn] = useState(RESET_AFTER_SUCCESS_S);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // Kiosk only: after a completed order, return to the menu on its own so the next person starts fresh.
  useEffect(() => {
    if (!isKiosk || checkoutStep !== "success") return;
    setResetIn(RESET_AFTER_SUCCESS_S);
    const t = window.setInterval(() => setResetIn((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [isKiosk, checkoutStep]);
  useEffect(() => {
    if (isKiosk && checkoutStep === "success" && resetIn <= 0) resetOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetIn]);

  const visibleItems = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    return q ? filtered.filter((m) => `${m.name} ${m.description ?? ""}`.toLowerCase().includes(q)) : filtered;
  }, [filtered, menuQuery]);
  const categoryCount = (cat: string) => (cat === "All" ? menu.length : menu.filter((m) => m.category === cat).length);
  const cartQty = (id: string) => cart.find((c) => c.menuItemId === id)?.quantity ?? 0;
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0);
  const imageFor = (id: string) => menu.find((m) => m.id === id)?.imageUrl;
  const categoryOf = (id: string) => menu.find((m) => m.id === id)?.category ?? "";
  const stepIndex = checkoutStep === "cart" ? 0 : checkoutStep === "identify" ? 1 : 2;

  if (checkoutStep === "success" && lastReceipt) {
    return (
      <div className="ko-done">
        <div className="ko-done-card fade-up">
          <div className="ko-check"><CheckCircle2 size={44} /></div>
          <h1>Order complete</h1>
          <p>Show this receipt at the counter to collect your food.</p>
          <div className="ko-done-receipt">
            <OrderReceiptCard data={lastReceipt} />
          </div>
          {fingerprintEnrolled && (
            <p className="pill pill-green" style={{ margin: "0 auto 14px" }}>
              <Fingerprint size={13} /> Fingerprint saved for your next order
            </p>
          )}
          <button type="button" className="ko-btn ko-btn-primary" onClick={resetOrder}>
            <Plus size={20} /> Start a new order
          </button>
          {isKiosk && <p className="ko-countdown">Returning to the menu in {Math.max(resetIn, 0)}s</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="ko">
      <header className="ko-head">
        <div className="ko-brand">
          {!isKiosk && (
            <Link to="/student/wallet" className="ko-back" aria-label="Back to wallet">
              <ArrowLeft size={20} />
            </Link>
          )}
          <span className="ko-logo"><img src={logo} alt="" draggable={false} /></span>
          <div className="min-w-0">
            <b>Better Forks Cafeteria</b>
            <span>
              {isKiosk
                ? "Self-service ordering"
                : studentProfile
                  ? `${studentProfile.name} · KES ${studentProfile.walletBalance.toLocaleString()}`
                  : "Loading…"}
            </span>
          </div>
        </div>

        <nav className="ko-steps" aria-label="Order progress">
          {(isKiosk ? ["Choose meals", "Find account", "Pay"] : ["Choose meals", "Review", "Pay"]).map((label, i) => (
            <span key={label} className={`ko-step${i === stepIndex ? " on" : ""}${i < stepIndex ? " done" : ""}`}>
              <i>{i < stepIndex ? <Check size={13} strokeWidth={3} /> : i + 1}</i>
              <span className="lbl">{label}</span>
            </span>
          ))}
        </nav>

        <div className="ko-clock">
          <b>{now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</b>
          <span>{now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}</span>
        </div>
      </header>

      <div className="ko-body">
        <main className="ko-menu">
          <div className="ko-toolbar">
            <div>
              <h1 className="ko-title">{greeting(now)}! What would you like?</h1>
              <p className="ko-sub">Tap a meal to add it to your order.</p>
            </div>
            <label className="ko-search">
              <Search size={20} />
              <input value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" />
              {menuQuery && (
                <button type="button" onClick={() => setMenuQuery("")} aria-label="Clear search"><X size={18} /></button>
              )}
            </label>
          </div>

          <div className="ko-cats" role="tablist" aria-label="Categories">
            {categories.map((cat) => (
              <button key={cat} type="button" role="tab" aria-selected={category === cat} className={`ko-cat${category === cat ? " on" : ""}`} onClick={() => setCategory(cat)}>
                {cat === "All" ? "Everything" : cat}
                <em>{categoryCount(cat)}</em>
              </button>
            ))}
          </div>

          {loadingMenu ? (
            <Loader size="md" title="Loading the menu…" subtitle="Just a moment" className="py-16" />
          ) : (
            <div className="ko-grid">
              {visibleItems.length === 0 && (
                <div className="ko-empty">
                  <b>{menuQuery ? `Nothing matches "${menuQuery}"` : "Nothing here right now"}</b>
                  {menuQuery ? "Try another word, or clear the search." : "Check another category."}
                </div>
              )}
              {visibleItems.map((item) => {
                const available = isItemAvailable(item);
                const qty = cartQty(item.id);
                const tone = toneFor(item.category);
                const lowStock = available && item.stockLevel != null && item.stockLevel <= 5;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => available && addToCart(item)}
                    disabled={!available}
                    className={`ko-item${qty ? " in-cart" : ""}${available ? "" : " sold-out"}`}
                    aria-label={`${displayName(item.name)}, KES ${item.price}${qty ? `, ${qty} in your order` : ""}`}
                  >
                    <div className="ko-media">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="ko-tile" style={{ backgroundColor: tone.bg, color: tone.ink }}>
                          <b>{initials(item.name)}</b>
                        </div>
                      )}
                      {!available ? (
                        <span className="ko-badge out">Sold out</span>
                      ) : lowStock ? (
                        <span className="ko-badge warn">Only {item.stockLevel} left</span>
                      ) : null}
                      {qty > 0 && <span className="ko-qty">{qty}</span>}
                    </div>
                    <div className="ko-info">
                      <span className="ko-name">{displayName(item.name)}</span>
                      {item.description && <span className="ko-desc">{item.description}</span>}
                      <div className="ko-foot">
                        <span className="ko-price"><small>KES</small>{item.price.toLocaleString()}</span>
                        <span className="ko-add" aria-hidden="true"><Plus size={22} strokeWidth={2.5} /></span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="ko-panel" aria-label="Your order">
          {checkoutStep === "cart" && (
            <>
              <div className="ko-panel-head">
                <h2><ShoppingCart size={22} /> Your order</h2>
                {cart.length > 0 ? (
                  <button type="button" className="ko-link" onClick={() => setCart([])}><Trash2 size={15} /> Clear</button>
                ) : (
                  <span className="pill pill-gray">Empty</span>
                )}
              </div>
              <div className="ko-panel-body">
                {cart.length === 0 ? (
                  <div className="ko-panel-empty">
                    <span className="ko-tray"><UtensilsCrossed size={38} /></span>
                    <b>Your order is empty</b>
                    <span>Tap any meal on the menu to add it here.</span>
                  </div>
                ) : (
                  cart.map((c) => {
                    const img = imageFor(c.menuItemId);
                    const tone = toneFor(categoryOf(c.menuItemId));
                    return (
                      <div key={c.menuItemId} className="ko-line">
                        <span className="ko-thumb" style={img ? undefined : { backgroundColor: tone.bg, color: tone.ink }}>
                          {img ? <img src={img} alt="" /> : initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="ko-line-name">{displayName(c.name)}</div>
                          <div className="ko-line-sub">KES {(c.price * c.quantity).toLocaleString()} · {c.price} each</div>
                        </div>
                        <div className="ko-stepper">
                          <button type="button" onClick={() => updateQty(c.menuItemId, -1)} aria-label={`One less ${c.name}`}>
                            {c.quantity === 1 ? <Trash2 size={16} /> : <Minus size={18} />}
                          </button>
                          <span>{c.quantity}</span>
                          <button type="button" onClick={() => updateQty(c.menuItemId, 1)} aria-label={`One more ${c.name}`}><Plus size={18} /></button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="ko-panel-foot">
                <div className="ko-total">
                  <span>Total · {itemCount} item{itemCount === 1 ? "" : "s"}</span>
                  <b>KES {total.toLocaleString()}</b>
                </div>
                <button type="button" className="ko-btn ko-btn-primary" disabled={cart.length === 0} onClick={startCheckout}>
                  <Wallet size={21} /> {isKiosk ? "Pay with student wallet" : "Checkout"}
                </button>
                {isKiosk && (
                  <div className="ko-btn-row">
                    <button type="button" className="ko-btn ko-btn-mpesa" disabled={mpesaLoading || processing || cart.length === 0} onClick={() => setShowMpesa(true)}>
                      <Smartphone size={19} /> M-Pesa
                    </button>
                    <button type="button" className="ko-btn ko-btn-ghost" disabled={processing || mpesaLoading || cart.length === 0} onClick={payWithCashGuest}>
                      <Banknote size={19} /> {processing ? "…" : "Cash"}
                    </button>
                  </div>
                )}
                <p className="ko-secure"><ShieldCheck size={14} /> Wallet payments need your PIN or fingerprint</p>
              </div>
            </>
          )}

          {checkoutStep === "identify" && isKiosk && (
            <>
              <div className="ko-panel-head">
                <h2><Search size={21} /> Find your account</h2>
                <button type="button" className="ko-link neutral" onClick={() => setCheckoutStep("cart")}><ArrowLeft size={15} /> Back</button>
              </div>
              <div className="ko-panel-body" ref={searchRef}>
                <p className="ko-step-intro">Type your name, admission number or phone. You'll confirm with your PIN or fingerprint next.</p>
                {!studentPreview ? (
                  <>
                    <label className="ko-find">
                      <Search size={22} />
                      <input
                        type="text"
                        value={regNo}
                        onChange={(e) => { setRegNo(e.target.value); setShowResults(true); }}
                        onFocus={() => searchResults.length > 0 && setShowResults(true)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="e.g. ADM-2026-0412"
                        autoComplete="off"
                        autoFocus
                      />
                      {searching && <Loader size="xs" showText={false} />}
                    </label>
                    {showResults && regNo.trim().length >= 2 && (
                      <div className="ko-results">
                        {searching && searchResults.length === 0 ? (
                          <p className="ko-hint">Searching…</p>
                        ) : searchResults.length === 0 ? (
                          <p className="ko-hint">No students found. Check the spelling or try your admission number.</p>
                        ) : (
                          searchResults.map((r, index) => (
                            <button
                              key={r.regNo}
                              type="button"
                              className={`ko-result${highlightIndex === index ? " hl" : ""}`}
                              onMouseEnter={() => setHighlightIndex(index)}
                              onClick={() => selectStudent(r)}
                            >
                              <span className="ko-av">{initials(r.name)}</span>
                              <span className="min-w-0">
                                <b className="truncate">{r.name}</b>
                                <span>{r.regNo}</span>
                              </span>
                              <span className="ko-bal">
                                KES {Number(r.walletBalance || 0).toLocaleString()}
                                <br />
                                {r.walletFrozen ? (
                                  <span style={{ color: "var(--red)" }}>Frozen</span>
                                ) : (
                                  <span>{r.hasFingerprint ? "Fingerprint" : r.pinEnabled ? "PIN" : "No PIN yet"}</span>
                                )}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="ko-who">
                    <span className="ko-av">{initials(studentPreview.name)}</span>
                    <div className="min-w-0">
                      <b className="truncate">{studentPreview.name}</b>
                      <span>{studentPreview.regNo}</span>
                    </div>
                    <button type="button" className="ko-link neutral" style={{ gridColumn: "1 / -1", justifySelf: "start" }} onClick={clearStudent}>
                      <X size={15} /> Not you? Search again
                    </button>
                  </div>
                )}
              </div>
              <div className="ko-panel-foot">
                <button type="button" className="ko-btn ko-btn-primary" disabled={!studentPreview} onClick={() => setCheckoutStep("auth")}>
                  Continue to pay <ArrowRight size={20} />
                </button>
                <button type="button" className="ko-btn ko-btn-ghost" onClick={lookupStudent} disabled={processing || !!studentPreview}>
                  <Search size={18} /> {processing ? "Searching…" : "Look up"}
                </button>
              </div>
            </>
          )}

          {checkoutStep === "auth" && activeStudent && (
            <>
              <div className="ko-panel-head">
                <h2><ShieldCheck size={21} /> Confirm & pay</h2>
                <button
                  type="button"
                  className="ko-link neutral"
                  onClick={() => { setPin(""); setCheckoutStep(isKiosk ? "identify" : "cart"); }}
                >
                  <ArrowLeft size={15} /> Back
                </button>
              </div>
              <div className="ko-panel-body">
                <div className="ko-who">
                  <span className="ko-av">{initials(activeStudent.name)}</span>
                  <div className="min-w-0">
                    <b className="truncate">{activeStudent.name}</b>
                    <span>{activeStudent.regNo}</span>
                  </div>
                  <div className="ko-who-stats">
                    <div>
                      <span className="muted">Wallet balance</span>
                      <b style={{ color: activeStudent.walletBalance < total ? "var(--red)" : undefined }}>
                        KES {activeStudent.walletBalance.toLocaleString()}
                      </b>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="muted">To pay</span>
                      <b>KES {total.toLocaleString()}</b>
                    </div>
                  </div>
                  {activeStudent.walletBalance < total && (
                    <p className="ko-note" style={{ gridColumn: "1 / -1", color: "var(--red)", margin: 0 }}>
                      Not enough balance. Ask a parent to top up, or pay with M-Pesa or cash.
                    </p>
                  )}
                </div>

                {authOptions.pin && (
                  <>
                    <div className="ko-auth-label"><KeyRound size={18} /> Enter your 4-digit wallet PIN</div>
                    <div className="ko-dots" aria-label={`${pin.length} of 4 digits entered`}>
                      {[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? "on" : ""} />)}
                    </div>
                    <div className="ko-keypad">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`ko-key${key === "C" || key === "⌫" ? " fn" : ""}`}
                          disabled={processing}
                          onClick={() => {
                            if (key === "C") setPin("");
                            else if (key === "⌫") setPin((p) => p.slice(0, -1));
                            else appendPin(key);
                          }}
                          aria-label={key === "C" ? "Clear" : key === "⌫" ? "Delete" : key}
                        >
                          {key === "C" ? "Clear" : key === "⌫" ? <Delete size={24} /> : key}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {authOptions.fingerprint && (
                  <>
                    {authOptions.pin && <div className="ko-divider">OR</div>}
                    <button type="button" className="ko-finger" disabled={processing || scannerReady === false} onClick={placeOrderWithFingerprint}>
                      {processing ? <Loader size="sm" showText={false} /> : <Fingerprint size={34} />}
                      <b>{processing ? "Scanning…" : "Pay with your fingerprint"}</b>
                      <span>{scannerReady === false ? "The scanner is offline on this kiosk" : "Place your enrolled finger on the scanner"}</span>
                    </button>
                  </>
                )}

                {authOptions.canEnrollFingerprint && (
                  <>
                    {(authOptions.pin || authOptions.fingerprint) && <div className="ko-divider">FIRST TIME?</div>}
                    <button type="button" className="ko-finger" disabled={processing || (authOptions.pin && pin.length !== 4)} onClick={enrollFingerprintAndPay}>
                      {processing ? <Loader size="sm" showText={false} /> : <Fingerprint size={34} />}
                      <b>{processing ? "Scanning…" : `Save fingerprint & pay KES ${total.toLocaleString()}`}</b>
                      <span>
                        {authOptions.pin
                          ? "Enter your PIN above first, then scan your finger once to save it."
                          : "Place your finger on the scanner to register it and pay."}
                      </span>
                    </button>
                  </>
                )}

                {!authOptions.pin && !authOptions.fingerprint && !authOptions.canEnrollFingerprint && (
                  <p className="ko-note" style={{ marginTop: 18 }}>
                    No wallet PIN or fingerprint is set up yet. Ask a parent to set a wallet PIN, or pay with M-Pesa or cash.
                  </p>
                )}
              </div>
              {authOptions.pin && (
                <div className="ko-panel-foot">
                  <button type="button" className="ko-btn ko-btn-primary" disabled={processing || pin.length !== 4} onClick={placeOrderWithPin}>
                    {processing ? <Loader size="xs" showText={false} /> : <KeyRound size={20} />}
                    Pay KES {total.toLocaleString()}
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {isKiosk && showCash && (
        <CounterPaymentModal
          title="Pay at the counter"
          total={total}
          itemCount={itemCount}
          submitting={processing}
          onClose={() => !processing && setShowCash(false)}
          onConfirm={completeCashSale}
        />
      )}

      {isKiosk && showMpesa && (
        <FormModal
          icon={Smartphone}
          title="Pay with M-Pesa"
          subtitle="Enter your M-Pesa number. You'll get a prompt on your phone to finish paying."
          statusLabel="STK push"
          statusDetail={`KES ${total.toLocaleString()}`}
          submitLabel={`Send prompt · KES ${total.toLocaleString()}`}
          submittingLabel="Waiting for your M-Pesa PIN…"
          submitIcon={Smartphone}
          submitting={mpesaLoading}
          onClose={() => !mpesaLoading && setShowMpesa(false)}
          onSubmit={(e) => { e.preventDefault(); payWithMpesaGuest(); }}
        >
          <FormSection id="payer" icon={Phone} title="Your number">
            <div className="field">
              <FieldLabel htmlFor="kiosk-mpesa" required>M-Pesa number</FieldLabel>
              <div className="input-icon">
                <input id="kiosk-mpesa" type="tel" className="input" placeholder="0712 345 678" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} disabled={mpesaLoading} autoFocus required />
                <Phone />
              </div>
            </div>
            <div className="fm-summary">
              <span>Amount to pay</span>
              <b style={{ marginLeft: "auto" }}>KES {total.toLocaleString()}</b>
            </div>
          </FormSection>
        </FormModal>
      )}
    </div>
  );
};

export default OrderDisplay;
