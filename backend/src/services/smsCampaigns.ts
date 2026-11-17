import prisma from '@/services/prisma';
import { normalizeKenyanMobile, sendAdvantaSms, isSmsSendingEnabled } from '@/services/sms';

/*
 * SMS campaigns: resolve an audience into recipients, personalise the message for each, and send in the
 * background with a little parallelism. Progress is written to the database as it goes, pushed to open
 * pages over socket.io ("campaign:progress"), and a campaign interrupted by a restart resumes on start-up.
 */

export type Audience = 'parents_all' | 'parents_selected' | 'students_all' | 'students_selected';
export const AUDIENCES: Audience[] = ['parents_all', 'parents_selected', 'students_all', 'students_selected'];
export const PLACEHOLDERS = ['{name}', '{first_name}', '{student}', '{adm}', '{balance}'] as const;

type Draft = {
  recipientType: 'parent' | 'student';
  recipientId: string;
  name: string;
  phone: string | null;
  vars: { name: string; student?: string; adm?: string; balance?: number };
  skip?: string; // reason it won't be sent
};

const titleCase = (s: string) =>
  s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s'(/-])\p{L}/gu, (c) => c.toUpperCase()) : s;

export function personalise(template: string, v: Draft['vars']): string {
  const name = titleCase(v.name || '').trim();
  return template
    .replace(/\{name\}/g, name)
    .replace(/\{first_name\}/g, name.split(/\s+/)[0] || '')
    .replace(/\{student\}/g, v.student ? titleCase(v.student) : '')
    .replace(/\{adm\}/g, v.adm || '')
    .replace(/\{balance\}/g, v.balance != null ? `KES ${Math.round(v.balance).toLocaleString()}` : '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** SMS parts: 160 chars for one part, 153 per part when split (GSM-7). Unicode (emoji etc.) is 70 / 67. */
export function smsParts(text: string): number {
  const unicode = /[^\u0000-ÿ]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/** Everyone the audience covers, with why anyone won't receive it (no phone, opted out, duplicate number). */
export async function resolveAudience(opts: {
  audience: Audience;
  ids?: string[];
  deliverTo?: 'self' | 'parent';
  className?: string | null;
}): Promise<Draft[]> {
  const drafts: Draft[] = [];
  if (opts.audience === 'parents_all' || opts.audience === 'parents_selected') {
    const parents = await prisma.parent.findMany({
      where: opts.audience === 'parents_selected' ? { id: { in: opts.ids ?? [] } } : {},
      select: { id: true, name: true, phone: true, receiveSms: true, students: { select: { name: true, regNo: true, walletBalance: true }, take: 1 } },
      orderBy: { name: 'asc' },
    });
    for (const p of parents) {
      const child = p.students[0];
      drafts.push({
        recipientType: 'parent',
        recipientId: p.id,
        name: p.name,
        phone: p.phone,
        vars: { name: p.name, student: child?.name, adm: child?.regNo, balance: child?.walletBalance },
        skip: p.receiveSms === false ? 'Turned SMS off' : undefined,
      });
    }
  } else {
    const students = await prisma.student.findMany({
      where: {
        ...(opts.audience === 'students_selected' ? { id: { in: opts.ids ?? [] } } : {}),
        ...(opts.audience === 'students_all' && opts.className ? { className: opts.className } : {}),
      },
      select: { id: true, name: true, regNo: true, phone: true, walletBalance: true, parent: { select: { id: true, name: true, phone: true, receiveSms: true } } },
      orderBy: { name: 'asc' },
    });
    for (const s of students) {
      if (opts.deliverTo === 'parent') {
        drafts.push({
          recipientType: 'student',
          recipientId: s.id,
          name: s.parent ? `${s.parent.name} (parent of ${titleCase(s.name)})` : s.name,
          phone: s.parent?.phone ?? null,
          vars: { name: s.parent?.name ?? s.name, student: s.name, adm: s.regNo, balance: s.walletBalance },
          skip: !s.parent ? 'No parent linked' : s.parent.receiveSms === false ? 'Parent turned SMS off' : undefined,
        });
      } else {
        drafts.push({
          recipientType: 'student',
          recipientId: s.id,
          name: s.name,
          phone: s.phone,
          vars: { name: s.name, student: s.name, adm: s.regNo, balance: s.walletBalance },
        });
      }
    }
  }

  // Phone checks + one message per number (a parent of three children gets it once).
  const seen = new Set<string>();
  for (const d of drafts) {
    if (d.skip) continue;
    const mobile = d.phone ? normalizeKenyanMobile(d.phone) : null;
    if (!d.phone) d.skip = 'No phone number';
    else if (!mobile) d.skip = 'Invalid phone number';
    else if (seen.has(mobile)) d.skip = 'Same number already included';
    else seen.add(mobile);
  }
  return drafts;
}

export function summarise(drafts: Draft[], template: string) {
  const reachable = drafts.filter((d) => !d.skip);
  const reasons: Record<string, number> = {};
  for (const d of drafts) if (d.skip) reasons[d.skip] = (reasons[d.skip] ?? 0) + 1;
  const parts = reachable.reduce((max, d) => Math.max(max, smsParts(personalise(template, d.vars))), template ? smsParts(template) : 1);
  const units = reachable.reduce((sum, d) => sum + smsParts(personalise(template, d.vars)), 0);
  const sample = reachable[0] ?? drafts[0];
  return {
    total: drafts.length,
    reachable: reachable.length,
    skipped: drafts.length - reachable.length,
    reasons,
    smsParts: parts,
    smsUnits: units,
    sample: sample ? { name: titleCase(sample.name), message: personalise(template, sample.vars) } : null,
  };
}

// ── Sending ──────────────────────────────────────────────────────────────────

type Emit = (event: string, payload: unknown) => void;
let emit: Emit = () => {};
export function setCampaignEmitter(fn: Emit) {
  emit = fn;
}

const running = new Set<string>();
const CONCURRENCY = 4;

async function refreshCounts(campaignId: string, final: boolean) {
  const groups = await prisma.smsCampaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: true });
  const n = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const sent = n('sent'), failed = n('failed'), skipped = n('skipped'), pending = n('pending');
  const status = final || pending === 0 ? (sent === 0 && failed > 0 ? 'failed' : failed > 0 ? 'partial' : 'completed') : 'sending';
  const c = await prisma.smsCampaign.update({
    where: { id: campaignId },
    data: { sentCount: sent, failedCount: failed, skippedCount: skipped, status, ...(status !== 'sending' ? { completedAt: new Date() } : {}) },
  });
  emit('campaign:progress', { id: c.id, status: c.status, sent, failed, skipped, pending, total: c.totalRecipients });
  return c;
}

/** Sends every pending recipient of a campaign. Safe to call twice: a campaign only runs once at a time. */
export async function runCampaign(campaignId: string): Promise<void> {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  try {
    for (;;) {
      if (!isSmsSendingEnabled()) {
        // SMS paused (Settings) or not configured: stop here; pending ones fail with a clear reason.
        await prisma.smsCampaignRecipient.updateMany({
          where: { campaignId, status: 'pending' },
          data: { status: 'failed', error: 'SMS is paused or not set up (Settings)' },
        });
        break;
      }
      const batch = await prisma.smsCampaignRecipient.findMany({ where: { campaignId, status: 'pending' }, take: 40, orderBy: { name: 'asc' } });
      if (batch.length === 0) break;
      let i = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
          while (i < batch.length) {
            const r = batch[i++];
            try {
              await sendAdvantaSms(r.phone!, r.message);
              await prisma.smsCampaignRecipient.update({ where: { id: r.id }, data: { status: 'sent', sentAt: new Date(), error: null } });
            } catch (err: any) {
              await prisma.smsCampaignRecipient.update({
                where: { id: r.id },
                data: { status: 'failed', error: String(err?.message || err).slice(0, 300) },
              });
            }
          }
        }),
      );
      await refreshCounts(campaignId, false);
    }
    await refreshCounts(campaignId, true);
  } catch (err: any) {
    console.error(`[campaigns] ${campaignId} stopped:`, err?.message || err);
  } finally {
    running.delete(campaignId);
  }
}

/** On start-up: finish campaigns that were mid-send when the server stopped. */
export async function resumeCampaigns(): Promise<number> {
  const open = await prisma.smsCampaign.findMany({ where: { status: 'sending' }, select: { id: true } });
  for (const c of open) void runCampaign(c.id);
  return open.length;
}
