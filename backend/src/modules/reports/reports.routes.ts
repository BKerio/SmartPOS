import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middleware/auth';

/*
 * GET /api/reports/daily?date=YYYY-MM-DD
 * One day's sales and consumption (East Africa Time): what was sold and how it was paid, what the kitchen
 * used to cook it (from recipe deductions and issues), what was bought, and the resulting gross margin.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const EAT_OFFSET_MS = 3 * 3600_000;

function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00+03:00`);
  return { start, end: new Date(start.getTime() + 86400_000) };
}
function todayEat() {
  return new Date(Date.now() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

async function salesTotal(start: Date, end: Date) {
  const r = await prisma.posTransaction.aggregate({ _sum: { totalAmount: true }, _count: true, where: { status: 'completed', createdAt: { gte: start, lt: end } } });
  return { total: r._sum.totalAmount ?? 0, count: r._count };
}

export default async function reportRoutes(app: App) {
  app.get('/daily', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'finance', 'restaurant'].includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const q = req.query as Record<string, string>;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : todayEat();
    const { start, end } = dayBounds(date);
    const prev = dayBounds(new Date(start.getTime() - 86400_000 + EAT_OFFSET_MS).toISOString().slice(0, 10));
    const range = { gte: start, lt: end };

    try {
      const [transactions, items, movements, batches, invoicesRaised, invoicePayments, expenses, previous] = await Promise.all([
        prisma.posTransaction.findMany({
          where: { status: 'completed', createdAt: range },
          select: { createdAt: true, totalAmount: true, paymentMethod: true, studentId: true, cashierId: true },
        }),
        prisma.posTransactionItem.findMany({
          where: { transaction: { status: 'completed', createdAt: range } },
          select: { quantity: true, price: true, menuItem: { select: { id: true, name: true, category: true } } },
        }),
        prisma.stockMovement.findMany({
          where: { createdAt: range },
          select: {
            type: true, reason: true, quantity: true, unitCost: true, issuedTo: true,
            inventoryItem: { select: { id: true, name: true, unit: true, unitCost: true } },
          },
        }),
        prisma.productionBatch.findMany({
          where: { createdAt: range },
          select: { yieldQuantity: true, expectedRevenue: true, soldQuantity: true, soldAmount: true, menuItem: { select: { id: true, name: true } } },
        }),
        prisma.salesInvoice.aggregate({ _count: true, _sum: { totalAmount: true }, where: { createdAt: range, status: { not: 'cancelled' } } }),
        prisma.invoicePayment.findMany({ where: { createdAt: range }, select: { amount: true, method: true } }),
        prisma.expense.aggregate({ _sum: { amount: true }, _count: true, where: { date: range } }),
        salesTotal(prev.start, prev.end),
      ]);

      // ── Sales ──
      const byMethod = new Map<string, { method: string; count: number; amount: number }>();
      const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, amount: 0, count: 0 }));
      let salesAmount = 0;
      for (const t of transactions) {
        salesAmount += t.totalAmount;
        const m = byMethod.get(t.paymentMethod) ?? { method: t.paymentMethod, count: 0, amount: 0 };
        m.count++; m.amount += t.totalAmount; byMethod.set(t.paymentMethod, m);
        const h = new Date(t.createdAt.getTime() + EAT_OFFSET_MS).getUTCHours();
        byHour[h].amount += t.totalAmount; byHour[h].count++;
      }
      const byItem = new Map<string, { menuItemId: string; name: string; category: string; quantity: number; revenue: number }>();
      for (const it of items) {
        const k = it.menuItem.id;
        const row = byItem.get(k) ?? { menuItemId: k, name: it.menuItem.name, category: it.menuItem.category, quantity: 0, revenue: 0 };
        row.quantity += it.quantity; row.revenue += it.quantity * it.price; byItem.set(k, row);
      }

      // ── Consumption (stock out) and purchases (stock in) ──
      const consumption = new Map<string, { inventoryItemId: string; name: string; unit: string; quantity: number; cost: number; reasons: Record<string, number> }>();
      const purchases = new Map<string, { inventoryItemId: string; name: string; unit: string; quantity: number; cost: number }>();
      let consumptionCost = 0;
      let purchasesCost = 0;
      for (const m of movements) {
        const unitCost = m.unitCost ?? m.inventoryItem.unitCost ?? 0;
        const cost = m.quantity * unitCost;
        const key = m.inventoryItem.id;
        if (m.type === 'OUT') {
          const row = consumption.get(key) ?? { inventoryItemId: key, name: m.inventoryItem.name, unit: m.inventoryItem.unit, quantity: 0, cost: 0, reasons: {} };
          row.quantity += m.quantity; row.cost += cost; row.reasons[m.reason] = (row.reasons[m.reason] ?? 0) + m.quantity;
          consumption.set(key, row);
          consumptionCost += cost;
        } else if (m.reason === 'return') {
          // Ingredients put back when an invoice was edited down or deleted: undo that usage.
          const row = consumption.get(key) ?? { inventoryItemId: key, name: m.inventoryItem.name, unit: m.inventoryItem.unit, quantity: 0, cost: 0, reasons: {} };
          row.quantity -= m.quantity; row.cost -= cost; row.reasons.usage = (row.reasons.usage ?? 0) - m.quantity;
          consumption.set(key, row);
          consumptionCost -= cost;
        } else if (m.reason === 'purchase') {
          const row = purchases.get(key) ?? { inventoryItemId: key, name: m.inventoryItem.name, unit: m.inventoryItem.unit, quantity: 0, cost: 0 };
          row.quantity += m.quantity; row.cost += cost; purchases.set(key, row);
          purchasesCost += cost;
        }
      }

      const invoicedAmount = invoicesRaised._sum.totalAmount ?? 0;
      const revenue = salesAmount + invoicedAmount;
      const collectedOnInvoices = invoicePayments.reduce((s, p) => s + p.amount, 0);

      return res.send({
        date,
        summary: {
          salesAmount: round2(salesAmount),
          salesCount: transactions.length,
          previousSalesAmount: round2(previous.total),
          invoicedAmount: round2(invoicedAmount),
          invoiceCount: invoicesRaised._count,
          collectedOnInvoices: round2(collectedOnInvoices),
          revenue: round2(revenue),
          consumptionCost: round2(consumptionCost),
          grossMargin: round2(revenue - consumptionCost),
          marginPercent: revenue > 0 ? round2(((revenue - consumptionCost) / revenue) * 100) : null,
          purchasesCost: round2(purchasesCost),
          expenses: round2(expenses._sum.amount ?? 0),
          expenseCount: expenses._count,
          studentSales: transactions.filter((t) => t.studentId).length,
          guestSales: transactions.filter((t) => !t.studentId).length,
        },
        paymentMethods: [...byMethod.values()].map((m) => ({ ...m, amount: round2(m.amount) })).sort((a, b) => b.amount - a.amount),
        invoicePaymentMethods: Object.entries(
          invoicePayments.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.method]: (acc[p.method] ?? 0) + p.amount }), {}),
        ).map(([method, amount]) => ({ method, amount: round2(amount) })),
        hourly: byHour.filter((h) => h.hour >= 5 && h.hour <= 22).map((h) => ({ ...h, amount: round2(h.amount) })),
        itemsSold: [...byItem.values()].map((r) => ({ ...r, revenue: round2(r.revenue) })).sort((a, b) => b.revenue - a.revenue),
        consumption: [...consumption.values()].filter((r) => r.quantity > 0.0001).map((r) => ({ ...r, quantity: round2(r.quantity), cost: round2(r.cost) })).sort((a, b) => b.cost - a.cost),
        purchases: [...purchases.values()].map((r) => ({ ...r, quantity: round2(r.quantity), cost: round2(r.cost) })).sort((a, b) => b.cost - a.cost),
        production: batches.map((b) => ({
          menuItemId: b.menuItem.id, name: b.menuItem.name, portions: b.yieldQuantity,
          expectedRevenue: round2(b.expectedRevenue), soldPortions: b.soldQuantity, soldAmount: round2(b.soldAmount),
        })),
      });
    } catch (error) {
      req.log.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
}
