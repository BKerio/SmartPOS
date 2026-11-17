import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Megaphone, MessageSquare, Plus, RotateCw, Send, X, XCircle } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { useLiveRefresh } from "@/services/live";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { TablePager } from "@/components/page/DataTable";
import PageLoader from "@/components/shared/PageLoader";
import CampaignComposer, { type Audience } from "@/components/campaigns/CampaignComposer";
import { displayName } from "@/lib/text";

type Campaign = {
  id: string;
  title: string;
  message: string;
  audience: Audience;
  deliverTo: "self" | "parent";
  className: string | null;
  status: "sending" | "completed" | "partial" | "failed";
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  smsParts: number;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
};
type ListResponse = {
  rows: Campaign[];
  page: number;
  limit: number;
  total: number;
  month: { campaigns: number; sent: number; failed: number };
  status: { configured: boolean; paused: boolean; canSend: boolean };
};
type Recipient = { id: string; name: string; phone: string | null; message: string; status: "pending" | "sent" | "failed" | "skipped"; error: string | null; sentAt: string | null };
type Detail = { campaign: Campaign; recipients: Recipient[]; page: number; pages: number; count: number };

const PAGE_SIZE = 20;
const AUDIENCE_LABEL: Record<Audience, string> = {
  parents_all: "All parents",
  parents_selected: "Chosen parents",
  students_all: "All students",
  students_selected: "Chosen students",
};
const STATUS: Record<Campaign["status"], { cls: string; label: string }> = {
  sending: { cls: "pill-blue", label: "Sending" },
  completed: { cls: "pill-green", label: "Delivered" },
  partial: { cls: "pill-amber", label: "Some failed" },
  failed: { cls: "pill-red", label: "Failed" },
};
const R_STATUS: Record<Recipient["status"], { cls: string; label: string }> = {
  pending: { cls: "pill-blue", label: "Queued" },
  sent: { cls: "pill-green", label: "Sent" },
  failed: { cls: "pill-red", label: "Failed" },
  skipped: { cls: "pill-gray", label: "Skipped" },
};
const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const audienceText = (c: Campaign) =>
  `${AUDIENCE_LABEL[c.audience]}${c.className ? ` · ${c.className}` : ""}${c.audience.startsWith("students") ? (c.deliverTo === "parent" ? " · to parents" : " · own phones") : ""}`;

function Progress({ c }: { c: Campaign }) {
  const target = Math.max(1, c.totalRecipients - c.skippedCount);
  const done = c.sentCount + c.failedCount;
  return (
    <div className="cp-progress" title={`${c.sentCount} sent, ${c.failedCount} failed, ${c.skippedCount} skipped`}>
      <div className="cp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={done}>
        <i className="ok" style={{ width: `${(c.sentCount / target) * 100}%` }} />
        <i className="bad" style={{ width: `${(c.failedCount / target) * 100}%` }} />
      </div>
      <small>{c.sentCount.toLocaleString()} / {target.toLocaleString()} sent{c.failedCount ? ` · ${c.failedCount} failed` : ""}</small>
    </div>
  );
}

const CampaignsPage = () => {
  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "skipped">("all");
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get<ListResponse>("/campaigns", { params: { page, limit: PAGE_SIZE } });
      setData(data);
    } catch (e: any) {
      toast.error("Could not load campaigns", e.response?.data?.message);
    }
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async () => {
    if (!openId) return;
    try {
      const { data } = await API.get<Detail>(`/campaigns/${openId}`, { params: { status: filter } });
      setDetail(data);
    } catch (e: any) {
      toast.error("Could not open campaign", e.response?.data?.message);
    }
  }, [openId, filter]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Progress streams in while a campaign is sending.
  useLiveRefresh(() => { load(); loadDetail(); }, { event: "campaign:progress" });

  const retry = async () => {
    if (!detail) return;
    setRetrying(true);
    try {
      const { data: r } = await API.post<{ retrying: number }>(`/campaigns/${detail.campaign.id}/retry`);
      toast.success("Resending", `${r.retrying} message${r.retrying === 1 ? "" : "s"} queued again`);
      setFilter("all");
      load();
      loadDetail();
    } catch (e: any) {
      toast.error("Could not resend", e.response?.data?.message);
    } finally {
      setRetrying(false);
    }
  };

  if (!data) return <PageLoader height={420} />;
  const st = data.status;
  const c = detail?.campaign;

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={Megaphone}
        eyebrow="Communication"
        title="SMS campaigns"
        subtitle="Send announcements by SMS to all or chosen parents and students, and see who received them."
        actions={<button type="button" className="btn btn-primary" onClick={() => setComposing(true)}><Plus size={16} /> New campaign</button>}
      />

      {!st.canSend && (
        <div className="ac-note warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {st.paused ? "SMS is paused, so campaigns can't be sent right now. " : "SMS isn't set up on the server yet. "}
            {st.paused && <Link to="/settings" style={{ fontWeight: 700, textDecoration: "underline" }}>Turn it on in Settings</Link>}
          </span>
        </div>
      )}

      <StatTiles>
        <StatTile icon={Megaphone} tone="navy" label="Campaigns this month" value={data.month.campaigns.toLocaleString()} hint={`${data.total} in total`} />
        <StatTile icon={CheckCircle2} tone="green" label="SMS delivered" value={data.month.sent.toLocaleString()} hint="This month" />
        <StatTile icon={XCircle} tone="red" label="Failed" value={data.month.failed.toLocaleString()} hint="This month, can be resent" />
        <StatTile icon={MessageSquare} tone={st.canSend ? "teal" : "gold"} label="SMS status" value={st.canSend ? "On" : st.paused ? "Paused" : "Not set up"} hint={st.canSend ? "Ready to send" : "Campaigns are on hold"} />
      </StatTiles>

      <section className="card" style={{ overflow: "hidden" }}>
        {data.rows.length === 0 ? (
          <div className="dt-empty" style={{ padding: 48 }}>
            <Send size={28} style={{ color: "var(--muted-2)", display: "block", margin: "0 auto 8px" }} />
            <div style={{ fontWeight: 700, color: "var(--ink)" }}>No campaigns yet</div>
            <div style={{ marginTop: 4 }}>Send your first announcement to parents or students.</div>
            <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setComposing(true)}><Plus size={16} /> New campaign</button>
          </div>
        ) : (
          <>
            <div className="dt-wrap">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="hide-sm">Audience</th>
                    <th>Delivery</th>
                    <th>Status</th>
                    <th className="hide-sm">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="dt-click" onClick={() => { setFilter("all"); setOpenId(r.id); }}>
                      <td style={{ maxWidth: 360 }}>
                        <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</b>
                        <span className="dt-muted" style={{ display: "block", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message}</span>
                      </td>
                      <td className="hide-sm">{audienceText(r)}</td>
                      <td style={{ minWidth: 170 }}><Progress c={r} /></td>
                      <td><span className={`pill ${STATUS[r.status].cls}`}><span className="dot" />{STATUS[r.status].label}</span></td>
                      <td className="hide-sm">
                        <span style={{ display: "block" }}>{when(r.createdAt)}</span>
                        <span className="dt-muted" style={{ fontSize: 12 }}>by {displayName(r.createdByName)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} label="campaigns" />
          </>
        )}
      </section>

      {composing && (
        <CampaignComposer
          smsReady={st.canSend}
          onClose={() => setComposing(false)}
          onSent={(id) => { setComposing(false); setPage(1); load(); setFilter("all"); setOpenId(id); }}
        />
      )}

      {openId && (
        <>
          <div className="drawer-back" onClick={() => { setOpenId(null); setDetail(null); }} />
          <div className="drawer iv-drawer" role="dialog" aria-label="Campaign details">
            <div className="iv-drawer-head">
              <div className="min-w-0">
                <span className="dt-muted" style={{ fontSize: 12.5 }}>{c ? `${audienceText(c)} · ${when(c.createdAt)}` : "Loading…"}</span>
                <h2 style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c?.title ?? ""}</h2>
                {c && <span className={`pill ${STATUS[c.status].cls}`}><span className="dot" />{STATUS[c.status].label}</span>}
              </div>
              <button type="button" className="icon-btn" onClick={() => { setOpenId(null); setDetail(null); }} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="iv-drawer-body">
              {!c ? (
                <PageLoader height={200} />
              ) : (
                <>
                  <div className="cp-bubble" style={{ marginBottom: 14 }}>{c.message}</div>
                  <div className="cp-stats" style={{ marginBottom: 12 }}>
                    <div><b>{c.sentCount.toLocaleString()}</b><span>sent</span></div>
                    <div><b>{c.failedCount.toLocaleString()}</b><span>failed</span></div>
                    <div><b>{c.skippedCount.toLocaleString()}</b><span>skipped</span></div>
                  </div>
                  <Progress c={c} />
                  <div style={{ margin: "14px 0 8px" }}>
                    <Segmented<"all" | "sent" | "failed" | "skipped">
                      label="Show"
                      value={filter}
                      onChange={setFilter}
                      options={[
                        { value: "all", label: "All" },
                        { value: "sent", label: "Sent" },
                        { value: "failed", label: `Failed${c.failedCount ? ` (${c.failedCount})` : ""}` },
                        { value: "skipped", label: "Skipped" },
                      ]}
                    />
                  </div>
                  <ul className="cp-recipients">
                    {(detail?.recipients.length ?? 0) === 0 && <li className="cp-empty">Nobody here.</li>}
                    {(detail?.recipients ?? []).map((r) => (
                      <li key={r.id} title={r.message}>
                        <div className="min-w-0">
                          <b>{displayName(r.name)}</b>
                          <small>{r.phone || "No phone"}{r.error ? ` · ${r.error}` : r.sentAt ? ` · ${when(r.sentAt)}` : ""}</small>
                        </div>
                        <span className={`pill ${R_STATUS[r.status].cls}`}>{R_STATUS[r.status].label}</span>
                      </li>
                    ))}
                  </ul>
                  {detail && detail.count > detail.recipients.length && (
                    <p className="dt-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Showing the first {detail.recipients.length} of {detail.count.toLocaleString()}.</p>
                  )}
                </>
              )}
            </div>
            {c && c.failedCount > 0 && c.status !== "sending" && (
              <div className="iv-drawer-foot">
                <span className="dt-muted" style={{ fontSize: 12.5 }}>{c.failedCount} message{c.failedCount === 1 ? "" : "s"} didn't go through.</span>
                <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={retry} disabled={retrying || !st.canSend}>
                  <RotateCw size={16} /> {retrying ? "Resending…" : "Resend failed"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CampaignsPage;
