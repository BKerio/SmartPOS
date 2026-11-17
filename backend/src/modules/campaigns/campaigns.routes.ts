import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import prisma from '@/services/prisma';
import { ensureAdmin } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';
import { isAdvantaSmsConfigured, isSmsSendingEnabled } from '@/services/sms';
import { getSystemSettings, isSmsGloballyDisabled, setSystemSettings } from '@/services/systemSettings';
import { AUDIENCES, personalise, resolveAudience, runCampaign, summarise, type Audience } from '@/services/smsCampaigns';

/*
 * SMS campaigns (admin only): announcements to all or chosen parents, or all / one class / chosen students
 * (to the student's own phone or their parent's).
 *
 *   GET  /api/campaigns/status            can SMS be sent right now?
 *   GET  /api/campaigns/recipients        people for the picker (?type=parents|students&search=&className=)
 *   POST /api/campaigns/preview           who will get it, who won't and why, SMS parts, sample message
 *   POST /api/campaigns                   create + start sending (background)
 *   GET  /api/campaigns                   history (paged)
 *   GET  /api/campaigns/:id               one campaign + its recipients (?status=&page=)
 *   POST /api/campaigns/:id/retry         send again to the ones that failed
 */

const MAX_LEN = 640; // 4 SMS parts
const MAX_SELECTED = 2000;

type Body = {
  title?: string;
  message?: string;
  audience?: Audience;
  ids?: string[];
  parentIds?: string[]; // mixed_selected
  studentIds?: string[]; // mixed_selected
  deliverTo?: 'self' | 'parent';
  className?: string | null;
  /** Added on its own line at the end of every message. Empty = no signature. */
  signature?: string;
};

const MAX_SIGNATURE = 80;
/** The text that is actually sent: the message, then the signature on its own line. */
const withSignature = (message: string, signature?: string) => {
  const sig = (signature ?? '').trim();
  return sig ? `${message.trim()}\n${sig}` : message.trim();
};
const includesStudents = (a: Audience) => a.startsWith('students') || a === 'everyone' || a === 'mixed_selected';

function validate(body: Body, needMessage: boolean): string | null {
  if (!body.audience || !AUDIENCES.includes(body.audience)) return 'Choose who should get the message';
  const picked = body.audience === 'mixed_selected' ? (body.parentIds?.length ?? 0) + (body.studentIds?.length ?? 0) : body.ids?.length ?? 0;
  if (body.audience.endsWith('_selected') && picked === 0) return 'Pick at least one person';
  if (picked > MAX_SELECTED) return `Pick at most ${MAX_SELECTED} people, or send to everyone`;
  if (needMessage) {
    const m = (body.message ?? '').trim();
    if (!m) return 'Write the message';
    if ((body.signature ?? '').trim().length > MAX_SIGNATURE) return `Keep the signature under ${MAX_SIGNATURE} characters`;
    if (withSignature(m, body.signature).length > MAX_LEN) return `Keep the message and signature under ${MAX_LEN} characters (4 SMS)`;
  }
  return null;
}

export default async function campaignRoutes(app: App) {
  app.get('/status', { onRequest: ensureAdmin }, async (): Promise<any> => ({
    configured: isAdvantaSmsConfigured(),
    paused: isSmsGloballyDisabled(),
    canSend: isSmsSendingEnabled(),
    signature: getSystemSettings().smsSignature,
  }));

  app.get('/recipients', { onRequest: ensureAdmin }, async (req: Req): Promise<any> => {
    const q = req.query as Record<string, string>;
    const search = (q.search || '').trim();
    if (q.type === 'students') {
      const [rows, classes] = await Promise.all([
        prisma.student.findMany({
          where: {
            ...(q.className ? { className: q.className } : {}),
            ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { regNo: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } : {}),
          },
          select: { id: true, name: true, regNo: true, phone: true, className: true, parent: { select: { name: true, phone: true } } },
          orderBy: { name: 'asc' },
          take: 500,
        }),
        prisma.student.groupBy({ by: ['className'], _count: true, where: { className: { not: null } }, orderBy: { className: 'asc' } }),
      ]);
      return {
        rows: rows.map((s) => ({ id: s.id, name: s.name, detail: [s.regNo, s.className].filter(Boolean).join(' · '), phone: s.phone, parentPhone: s.parent?.phone ?? null })),
        classes: classes.map((c) => ({ name: c.className!, count: c._count })),
      };
    }
    const rows = await prisma.parent.findMany({
      where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } : {},
      select: { id: true, name: true, phone: true, receiveSms: true, _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
      take: 500,
    });
    return {
      rows: rows.map((p) => ({ id: p.id, name: p.name, detail: `${p._count.students} ${p._count.students === 1 ? 'child' : 'children'}`, phone: p.phone, optedOut: !p.receiveSms })),
      classes: [],
    };
  });

  app.post('/preview', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const body = (req.body ?? {}) as Body;
    const err = validate(body, false);
    if (err) return res.status(422).send({ message: err });
    const drafts = await resolveAudience({ audience: body.audience!, ids: body.ids, parentIds: body.parentIds, studentIds: body.studentIds, deliverTo: body.deliverTo, className: body.className });
    return summarise(drafts, withSignature(body.message ?? '', body.signature));
  });

  app.post('/', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const body = (req.body ?? {}) as Body;
    const err = validate(body, true);
    if (err) return res.status(422).send({ message: err });
    if (!isSmsSendingEnabled()) {
      return res.status(409).send({ message: isSmsGloballyDisabled() ? 'SMS is paused in Settings. Turn it on to send campaigns.' : 'SMS is not set up on the server yet.' });
    }
    const message = withSignature(body.message!, body.signature);
    const drafts = await resolveAudience({ audience: body.audience!, ids: body.ids, parentIds: body.parentIds, studentIds: body.studentIds, deliverTo: body.deliverTo, className: body.className });
    const summary = summarise(drafts, message);
    if (summary.reachable === 0) return res.status(422).send({ message: 'Nobody in this audience can receive an SMS (no valid phone numbers).' });

    const title = (body.title ?? '').trim() || message.slice(0, 60);
    const campaign = await prisma.smsCampaign.create({
      data: {
        title,
        message,
        audience: body.audience!,
        deliverTo: includesStudents(body.audience!) ? body.deliverTo ?? 'self' : 'self',
        className: body.audience === 'students_all' || body.audience === 'everyone' ? body.className || null : null,
        totalRecipients: drafts.length,
        skippedCount: summary.skipped,
        smsParts: summary.smsParts,
        createdById: req.user!.id,
        createdByName: req.user!.name || 'Admin',
        recipients: {
          create: drafts.map((d) => ({
            recipientType: d.recipientType,
            recipientId: d.recipientId,
            name: d.name,
            phone: d.phone,
            message: personalise(message, d.vars),
            status: d.skip ? 'skipped' : 'pending',
            error: d.skip ?? null,
          })),
        },
      },
    });
    await logAuditEvent({
      eventType: 'sms_campaign',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Send SMS Campaign',
      description: `"${title}" to ${summary.reachable} recipient(s) (${body.audience}${body.className ? `, ${body.className}` : ''}), ${summary.smsUnits} SMS`,
      metadata: { campaignId: campaign.id },
      ipAddress: req.ip,
    });
    if (body.signature !== undefined && body.signature.trim() !== getSystemSettings().smsSignature) {
      setSystemSettings({ smsSignature: body.signature.trim() });
    }
    void runCampaign(campaign.id);
    return res.status(201).send({ ...campaign, preview: summary });
  });

  app.get('/', { onRequest: ensureAdmin }, async (req: Req): Promise<any> => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [rows, total, month] = await Promise.all([
      prisma.smsCampaign.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.smsCampaign.count(),
      prisma.smsCampaign.aggregate({ _count: true, _sum: { sentCount: true, failedCount: true }, where: { createdAt: { gte: monthStart } } }),
    ]);
    return {
      rows,
      page,
      limit,
      total,
      month: { campaigns: month._count, sent: month._sum.sentCount ?? 0, failed: month._sum.failedCount ?? 0 },
      status: { configured: isAdvantaSmsConfigured(), paused: isSmsGloballyDisabled(), canSend: isSmsSendingEnabled() },
    };
  });

  app.get('/:id', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = 100;
    const where = { campaignId: String(req.params.id), ...(q.status && q.status !== 'all' ? { status: q.status } : {}) };
    const [campaign, recipients, count] = await Promise.all([
      prisma.smsCampaign.findUnique({ where: { id: String(req.params.id) } }),
      prisma.smsCampaignRecipient.findMany({ where, orderBy: [{ status: 'asc' }, { name: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.smsCampaignRecipient.count({ where }),
    ]);
    if (!campaign) return res.status(404).send({ message: 'Campaign not found' });
    return { campaign, recipients, page, pages: Math.max(1, Math.ceil(count / limit)), count };
  });

  app.post('/:id/retry', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!isSmsSendingEnabled()) return res.status(409).send({ message: 'SMS is paused or not set up, so nothing can be resent yet.' });
    const id = String(req.params.id);
    const { count } = await prisma.smsCampaignRecipient.updateMany({ where: { campaignId: id, status: 'failed' }, data: { status: 'pending', error: null } });
    if (count === 0) return res.status(409).send({ message: 'There are no failed messages to resend.' });
    await prisma.smsCampaign.update({ where: { id }, data: { status: 'sending', completedAt: null } });
    void runCampaign(id);
    return { retrying: count };
  });
}


