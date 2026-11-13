import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ChevronRight,
  CreditCard,
  DatabaseBackup,
  MessageSquare,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldAlert,
  UserCircle2,
  Users,
} from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import PageLoader from "@/components/shared/PageLoader";
import { AccountLayout, AcCard, InfoList, SettingRow, Switch, errorText } from "@/components/account/Account";
import { kes } from "@/lib/text";

type SystemSettings = { smsDisabled: boolean; smsConfigured: boolean };
type PaymentStatus = {
  tillNumber: string;
  webhookUrl: string;
  latestPayment: { createdAt: string; amount: number; transactionReference: string } | null;
  paymentsToday: number;
  hoursSinceLastPayment: number | null;
  webhookLikelyStale: boolean;
};

const LINKS = [
  { to: "/admin-profile", icon: UserCircle2, title: "Your profile", sub: "Name and password" },
  { to: "/staffs", icon: Users, title: "Staff accounts", sub: "Roles, approvals, fingerprints" },
  { to: "/data-management", icon: DatabaseBackup, title: "Backup & restore", sub: "Download or restore all data" },
  { to: "/audit-logs", icon: Activity, title: "Audit logs", sub: "Every change, with who and when" },
];

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
};

const Settings = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [payments, setPayments] = useState<PaymentStatus | null>(null);
  const [paymentsError, setPaymentsError] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPayments = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await API.get<PaymentStatus>("/kopokopo/webhook-status");
      setPayments(data);
      setPaymentsError(false);
    } catch {
      setPaymentsError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    API.get<SystemSettings>("/admin/settings")
      .then(({ data }) => setSettings({ smsDisabled: Boolean(data.smsDisabled), smsConfigured: Boolean(data.smsConfigured) }))
      .catch((e) => toast.error("Could not load settings", errorText(e)));
    loadPayments();
  }, [loadPayments]);

  if (!settings) return <PageLoader height={420} />;

  const smsOn = !settings.smsDisabled;

  // Saves on toggle. Turning SMS off affects every parent, so it asks first.
  const toggleSms = async (next: boolean) => {
    if (!next) {
      const ok = await toast.confirm("Stop all SMS?", {
        description: "No parent will get welcome messages, top-up receipts or alerts until you turn it back on.",
        confirmLabel: "Stop SMS",
        danger: true,
      });
      if (!ok) return;
    }
    setSavingSms(true);
    try {
      const { data } = await API.put<SystemSettings>("/admin/settings", { smsDisabled: !next });
      setSettings({ smsDisabled: Boolean(data.smsDisabled), smsConfigured: Boolean(data.smsConfigured) });
      toast.success(next ? "SMS turned on" : "SMS turned off", next ? "Messages will be sent again" : "No SMS will be sent until you turn it back on");
    } catch (e: any) {
      toast.error("Could not change SMS", errorText(e));
    } finally {
      setSavingSms(false);
    }
  };

  const smsChip = !settings.smsConfigured
    ? <span className="ac-chip warn"><span className="dot" />Provider not set up</span>
    : smsOn
      ? <span className="ac-chip ok"><span className="dot" />Sending</span>
      : <span className="ac-chip off"><span className="dot" />Paused</span>;

  const payHealth = !payments
    ? null
    : payments.latestPayment === null
      ? { cls: "off", label: "No payments yet" }
      : payments.webhookLikelyStale
        ? { cls: "warn", label: "No payments in 24 h" }
        : { cls: "ok", label: "Receiving payments" };

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-head-main">
          <span className="ac-head-icon" aria-hidden="true"><SettingsIcon size={22} /></span>
          <div className="min-w-0">
            <h1>System settings</h1>
            <p>Changes save as soon as you make them and are recorded in the audit log.</p>
          </div>
        </div>
        <div className="ac-head-status" aria-label="System status">
          <div className="ac-status">
            <span className={`dot ${!settings.smsConfigured ? "warn" : smsOn ? "ok" : "off"}`} aria-hidden="true" />
            <span><small>SMS</small><b>{!settings.smsConfigured ? "Not set up" : smsOn ? "Sending" : "Paused"}</b></span>
          </div>
          <div className="ac-status">
            <span className={`dot ${payHealth?.cls ?? "off"}`} aria-hidden="true" />
            <span><small>M-Pesa</small><b>{payHealth?.label ?? (paymentsError ? "Unavailable" : "Checking…")}</b></span>
          </div>
        </div>
      </header>

      <AccountLayout
        main={
          <>
            <AcCard icon={MessageSquare} title="Text messages (SMS)" description="Welcome messages, top-up receipts and alerts sent to parents through Advanta." flush>
              <SettingRow
                htmlFor="set-sms"
                title="Send SMS messages"
                description={
                  <>
                    {smsOn ? "Messages go out as normal." : "Nothing is sent to anyone until you turn this back on."}
                    <span className="ac-row-sub">{smsChip}</span>
                  </>
                }
                control={<Switch id="set-sms" label="Send SMS messages" checked={smsOn} busy={savingSms} onChange={toggleSms} />}
              />
              {!settings.smsConfigured && (
                <div style={{ padding: "0 20px 18px" }}>
                  <div className="ac-note warn">
                    <ShieldAlert size={16} aria-hidden="true" />
                    <span>The SMS provider's credentials aren't set on the server, so no messages can be sent even when this is on. Add the Advanta settings to the backend configuration.</span>
                  </div>
                </div>
              )}
            </AcCard>

            <AcCard
              icon={CreditCard}
              title="M-Pesa payments (KopoKopo)"
              description="Till payments reach SmartPOS through KopoKopo notifications. Read-only."
              flush
              footer={
                <>
                  <span className="ac-foot-hint">{payments ? "Live from the payment records" : ""}</span>
                  <button type="button" className="btn btn-ghost" onClick={loadPayments} disabled={refreshing}>
                    <RefreshCw size={15} className={refreshing ? "ac-spin" : ""} aria-hidden="true" /> {refreshing ? "Checking…" : "Check again"}
                  </button>
                </>
              }
            >
              {paymentsError && !payments ? (
                <p className="ac-empty">Couldn't load the payment status. Try “Check again”.</p>
              ) : !payments ? (
                <p className="ac-empty">Checking…</p>
              ) : (
                <>
                  <InfoList
                    items={[
                      { label: "Status", value: <span className={`ac-chip ${payHealth!.cls}`}><span className="dot" />{payHealth!.label}</span> },
                      { label: "Till number", value: payments.tillNumber || "Not set", mono: true },
                      { label: "Payments today", value: payments.paymentsToday.toLocaleString() },
                      {
                        label: "Last till payment",
                        value: payments.latestPayment
                          ? `${kes(payments.latestPayment.amount)} · ${ago(payments.latestPayment.createdAt)}`
                          : "-",
                      },
                    ]}
                  />
                  {payments.webhookLikelyStale && (
                    <div style={{ padding: "0 20px 18px" }}>
                      <div className="ac-note warn">
                        <ShieldAlert size={16} aria-hidden="true" />
                        <span>
                          No till payment has arrived for {payments.hoursSinceLastPayment} hours. If customers have paid in that time, KopoKopo
                          may not be reaching the server. Ask your developer to check the webhook address and re-subscribe.
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </AcCard>
          </>
        }
        aside={
          <AcCard title="More settings" flush>
            <ul className="ac-links">
              {LINKS.map(({ to, icon: Icon, title, sub }) => (
                <li key={to}>
                  <Link to={to}>
                    <span className="ico"><Icon size={16} /></span>
                    <span className="min-w-0"><b>{title}</b><small>{sub}</small></span>
                    <ChevronRight size={16} className="chev" />
                  </Link>
                </li>
              ))}
            </ul>
          </AcCard>
        }
      />
    </div>
  );
};

export default Settings;
