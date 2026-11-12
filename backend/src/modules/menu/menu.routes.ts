import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/services/prisma';
import { MENU_IMAGES_BUCKET, getStorageConfigError, putPublicObject } from '@/services/storage';
import { ensureAuthenticated } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';
import { recordProduction } from '@/services/production';
import { ensureBatchStockTracking, getKitchenBoard } from '@/services/kitchenBoard';

function devErrorDetail(error: unknown): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return error instanceof Error ? error.message : String(error);
}

function canManageMenu(role: string | undefined): boolean {
  return !!role && ['admin', 'restaurant'].includes(role);
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type UploadedImage = { mimetype: string; buffer: Buffer };

/** Reads the multipart `image` file: null when none was sent, throws (with a user-facing message) for a bad file. */
async function readImageUpload(req: Req): Promise<UploadedImage | null> {
  if (!req.isMultipart()) return null;
  const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
  if (!file) return null;
  if (file.fieldname !== 'image') throw new Error('Unexpected field');
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    file.file.resume();
    throw new Error('Only jpg, png, and webp images are allowed');
  }
  let buffer: Buffer;
  try {
    buffer = await file.toBuffer();
  } catch (err: any) {
    if (err?.code === 'FST_REQ_FILE_TOO_LARGE') throw new Error('File too large');
    throw err;
  }
  // An oversized file can come back silently cut off at the limit rather than throwing.
  if (file.file.truncated) throw new Error('File too large');
  return { mimetype: file.mimetype, buffer };
}

// ─── GET /api/menu/display ────────────────────────────────────────────────────
// Public cafeteria menu for kiosks — same stock rules as staff POS
function isMenuItemVisible(item: {
  isAvailable: boolean;
  stockLevel: number | null;
  batchYield: number | null;
}): boolean {
  if (!item.isAvailable) return false;
  if (item.batchYield) return (item.stockLevel ?? 0) > 0;
  return item.stockLevel === null || item.stockLevel > 0;
}

export default async function menuRoutes(app: App) {

  app.get('/display', async (_req: Req, res: FastifyReply): Promise<any> => {
    try {
      const items = await prisma.menuItem.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          category: true,
          imageUrl: true,
          isAvailable: true,
          stockLevel: true,
          batchYield: true,
        },
      });
      const visible = items.filter(isMenuItemVisible);
      return res.send(visible);
    } catch (error) {
      console.error('GET /menu/display error:', error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/menu/categories ─────────────────────────────────────────────────
  app.get('/categories', { onRequest: ensureAuthenticated }, async (_req: Req, res: FastifyReply): Promise<any> => {
    try {
      const categories = await prisma.menuCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return res.send(categories);
    } catch (error) {
      console.error('GET /menu/categories error:', error);
      return res.status(500).send({
        message: 'Something went wrong',
        detail: devErrorDetail(error),
      });
    }
  });

  // ─── POST /api/menu/categories ────────────────────────────────────────────────
  app.post('/categories', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!canManageMenu(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(422).send({ message: 'Category name is required' });
    }

    try {
      const existing = await prisma.menuCategory.findUnique({ where: { name } });
      if (existing) {
        return res.status(409).send({ message: 'A category with this name already exists' });
      }

      const sortOrder = Number(req.body.sortOrder);
      const category = await prisma.menuCategory.create({
        data: {
          name,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        },
      });

      await logAuditEvent({
        eventType: 'menu_category_created',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Create Menu Category',
        description: `Added menu category "${name}"`,
        ipAddress: req.ip,
      });

      return res.status(201).send(category);
    } catch (error) {
      console.error('POST /menu/categories error:', error);
      return res.status(500).send({
        message: 'Something went wrong',
        detail: devErrorDetail(error),
      });
    }
  });

  // ─── PUT /api/menu/categories/:categoryId ─────────────────────────────────────
  app.put('/categories/:categoryId', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!canManageMenu(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const categoryId = req.params.categoryId as string;
    const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
    const sortOrder = req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined;

    if (name !== undefined && !name) {
      return res.status(422).send({ message: 'Category name cannot be empty' });
    }

    try {
      const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
      if (!existing) {
        return res.status(404).send({ message: 'Category not found' });
      }

      if (name && name !== existing.name) {
        const duplicate = await prisma.menuCategory.findUnique({ where: { name } });
        if (duplicate) {
          return res.status(409).send({ message: 'A category with this name already exists' });
        }
      }

      const category = await prisma.$transaction(async (tx) => {
        const updated = await tx.menuCategory.update({
          where: { id: categoryId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(sortOrder !== undefined && Number.isFinite(sortOrder) ? { sortOrder } : {}),
          },
        });

        if (name && name !== existing.name) {
          await tx.menuItem.updateMany({
            where: { category: existing.name },
            data: { category: name },
          });
        }

        return updated;
      });

      await logAuditEvent({
        eventType: 'menu_category_updated',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Update Menu Category',
        description: `Updated menu category "${existing.name}"${name && name !== existing.name ? ` to "${name}"` : ''}`,
        ipAddress: req.ip,
      });

      return res.send(category);
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'Category not found' });
      console.error('PUT /menu/categories/:categoryId error:', error);
      return res.status(500).send({
        message: 'Something went wrong',
        detail: devErrorDetail(error),
      });
    }
  });

  // ─── DELETE /api/menu/categories/:categoryId ──────────────────────────────────
  app.delete('/categories/:categoryId', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!canManageMenu(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const categoryId = req.params.categoryId as string;

    try {
      const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
      if (!existing) {
        return res.status(404).send({ message: 'Category not found' });
      }

      const itemCount = await prisma.menuItem.count({ where: { category: existing.name } });
      if (itemCount > 0) {
        return res.status(409).send({
          message: `Cannot delete category "${existing.name}" because ${itemCount} menu item(s) use it`,
        });
      }

      await prisma.menuCategory.delete({ where: { id: categoryId } });

      await logAuditEvent({
        eventType: 'menu_category_deleted',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Delete Menu Category',
        description: `Removed menu category "${existing.name}"`,
        ipAddress: req.ip,
      });

      return res.send({ message: 'Category deleted' });
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'Category not found' });
      console.error('DELETE /menu/categories/:categoryId error:', error);
      return res.status(500).send({
        message: 'Something went wrong',
        detail: devErrorDetail(error),
      });
    }
  });

  // ─── POST /api/menu/upload-image ──────────────────────────────────────────────
  app.post('/upload-image', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      if (!['admin', 'restaurant'].includes(req.user!.role)) {
        return res.status(403).send({ message: 'Not authorized' });
      }
      let image: UploadedImage | null;
      try {
        image = await readImageUpload(req);
      } catch (err: any) {
        return res.status(400).send({ message: err.message });
      }
      if (!image) {
        return res.status(422).send({ message: 'No image file provided' });
      }

      const configError = getStorageConfigError();
      if (configError) {
        console.error(configError);
        return res.status(503).send({
          message: 'Image upload is not configured on the server',
          detail: configError,
        });
      }

      const ext = image.mimetype.split('/')[1].replace('jpeg', 'jpg');
      const key = `${uuidv4()}.${ext}`;

      try {
        const url = await putPublicObject(MENU_IMAGES_BUCKET, key, image.buffer, image.mimetype);
        return res.send({ url });
      } catch (err: any) {
        console.error('Neon storage upload error:', err);
        return res.status(500).send({ message: 'Image upload failed', detail: err?.message });
      }
    } catch (err: any) {
      console.error('Upload image handler error:', err);
      return res.status(500).send({
        message: 'Something went wrong during image upload',
        detail: devErrorDetail(err),
      });
    }
  });

  // ─── GET /api/menu/kitchen-board ──────────────────────────────────────────────
  app.get('/kitchen-board', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    try {
      const board = await getKitchenBoard();
      return res.send(board);
    } catch (error) {
      console.error('GET /menu/kitchen-board error:', error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/menu/production-batches ───────────────────────────────────────
  app.get('/production-batches', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { menuItemId, status, limit } = req.query;
    const take = Math.min(Number(limit) || 100, 500);

    try {
      const batches = await prisma.productionBatch.findMany({
        where: {
          ...(menuItemId ? { menuItemId: String(menuItemId) } : {}),
          ...(status ? { status: String(status) } : {}),
        },
        include: {
          menuItem: { select: { id: true, name: true, price: true, batchYield: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });

      const enriched = batches.map((b) => ({
        ...b,
        remainingQuantity: Math.max(0, b.yieldQuantity - b.soldQuantity),
        remainingExpected: Math.max(0, b.expectedRevenue - b.soldAmount),
      }));

      return res.send(enriched);
    } catch (error) {
      console.error('GET /menu/production-batches error:', error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── POST /api/menu/:id/produce ─────────────────────────────────────────────
  app.post('/:id/produce', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!canManageMenu(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const menuItemId = req.params.id as string;
    const batchCount = Math.max(1, Math.floor(Number(req.body.batchCount) || 1));
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : undefined;

    try {
      const result = await prisma.$transaction(async (tx) =>
        recordProduction(tx, menuItemId, batchCount, req.user!.id, notes),
      );

      await logAuditEvent({
        eventType: 'production_batch',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Record production',
        description: `Produced ${result.yieldTotal} ${result.menuItem.name} (expected KES ${result.expectedRevenue.toLocaleString()})`,
        metadata: { batchId: result.batch.id, menuItemId },
        ipAddress: req.ip,
      });

      return res.status(201).send({
        batch: result.batch,
        yieldTotal: result.yieldTotal,
        expectedRevenue: result.expectedRevenue,
        menuItemName: result.menuItem.name,
        unitPrice: result.menuItem.price,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'MENU_ITEM_NOT_FOUND') {
        return res.status(404).send({ message: 'Menu item not found' });
      }
      if (message === 'BATCH_YIELD_REQUIRED') {
        return res.status(422).send({
          message: 'Set batch yield on the recipe first (e.g. 60 mandazis per batch)',
        });
      }
      if (message === 'RECIPE_REQUIRED') {
        return res.status(422).send({ message: 'Add recipe ingredients before recording production' });
      }
      if (message.startsWith('INSUFFICIENT_INGREDIENT')) {
        const name = message.split(':')[1];
        return res.status(422).send({
          message: name ? `Not enough ${name} in stock to cook this batch` : 'Insufficient ingredients',
        });
      }
      console.error('POST /menu/:id/produce error:', error);
      return res.status(500).send({ message: 'Failed to record production' });
    }
  });

  // ─── GET /api/menu ────────────────────────────────────────────────────────────
  app.get('/', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const isStaff = ['admin', 'restaurant', 'finance'].includes(req.user?.role ?? '');
      // Both lookups are independent: run them in parallel (one round trip instead of two).
      const [items, staffBoard] = await Promise.all([
        prisma.menuItem.findMany({ orderBy: { category: 'asc' } }),
        isStaff ? getKitchenBoard() : Promise.resolve(null),
      ]);

      const visibleItems = items.filter((item) => {
        if (!item.isAvailable) return false;
        if (item.batchYield) return (item.stockLevel ?? 0) > 0;
        return item.stockLevel === null || item.stockLevel > 0;
      });

      if (!isStaff || !staffBoard) {
        return res.send(visibleItems);
      }

      const board = staffBoard;
      const boardById = new Map(board.map((d) => [d.id, d]));

      const enriched = visibleItems.map((item) => {
        const kitchen = boardById.get(item.id);
        if (!kitchen) return item;
        return {
          ...item,
          batchYield: kitchen.batchYield,
          kitchenStats: {
            portionsReady: kitchen.portionsReady,
            canCookBatches: kitchen.canCookBatches,
            expectedPerBatch: kitchen.expectedPerBatch,
            activeSold: kitchen.totals.activeSold,
            activeRemaining: kitchen.totals.activeRemaining,
            activeExpected: kitchen.totals.activeExpected,
          },
        };
      });

      return res.send(enriched);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/menu/all ────────────────────────────────────────────────────────
  // Admin/Restaurant staff view including unavailable items
  app.get('/all', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }
    try {
      const items = await prisma.menuItem.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          ingredients: {
            include: {
              inventoryItem: { select: { id: true, name: true, unit: true, stockLevel: true } },
            },
          },
        },
      });
      return res.send(items);
    } catch (error) {
      console.error('GET /menu/all error:', error);
      return res.status(500).send({
        message: 'Something went wrong',
        detail: devErrorDetail(error),
      });
    }
  });

  // ─── POST /api/menu ───────────────────────────────────────────────────────────
  app.post('/', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { name, description, price, category, imageUrl, isAvailable, stockLevel, batchYield } = req.body;
    if (!name || !price || !category) {
      return res.status(422).send({ message: 'Name, price, and category are required' });
    }

    const parsedStock =
      stockLevel === undefined || stockLevel === null || stockLevel === ''
        ? null
        : Math.max(0, Math.floor(Number(stockLevel)));

    const parsedBatchYield =
      batchYield === undefined || batchYield === null || batchYield === ''
        ? null
        : Math.max(1, Math.floor(Number(batchYield)));

    try {
      const item = await prisma.menuItem.create({
        data: {
          name,
          description,
          price: Number(price),
          category,
          imageUrl,
          isAvailable: isAvailable ?? true,
          stockLevel: parsedStock,
          batchYield: parsedBatchYield,
        },
      });

      await logAuditEvent({
        eventType: 'menu_item_created',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Create Menu Item',
        description: `Added ${name} to the menu`,
        ipAddress: req.ip,
      });

      return res.status(201).send(item);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/menu/:id/ingredients ────────────────────────────────────────────
  app.get('/:id/ingredients', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }
    try {
      const rows = await prisma.menuItemIngredient.findMany({
        where: { menuItemId: req.params.id as string },
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true, stockLevel: true } },
        },
        orderBy: { inventoryItem: { name: 'asc' } },
      });
      return res.send(rows);
    } catch {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── PUT /api/menu/:id/ingredients ────────────────────────────────────────────
  app.put('/:id/ingredients', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const menuItemId = req.params.id as string;
    const { ingredients } = req.body;
    if (!Array.isArray(ingredients)) {
      return res.status(422).send({ message: 'ingredients array is required' });
    }

    try {
      const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
      if (!menuItem) return res.status(404).send({ message: 'Menu item not found' });

      const parsed = ingredients
        .map((row: any) => ({
          inventoryItemId: String(row.inventoryItemId || ''),
          quantity: Number(row.quantity),
        }))
        .filter((row) => row.inventoryItemId && row.quantity > 0);

      await prisma.$transaction([
        prisma.menuItemIngredient.deleteMany({ where: { menuItemId } }),
        ...(parsed.length > 0
          ? [
              prisma.menuItemIngredient.createMany({
                data: parsed.map((row) => ({
                  menuItemId,
                  inventoryItemId: row.inventoryItemId,
                  quantity: row.quantity,
                })),
              }),
            ]
          : []),
      ]);

      const menuWithYield = await prisma.menuItem.findUnique({
        where: { id: menuItemId },
        select: { batchYield: true },
      });
      if (menuWithYield?.batchYield) {
        await ensureBatchStockTracking(menuItemId, menuWithYield.batchYield);
      }

      const rows = await prisma.menuItemIngredient.findMany({
        where: { menuItemId },
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true, stockLevel: true } },
        },
        orderBy: { inventoryItem: { name: 'asc' } },
      });
      return res.send(rows);
    } catch {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── PUT /api/menu/:id ────────────────────────────────────────────────────────
  app.put('/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { name, description, price, category, imageUrl, isAvailable, stockLevel, batchYield } = req.body;

    try {
      const data: any = {};
      if (name) data.name = name;
      if (description !== undefined) data.description = description;
      if (price !== undefined) data.price = Number(price);
      if (category) data.category = category;
      if (imageUrl !== undefined) data.imageUrl = imageUrl;
      if (isAvailable !== undefined) data.isAvailable = isAvailable;
      if (stockLevel !== undefined) {
        data.stockLevel =
          stockLevel === null || stockLevel === ''
            ? null
            : Math.max(0, Math.floor(Number(stockLevel)));
        if (data.stockLevel !== null && data.stockLevel > 0 && isAvailable === undefined) {
          data.isAvailable = true;
        }
      }
      if (batchYield !== undefined) {
        data.batchYield =
          batchYield === null || batchYield === ''
            ? null
            : Math.max(1, Math.floor(Number(batchYield)));
      }

      const item = await prisma.menuItem.update({
        where: { id: req.params.id as string },
        data,
      });

      if (data.batchYield) {
        await ensureBatchStockTracking(item.id, data.batchYield);
      }

      return res.send(item);
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'Menu item not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── DELETE /api/menu/:id ─────────────────────────────────────────────────────
  app.delete('/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    try {
      const item = await prisma.menuItem.delete({ where: { id: req.params.id as string } });

      await logAuditEvent({
        eventType: 'menu_item_deleted',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Delete Menu Item',
        description: `Removed ${item.name} from the menu`,
        ipAddress: req.ip,
      });

      return res.send({ message: 'Menu item deleted' });
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'Menu item not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
}
