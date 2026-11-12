import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, DollarSign, GraduationCap, History, RefreshCw, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/page/Page";
import { initialsOf } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

interface Student {
  id: string;
  name: string;
  regNo: string;
  walletBalance: number;
  transactions: { id: string; amount: number; type: string; description?: string; createdAt: string }[];
  course?: string | null;
}


const ParentDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState<string>("");
  const name = localStorage.getItem("userName") || "Parent";
  const firstName = name.split(" ")[0];
  const navigate = useNavigate();

  const active = useMemo(
    () => students.find((s) => s.id === activeStudentId) || students[0],
    [students, activeStudentId],
  );

  const fetchStudents = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await API.get("/parents/students");
      setStudents(data);
    } catch (e: any) {
      toast.error("Failed to load students", e.response?.data?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  useEffect(() => {
    if (!activeStudentId && students.length > 0) setActiveStudentId(students[0].id);
  }, [students, activeStudentId]);

  const LOW_BALANCE = 100;
  const txLabel = (t: Student["transactions"][number]) =>
    t.description || (t.type === "registration_fee" ? "System registration fee" : t.type.replace(/_/g, " "));

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        icon={Users}
        eyebrow="Parent portal"
        title={`Hello, ${firstName}`}
        subtitle="Your children's school meal wallets"
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => fetchStudents(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {loading ? (
        <Loader size="sm" title="Loading students..." subtitle="Fetching your children's accounts" className="py-12" />
      ) : students.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 40 }}>
          <span className="pg-chip tone-gray" style={{ margin: "0 auto 12px", width: 52, height: 52 }}><GraduationCap size={24} /></span>
          <p className="section-title">No students linked yet</p>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>Ask the school admin to link your children to your account.</p>
        </div>
      ) : (
        active && (
          <>
            {students.length > 1 && (
              <div className="pa-kids" role="tablist" aria-label="Your children">
                {students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={s.id === active.id}
                    className={`pa-kid${s.id === active.id ? " on" : ""}`}
                    onClick={() => setActiveStudentId(s.id)}
                  >
                    <span className="pa-av">{initialsOf(s.name)}</span>
                    <span className="min-w-0">
                      <b className="truncate">{s.name}</b>
                      <span>KES {Number(s.walletBalance || 0).toLocaleString()}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="pa-grid">
              {/* Wallet card */}
              <section className="pa-wallet">
                <div className="pa-wallet-top">
                  <span className="pa-av lg">{initialsOf(active.name)}</span>
                  <div className="min-w-0">
                    <h2 className="truncate">{active.name}</h2>
                    <p>{active.regNo}{active.course ? ` · ${active.course}` : ""}</p>
                  </div>
                </div>
                <div className="pa-balance">
                  <span>Wallet balance</span>
                  <b><small>KES</small>{Number(active.walletBalance || 0).toLocaleString()}</b>
                  {active.walletBalance < LOW_BALANCE && (
                    <em><AlertTriangle size={14} /> Running low, consider topping up</em>
                  )}
                </div>
                <div className="pa-actions">
                  <button type="button" className="btn btn-gold btn-lg" onClick={() => navigate("/parent/topup", { state: { studentId: active.id } })}>
                    <DollarSign size={18} /> Top up wallet
                  </button>
                  <button type="button" className="pa-ghost" onClick={() => navigate("/parent/wallet", { state: { studentId: active.id } })}>
                    <Settings2 size={16} /> Manage wallet
                  </button>
                  <button type="button" className="pa-ghost" onClick={() => navigate("/parent/history", { state: { studentId: active.id } })}>
                    <History size={16} /> History
                  </button>
                </div>
              </section>

              {/* Recent activity */}
              <section className="card">
                <div className="card-head">
                  <span className="card-title">Recent activity</span>
                  <Link to="/parent/history" state={{ studentId: active.id }} className="db-link" style={{ border: 0, margin: 0, padding: 0 }}>
                    View all <ArrowUpRight size={14} />
                  </Link>
                </div>
                {!active.transactions || active.transactions.length === 0 ? (
                  <div className="db-empty">No transactions yet.</div>
                ) : (
                  <ul className="pa-tx">
                    {active.transactions.slice(0, 6).map((t) => {
                      const positive = Number(t.amount) >= 0;
                      return (
                        <li key={t.id}>
                          <span className={`pg-chip ${positive ? "tone-green" : "tone-red"}`}>
                            {positive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </span>
                          <div className="min-w-0">
                            <b className="truncate">{txLabel(t)}</b>
                            <span>{new Date(t.createdAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <strong className={positive ? "in" : "out"}>
                            {positive ? "+" : "−"}KES {Math.abs(Number(t.amount || 0)).toLocaleString()}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default ParentDashboard;