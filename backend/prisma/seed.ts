import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';

const DEFAULT_PASSWORD = '12345678';

type CsvStudent = {
  name: string;
  regNo: string;
  walletBalance: number;
  category: 'regular' | 'sponsored';
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseWallet(raw: string): number {
  const cleaned = raw.replace(/\*\*/g, '').replace(/KSh\s*/gi, '').replace(/,/g, '').trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function parseCategory(raw: string): 'regular' | 'sponsored' {
  return raw.trim().toLowerCase() === 'sponsored' ? 'sponsored' : 'regular';
}

function loadStudentsFromCsv(): CsvStudent[] {
  const csvPath = path.join(__dirname, '..', 'student.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const students: CsvStudent[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Rank,')) continue;

    const cols = parseCsvLine(trimmed);
    if (cols.length < 4) continue;

    const [, name, regNo, walletRaw, categoryRaw] = cols;
    if (!name || !regNo) continue;

    students.push({
      name: name.trim(),
      regNo: regNo.trim().toUpperCase(),
      walletBalance: parseWallet(walletRaw),
      category: parseCategory(categoryRaw),
    });
  }

  return students;
}

async function seed() {
  console.log('──Seeding database──');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── Default admin ──────────────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@smartpos.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME || 'System Admin';

  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.admin.create({ data: { name: adminName, email: adminEmail, password: hashed } });
    console.log(`Admin created - email: ${adminEmail}  password: ${adminPassword}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  // ── Default menu categories ─────────────────────────────────────────────────
  const defaultCategories = ['Breakfast', 'Lunch', 'Snack', 'Drink'];
  for (let i = 0; i < defaultCategories.length; i++) {
    const name = defaultCategories[i];
    await prisma.menuCategory.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    });
  }
  console.log('Menu categories seeded');

  // ── Sample Menu Items ─────────────────────────────────────────────────────
  const menuCount = await prisma.menuItem.count();
  if (menuCount === 0) {
    await prisma.menuItem.createMany({
      data: [
        { name: 'Ugali Beef', description: 'Ugali with beef stew and vegetables', price: 150, category: 'Lunch' },
        { name: 'Chapati Beans', description: 'Two chapatis with bean stew', price: 100, category: 'Lunch' },
        { name: 'Tea & Mandazi', description: 'Hot tea with two mandazis', price: 50, category: 'Breakfast' },
      ],
    });
    console.log('Sample menu items seeded');
  }

  // ── Sample staff accounts (finance & restaurant) ───────────────────────────
  const staffAccounts = [
    { email: 'finance@smartpos.com', name: 'Finance Officer', role: 'finance' },
    { email: 'restaurant@smartpos.com', name: 'Cafeteria Staff', role: 'restaurant' },
  ];

  for (const acct of staffAccounts) {
    const exists = await prisma.user.findUnique({ where: { email: acct.email } });
    if (!exists) {
      await prisma.user.create({
        data: {
          name: acct.name,
          email: acct.email,
          password: passwordHash,
          role: acct.role,
          status: 'approved',
        },
      });
      console.log(`${acct.role} user created - email: ${acct.email}  password: ${DEFAULT_PASSWORD}`);
    }
  }

  // ── Default parent (for demos / manual linking) ───────────────────────────
  const parentPhone = '0712345678';
  let parent = await prisma.parent.findUnique({ where: { phone: parentPhone } });
  if (!parent) {
    parent = await prisma.parent.create({
      data: {
        name: 'Jane Parent',
        email: 'parent@smartpos.com',
        phone: parentPhone,
        password: passwordHash,
      },
    });
    console.log(`Parent created - phone: ${parentPhone}  password: ${DEFAULT_PASSWORD}`);
  }

  // ── Students from student.csv ─────────────────────────────────────────────
  const csvStudents = loadStudentsFromCsv();
  let created = 0;
  let updated = 0;

  for (const row of csvStudents) {
    const existing = await prisma.student.findUnique({ where: { regNo: row.regNo } });
    if (existing) {
      await prisma.student.update({
        where: { regNo: row.regNo },
        data: {
          name: row.name,
          walletBalance: row.walletBalance,
          category: row.category,
          password: passwordHash,
        },
      });
      updated++;
    } else {
      await prisma.student.create({
        data: {
          name: row.name,
          regNo: row.regNo,
          gender: 'male',
          password: passwordHash,
          walletBalance: row.walletBalance,
          category: row.category,
        },
      });
      created++;
    }
  }

  const regularCount = csvStudents.filter((s) => s.category === 'regular').length;
  const sponsoredCount = csvStudents.filter((s) => s.category === 'sponsored').length;
  console.log(
    `Students seeded from student.csv: ${csvStudents.length} total (${regularCount} regular, ${sponsoredCount} sponsored)`,
  );
  console.log(`  created: ${created}, updated: ${updated}, password: ${DEFAULT_PASSWORD}`);

  console.log('\nSeed complete!\n');
  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
