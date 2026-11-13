import type { Prisma } from '@prisma/client';
import { allocateSalesToBatches } from '@/services/production';

type OrderLine = { menuItemId: string; quantity: number; price?: number };

type DeductOptions = {
  userId: string;
  receiptNo: string;
};

function aggregateQuantities(lines: OrderLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.menuItemId, (totals.get(line.menuItemId) || 0) + line.quantity);
  }
  return totals;
}

export async function deductStockForOrder(
  tx: Prisma.TransactionClient,
  orderLines: OrderLine[],
  opts: DeductOptions,
): Promise<void> {
  if (orderLines.length === 0) return;

  const menuQtyById = aggregateQuantities(orderLines);
  const menuItemIds = [...menuQtyById.keys()];

  const menuItems = await tx.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, name: true, stockLevel: true, batchYield: true },
  });
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  const unavailableMenuIds: string[] = [];
  for (const [menuItemId, qty] of menuQtyById) {
    const menuItem = menuById.get(menuItemId);
    if (!menuItem) continue;

    const trackedStock = menuItem.batchYield ? (menuItem.stockLevel ?? 0) : menuItem.stockLevel;
    if (trackedStock === null) continue;

    if (trackedStock < qty) {
      throw new Error(
        menuItem.batchYield
          ? `INSUFFICIENT_STOCK:${menuItem.name} (cook a batch first)`
          : `INSUFFICIENT_STOCK:${menuItem.name}`,
      );
    }
    if (trackedStock - qty <= 0) {
      unavailableMenuIds.push(menuItemId);
    }
  }

  await Promise.all(
    [...menuQtyById.entries()]
      .filter(([menuItemId]) => {
        const menuItem = menuById.get(menuItemId);
        if (!menuItem) return false;
        if (menuItem.batchYield) return true;
        return menuItem.stockLevel !== null;
      })
      .map(([menuItemId, qty]) =>
        tx.menuItem.update({
          where: { id: menuItemId },
          data: { stockLevel: { decrement: qty } },
        }),
      ),
  );

  if (unavailableMenuIds.length > 0) {
    await tx.menuItem.updateMany({
      where: { id: { in: unavailableMenuIds } },
      data: { isAvailable: false },
    });
  }

  await allocateSalesToBatches(tx, orderLines);

  const batchMenuIds = menuItemIds.filter((id) => {
    const menuItem = menuById.get(id);
    return menuItem?.batchYield;
  });

  if (batchMenuIds.length === menuItemIds.length) return;

  const legacyMenuIds = menuItemIds.filter((id) => !menuById.get(id)?.batchYield);
  if (legacyMenuIds.length === 0) return;

  const recipes = await tx.menuItemIngredient.findMany({
    where: { menuItemId: { in: legacyMenuIds } },
    include: { inventoryItem: { select: { id: true, name: true, stockLevel: true } } },
  });

  if (recipes.length === 0) return;

  const recipesByMenuId = new Map<string, typeof recipes>();
  for (const recipe of recipes) {
    const list = recipesByMenuId.get(recipe.menuItemId) || [];
    list.push(recipe);
    recipesByMenuId.set(recipe.menuItemId, list);
  }

  const ingredientTotals = new Map<string, { qty: number; name: string }>();
  for (const [menuItemId, lineQty] of menuQtyById) {
    if (menuById.get(menuItemId)?.batchYield) continue;
    for (const recipe of recipesByMenuId.get(menuItemId) || []) {
      const needed = recipe.quantity * lineQty;
      const existing = ingredientTotals.get(recipe.inventoryItemId);
      if (existing) {
        existing.qty += needed;
      } else {
        ingredientTotals.set(recipe.inventoryItemId, {
          qty: needed,
          name: recipe.inventoryItem.name,
        });
      }
    }
  }

  if (ingredientTotals.size === 0) return;

  const inventoryIds = [...ingredientTotals.keys()];
  const inventoryItems = await tx.inventoryItem.findMany({
    where: { id: { in: inventoryIds } },
    select: { id: true, name: true, stockLevel: true },
  });
  const inventoryById = new Map(inventoryItems.map((i) => [i.id, i]));

  for (const [inventoryItemId, { qty, name }] of ingredientTotals) {
    const item = inventoryById.get(inventoryItemId);
    if (!item) continue;
    if (item.stockLevel < qty) {
      throw new Error(`INSUFFICIENT_INGREDIENT:${name}`);
    }
  }

  await tx.stockMovement.createMany({
    data: [...ingredientTotals.entries()].map(([inventoryItemId, { qty }]) => ({
      inventoryItemId,
      type: 'OUT',
      quantity: qty,
      reason: 'usage',
      reference: opts.receiptNo,
      notes: 'Auto-deducted from POS sale',
      userId: opts.userId,
    })),
  });

  await Promise.all(
    [...ingredientTotals.entries()].map(([inventoryItemId, { qty }]) =>
      tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { stockLevel: { decrement: qty } },
      }),
    ),
  );
}

/**
 * Reverse of deductStockForOrder, for lines taken off an order that never left the kitchen
 * (an invoice edited down or deleted). Returns dish stock, un-sells cooked batches (newest first)
 * and puts recipe ingredients back with an IN movement so the store ledger stays balanced.
 */
export async function returnStockForOrder(
  tx: Prisma.TransactionClient,
  orderLines: OrderLine[],
  opts: DeductOptions,
): Promise<void> {
  const menuQtyById = aggregateQuantities(orderLines.filter((l) => l.quantity > 0));
  if (menuQtyById.size === 0) return;
  const menuItemIds = [...menuQtyById.keys()];

  const menuItems = await tx.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, stockLevel: true, batchYield: true, price: true },
  });
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  for (const [menuItemId, qty] of menuQtyById) {
    const menuItem = menuById.get(menuItemId);
    if (!menuItem) continue;
    if (menuItem.batchYield || menuItem.stockLevel !== null) {
      await tx.menuItem.update({
        where: { id: menuItemId },
        data: { stockLevel: { increment: qty }, isAvailable: true },
      });
    }
    if (!menuItem.batchYield) continue;
    let remaining = qty;
    const batches = await tx.productionBatch.findMany({
      where: { menuItemId, soldQuantity: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
    });
    for (const batch of batches) {
      if (remaining <= 0) break;
      const back = Math.min(remaining, batch.soldQuantity);
      await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          soldQuantity: batch.soldQuantity - back,
          soldAmount: Math.max(0, batch.soldAmount - back * menuItem.price),
          status: 'active',
        },
      });
      remaining -= back;
    }
  }

  const legacyMenuIds = menuItemIds.filter((id) => menuById.has(id) && !menuById.get(id)!.batchYield);
  if (legacyMenuIds.length === 0) return;
  const recipes = await tx.menuItemIngredient.findMany({ where: { menuItemId: { in: legacyMenuIds } } });
  const ingredientTotals = new Map<string, number>();
  for (const recipe of recipes) {
    const lineQty = menuQtyById.get(recipe.menuItemId) || 0;
    ingredientTotals.set(recipe.inventoryItemId, (ingredientTotals.get(recipe.inventoryItemId) || 0) + recipe.quantity * lineQty);
  }
  if (ingredientTotals.size === 0) return;

  await tx.stockMovement.createMany({
    data: [...ingredientTotals.entries()].map(([inventoryItemId, quantity]) => ({
      inventoryItemId,
      type: 'IN',
      quantity,
      reason: 'return',
      reference: opts.receiptNo,
      notes: 'Returned: taken off an invoice',
      userId: opts.userId,
    })),
  });
  await Promise.all(
    [...ingredientTotals.entries()].map(([inventoryItemId, quantity]) =>
      tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { stockLevel: { increment: quantity } } }),
    ),
  );
}
