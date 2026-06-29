import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';

async function seed() {
  console.log('──Seeding database──');

  // ── Default admin ──────────────────────────────────────────────────────────
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    || 'admin@smartpos.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const adminName     = process.env.SEED_ADMIN_NAME     || 'System Admin';

  const existing = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.admin.create({ data: { name: adminName, email: adminEmail, password: hashed } });
    console.log(`Admin created - email: ${adminEmail}  password: ${adminPassword}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  // ── Sample Menu Items ─────────────────────────────────────
  const menuCount = await prisma.menuItem.count();
  if (menuCount === 0) {
    await prisma.menuItem.createMany({
      data: [
        { name: 'Ugali Beef', description: 'Ugali with beef stew and vegetables', price: 150, category: 'Lunch' },
        { name: 'Chapati Beans', description: 'Two chapatis with bean stew', price: 100,  category: 'Lunch' },
        { name: 'Tea & Mandazi', description: 'Hot tea with two mandazis',   price: 50, category: 'Breakfast' },
      ],
    });
    console.log('Sample menu items seeded');
  }

  // ── Sample staff accounts (finance & restaurant) ───────────────────────────
  const staffAccounts = [
    { email: 'finance@smartpos.com', password: 'Finance@12345', name: 'Finance Officer', role: 'finance' },
    { email: 'restaurant@smartpos.com', password: 'Restaurant@12345', name: 'Cafeteria Staff', role: 'restaurant' },
  ];

  for (const acct of staffAccounts) {
    const exists = await prisma.user.findUnique({ where: { email: acct.email } });
    if (!exists) {
      const hashed = await bcrypt.hash(acct.password, 10);
      await prisma.user.create({
        data: { name: acct.name, email: acct.email, password: hashed, role: acct.role, status: 'approved' },
      });
      console.log(`${acct.role} user created - email: ${acct.email}  password: ${acct.password}`);
    }
  }

  // ── Sample parent & student ────────────────────────────────────────────────
  const parentEmail = 'parent@smartpos.com';
  let parent = await prisma.parent.findUnique({ where: { email: parentEmail } });
  if (!parent) {
    const hashed = await bcrypt.hash('Parent@12345', 10);
    parent = await prisma.parent.create({
      data: { name: 'Jane Parent', email: parentEmail, phone: '0712345678', password: hashed },
    });
    console.log('Parent created - email: parent@smartpos.com  password: Parent@12345');
  }

  const studentRegNo = 'STU001';
  const existingStudent = await prisma.student.findUnique({ where: { regNo: studentRegNo } });
  if (!existingStudent) {
    const hashed = await bcrypt.hash('Student@12345', 10);
    await prisma.student.create({
      data: {
        name: 'John Student',
        regNo: studentRegNo,
        phone: '0722334455',
        gender: 'Male',
        password: hashed,
        walletBalance: 500,
        parentId: parent.id,
      },
    });
    console.log('Student created - regNo: STU001  password: Student@12345  wallet: KES 500');
  }

  console.log('\nSeed complete!\n');
  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
