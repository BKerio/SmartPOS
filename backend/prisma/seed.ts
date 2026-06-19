import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';

async function seed() {
  console.log('🌱  Seeding database...');

  // ── Default admin ──────────────────────────────────────────────────────────
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    || 'admin@smartpos.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const adminName     = process.env.SEED_ADMIN_NAME     || 'System Admin';

  const existing = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.admin.create({ data: { name: adminName, email: adminEmail, password: hashed } });
    console.log(`✅  Admin created — email: ${adminEmail}  password: ${adminPassword}`);
  } else {
    console.log(`ℹ️   Admin already exists: ${adminEmail}`);
  }

  // ── Sample properties (only if empty) ─────────────────────────────────────
  const propCount = await prisma.property.count();
  if (propCount === 0) {
    await prisma.property.createMany({
      data: [
        { title: 'Studio Apartment — Block A', description: 'Near campus, fully furnished', price: 15000, location: 'Block A' },
        { title: 'Shared Room — Block B',       description: '2-person sharing, meals included', price: 8000,  location: 'Block B' },
        { title: 'Self-Contained Unit — C3',    description: 'Private bathroom & kitchenette',   price: 22000, location: 'Block C' },
      ],
    });
    console.log('✅  Sample properties seeded');
  }

  // ── Sample marketplace items (only if empty) ───────────────────────────────
  const mktCount = await prisma.marketplaceItem.count();
  if (mktCount === 0) {
    await prisma.marketplaceItem.createMany({
      data: [
        { title: 'Study Desk',        description: 'Wooden desk, good condition', price: 3500 },
        { title: 'Mini Fridge',       description: '40L, barely used',            price: 7000 },
        { title: 'Textbook Bundle',   description: 'Year 2 Engineering set',       price: 1200 },
      ],
    });
    console.log('✅  Sample marketplace items seeded');
  }

  console.log('\n🎉  Seed complete!\n');
  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error('❌  Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
