import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Wallet, GraduationCap, DollarSign, History, Settings, Settings2, Gauge, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page/Page";
import FormModal, { ChoiceCards, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

type Student = {
  id: string;
  name: string;
  regNo: string;
  walletBalance: number;
  course?: string | null;
};

type WalletSettings = {
  walletFrozen: boolean;
  dailySpendLimit: number | null;
  weeklySpendLimit: number | null;
  pinEnabled: boolean;
};

const ParentManageWallet = () => {
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>((location.state as any)?.studentId || "");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<WalletSettings | null>(null);
  const [dailyInput, setDailyInput] = useState("");
  const [weeklyInput, setWeeklyInput] = useState("");

  const selected = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/parents/students");
      const list = (data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        regNo: s.regNo,
        walletBalance: s.walletBalance || 0,
        course: s.course || null,
      }));
      setStudents(list);
      if (!studentId && list.length > 0) setStudentId(list[0].id);
    } catch (e: any) {
      toast.error("Failed to load students", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  const openSettings = async () => {
    if (!selected) return;
    setShowSettings(true);
    setSettingsLoading(true);
    try {
      const { data } = await API.get(`/parents/students/${selected.id}/wallet-settings`);
      setSettings(data);
      setDailyInput(data.dailySpendLimit == null ? "" : String(data.dailySpendLimit));
      setWeeklyInput(data.weeklySpendLimit == null ? "" : String(data.weeklySpendLimit));
    } catch (e: any) {
      toast.error("Failed to load settings", e.response?.data?.message);
      setShowSettings(false);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!selected || !settings) return;
    setSavingSettings(true);
    try {
      const payload: any = {
        walletFrozen: settings.walletFrozen,
        dailySpendLimit: dailyInput.trim() ? Number(dailyInput) : null,
        weeklySpendLimit: weeklyInput.trim() ? Number(weeklyInput) : null,
      };
      const { data } = await API.put(`/parents/students/${selected.id}/wallet-settings`, payload);
      setSettings(data);
      toast.success("Saved", "Wallet settings updated");
      setShowSettings(false);
    } catch (e: any) {
      toast.error("Save failed", e.response?.data?.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const setPin = async () => {
    if (!selected) return;
    const pin = window.prompt("Set 4-digit Wallet PIN");
    if (!pin) return;
    try {
      await API.put(`/parents/students/${selected.id}/wallet-settings`, { pin });
      toast.success("PIN updated");
      openSettings();
    } catch (e: any) {
      toast.error("PIN failed", e.response?.data?.message);
    }
  };

  const resetPin = async () => {
    if (!selected) return;
    const ok = await toast.confirm("Reset wallet PIN to default (1234)?", { confirmLabel: "Reset" });
    if (!ok) return;
    try {
      await API.put(`/parents/students/${selected.id}/wallet-settings`, { resetPin: true });
      toast.success("PIN reset");
      openSettings();
    } catch (e: any) {
      toast.error("Reset failed", e.response?.data?.message);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="space-y-5" style={{ maxWidth: 960 }}>
        <PageHeader
          icon={Wallet}
          eyebrow="Parent portal"
          title="Manage wallet"
          subtitle="Balance, spending limits, freeze and PIN"
          actions={<Link to="/parent-dashboard" className="btn btn-ghost"><ArrowLeft size={16} /> Dashboard</Link>}
        />

        {loading ? (
          <Loader size="sm" title="Loading..." subtitle="Fetching linked students" className="py-10" />
        ) : students.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
              <GraduationCap className="w-6 h-6 text-stone-400" />
            </div>
            <p className="font-semibold text-stone-700">No students linked</p>
            <p className="text-sm text-stone-400 mt-1">Contact the admin to link your account to a student.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 space-y-4 shadow-sm">
            <div>
              <label className="text-xs font-semibold text-stone-500">Student</label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-white border border-gray-200 outline-none text-sm text-stone-800"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.regNo})
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="rounded-2xl bg-stone-50 border border-gray-200 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-extrabold text-lg truncate text-ink">{selected.name}</p>
                    <p className="text-sm text-stone-500 mt-1">
                      {selected.regNo}{selected.course ? ` · ${selected.course}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-widest text-stone-400">Wallet</p>
                    <p className="text-2xl font-extrabold text-ink">
                      KES {Number(selected.walletBalance || 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-5">
                  <Link
                    to="/parent/topup"
                    state={{ studentId: selected.id }}
                    className="rounded-xl bg-brand hover:bg-brand-dark text-white font-extrabold text-sm py-3 flex items-center justify-center gap-2"
                  >
                    <DollarSign className="w-4 h-4" /> Top Up Wallet
                  </Link>
                  <Link
                    to="/parent/history"
                    state={{ studentId: selected.id }}
                    className="rounded-xl bg-stone-100 hover:bg-stone-200 font-bold text-sm py-3 flex items-center justify-center gap-2 text-stone-800"
                  >
                    <History className="w-4 h-4" /> View History
                  </Link>
                  <Link
                    to="/pay-kopokopo"
                    state={{ studentId: selected.id, studentName: selected.name, regNo: selected.regNo, currentBalance: selected.walletBalance }}
                    className="rounded-xl bg-stone-100 hover:bg-stone-200 font-bold text-sm py-3 flex items-center justify-center gap-2 text-stone-800"
                  >
                    Pay via Kopokopo
                  </Link>
                  <button
                    type="button"
                    onClick={openSettings}
                    className="rounded-xl bg-stone-100 hover:bg-stone-200 font-bold text-sm py-3 flex items-center justify-center gap-2 text-stone-800"
                  >
                    <Settings className="w-4 h-4" /> Wallet Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && selected && (
        <FormModal
          icon={Settings2}
          title="Wallet settings"
          subtitle={`Spending limits, freeze and PIN for ${selected.name}.`}
          steps={[
            { id: "limits", label: "Limits", done: !!(dailyInput.trim() || weeklyInput.trim()) },
            { id: "security", label: "Security", done: !!settings?.pinEnabled },
          ]}
          statusLabel={settings?.walletFrozen ? "Frozen wallet" : "Active wallet"}
          statusDetail={selected.name}
          submitLabel="Save settings"
          submittingLabel="Saving…"
          submitting={savingSettings}
          submitDisabled={settingsLoading || !settings}
          onClose={() => setShowSettings(false)}
          onSubmit={(e) => { e.preventDefault(); saveSettings(); }}
        >
          {settingsLoading || !settings ? (
            <Loader size="sm" title="Loading…" subtitle="Fetching wallet settings" className="py-8" />
          ) : (
            <>
              <FormSection id="limits" icon={Gauge} title="Spending limits">
                <div className="fm-grid-2">
                  <div className="field">
                    <FieldLabel htmlFor="ws-daily" hint="KES · blank = no limit">Daily limit</FieldLabel>
                    <input id="ws-daily" className="input" inputMode="numeric" placeholder="No limit" value={dailyInput} onChange={(e) => setDailyInput(e.target.value)} />
                  </div>
                  <div className="field">
                    <FieldLabel htmlFor="ws-weekly" hint="KES · blank = no limit">Weekly limit</FieldLabel>
                    <input id="ws-weekly" className="input" inputMode="numeric" placeholder="No limit" value={weeklyInput} onChange={(e) => setWeeklyInput(e.target.value)} />
                  </div>
                </div>
              </FormSection>

              <FormSection id="security" icon={ShieldCheck} title="Security">
                <div className="field">
                  <FieldLabel>Wallet status</FieldLabel>
                  <ChoiceCards
                    label="Wallet status"
                    columns={2}
                    options={[
                      { value: "active", label: "Active", sub: "Can buy meals", tile: "ON" },
                      { value: "frozen", label: "Frozen", sub: "All spending blocked", tile: "OFF" },
                    ]}
                    selected={[settings.walletFrozen ? "frozen" : "active"]}
                    onToggle={(v) => setSettings((s) => (s ? { ...s, walletFrozen: v === "frozen" } : s))}
                  />
                </div>
                <div className="field">
                  <FieldLabel hint={settings.pinEnabled ? "PIN is set" : "Not set"}>Wallet PIN</FieldLabel>
                  <div className="wrap-gap">
                    <button type="button" className="btn btn-ghost" onClick={setPin}><KeyRound size={16} /> Set new PIN</button>
                    <button type="button" className="btn btn-ghost" onClick={resetPin}>Reset PIN</button>
                  </div>
                  <p className="fm-note">The student enters this PIN at the till to pay from their wallet.</p>
                </div>
              </FormSection>
            </>
          )}
        </FormModal>
      )}
    </div>
  );
};

export default ParentManageWallet;

