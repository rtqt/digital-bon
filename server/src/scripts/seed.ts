/**
 * Seed script — run with: npm run seed
 * Creates a demo cafe, roles, staff, categories, and products
 * so the system can be demoed immediately after install.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { Cafe } from '../models/cafe.model';
import { Role } from '../models/role.model';
import { User } from '../models/user.model';
import { Category, Product } from '../models/product.model';
import { Order } from '../models/order.model';
import { Shift } from '../models/shift.model';
import { connectDB } from '../startup';

const PERMISSIONS = {
  CASHIER: ['CREATE_ORDER', 'SETTLE_ORDER', 'REQUEST_VOID', 'APPROVE_VOID', 'REJECT_VOID', 'DIRECT_VOID', 'RESOLVE_CASH', 'INITIATE_RECONCILIATION', 'AMEND_ORDER'],
  BARISTA: ['ACKNOWLEDGE_PRINT'],
  WAITRESS: ['CREATE_ORDER', 'REQUEST_VOID'],
  ADMIN: ['CREATE_ORDER', 'SETTLE_ORDER', 'REQUEST_VOID', 'APPROVE_VOID', 'REJECT_VOID', 'DIRECT_VOID', 'RESOLVE_CASH', 'INITIATE_RECONCILIATION', 'AMEND_ORDER', 'UNLOCK_VOID', 'MANAGE_MENU', 'MANAGE_STAFF', 'VIEW_ANALYTICS', 'CAFE_ADMIN'],
};

async function seed() {
  await connectDB();

  // Clean existing data
  await Promise.all([
    Cafe.deleteMany({}),
    Role.deleteMany({}),
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Shift.deleteMany({}),
  ]);

  console.log('🌱 Seeding DigitalBon demo data...\n');

  // 1. Cafe
  const cafe = await Cafe.create({
    name: 'Yegna Bunna ☕',
    code: 'YEGNA',
    shortageAlertThreshold: 0,
    declarationGapAlertThreshold: 100,
    tables: ['T1', 'T2', 'T3', 'VIP-1', 'OUTSIDE-1', 'OUTSIDE-2'],
  });
  const cafeId = cafe._id;
  console.log(`✅ Cafe: ${cafe.name} (${cafeId}) Code: ${cafe.code}`);

  // 2. Roles
  const superAdminRole = await Role.create({ name: 'Super Admin', permissions: ['SYSTEM_ADMIN'], scope: 'SYSTEM' });
  const adminRole = await Role.create({ cafeId, name: 'Cafe Admin', permissions: PERMISSIONS.ADMIN, scope: 'CAFE' });
  const cashierRole = await Role.create({ cafeId, name: 'Cashier', permissions: PERMISSIONS.CASHIER, scope: 'STATION' });
  const baristaRole = await Role.create({ cafeId, name: 'Barista', permissions: PERMISSIONS.BARISTA, scope: 'STATION' });
  const waitressRole = await Role.create({ cafeId, name: 'Waitress', permissions: PERMISSIONS.WAITRESS, scope: 'STATION' });
  console.log('✅ Roles: SuperAdmin, Admin, Cashier, Barista, Waitress');

  // 3. Staff (PIN is the 4-digit number shown)
  const staff = [
    { name: 'Abebe (Admin)',    roleId: adminRole._id,   pin: '1234' },
    { name: 'Tigist (Cashier)', roleId: cashierRole._id, pin: '2222' },
    { name: 'Dawit (Barista)',  roleId: baristaRole._id, pin: '3333' },
    { name: 'Hana (Waitress)',  roleId: waitressRole._id, pin: '4444' },
    { name: 'Sara (Waitress)',  roleId: waitressRole._id, pin: '5555' },
  ];

  for (const s of staff) {
    const pinHash = await bcrypt.hash(s.pin, 10);
    await User.create({ cafeId, ...s, pinHash });
  }

  const superAdminPin = process.env.SUPER_ADMIN_PIN || '9999';
  const superAdminPinHash = await bcrypt.hash(superAdminPin, 10);
  await User.create({
    name: 'Super Admin',
    roleId: superAdminRole._id,
    pinHash: superAdminPinHash,
  });

  console.log('✅ Staff:');
  staff.forEach((s) => console.log(`   ${s.name} — PIN: ${s.pin}`));
  console.log(`   Super Admin — PIN: ${superAdminPin}`);

  // 4. Categories + Products
  const catCoffee = await Category.create({ cafeId, name: 'Coffee', order: 1 });
  const catTea = await Category.create({ cafeId, name: 'Tea & Infusions', order: 2 });
  const catFood = await Category.create({ cafeId, name: 'Food', order: 3 });
  const catCold = await Category.create({ cafeId, name: 'Cold Drinks', order: 4 });

  await Product.insertMany([
    // Coffee
    { cafeId, categoryId: catCoffee._id, name: 'Macchiato', price: 60, cost: 20, isAvailable: true },
    { cafeId, categoryId: catCoffee._id, name: 'Espresso', price: 55, cost: 18, isAvailable: true },
    { cafeId, categoryId: catCoffee._id, name: 'Cappuccino', price: 75, cost: 25, isAvailable: true },
    { cafeId, categoryId: catCoffee._id, name: 'Latte', price: 85, cost: 28, isAvailable: true },
    { cafeId, categoryId: catCoffee._id, name: 'Americano', price: 65, cost: 20, isAvailable: true },
    { cafeId, categoryId: catCoffee._id, name: 'Ethiopian Filter', price: 50, cost: 15, isAvailable: true },
    // Tea
    { cafeId, categoryId: catTea._id, name: 'Ginger Tea', price: 40, cost: 10, isAvailable: true },
    { cafeId, categoryId: catTea._id, name: 'Mint Tea', price: 40, cost: 10, isAvailable: true },
    { cafeId, categoryId: catTea._id, name: 'Cinnamon Tea', price: 45, cost: 12, isAvailable: true },
    // Food
    { cafeId, categoryId: catFood._id, name: 'Firfir', price: 120, cost: 50, isAvailable: true },
    { cafeId, categoryId: catFood._id, name: 'Toasted Sandwich', price: 90, cost: 35, isAvailable: true },
    { cafeId, categoryId: catFood._id, name: 'Cake Slice', price: 80, cost: 30, isAvailable: true },
    { cafeId, categoryId: catFood._id, name: 'Pastry', price: 60, cost: 22, isAvailable: true },
    // Cold
    { cafeId, categoryId: catCold._id, name: 'Lemon Juice', price: 70, cost: 20, isAvailable: true },
    { cafeId, categoryId: catCold._id, name: 'Mango Juice', price: 80, cost: 25, isAvailable: true },
    { cafeId, categoryId: catCold._id, name: 'Water (500ml)', price: 25, cost: 10, isAvailable: true },
  ]);

  console.log('\n✅ Menu: 16 products across 4 categories');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Seed complete!\n');
  console.log(`Cafe ID: ${cafeId}`);
  console.log(`Cafe Code: ${cafe.code}`);
  console.log('\nLogin PINs:');
  staff.forEach((s) => console.log(`  ${s.name}: ${s.pin}`));
  console.log(`  Super Admin: ${superAdminPin}`);
  console.log('\nUse the Cafe Code instead of CAFE_ID on the login screens.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
