import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${key}`;
}

const PLANS = [
  { title: "برنزی", subtitle: "مناسب مصرف روزمره و شبکه‌های اجتماعی", volumeGb: 30, days: 30, deviceLimit: 1, priceToman: 95_000, sortOrder: 1 },
  { title: "نقره‌ای", subtitle: "پرفروش‌ترین پلن؛ مناسب خانواده", volumeGb: 60, days: 30, deviceLimit: 2, priceToman: 155_000, sortOrder: 2, isPopular: true },
  { title: "طلایی", subtitle: "برای دانلود و تماشای ویدیو", volumeGb: 100, days: 60, deviceLimit: 3, priceToman: 265_000, sortOrder: 3 },
  { title: "نامحدود", subtitle: "بدون محدودیت حجم، یک‌ماهه", volumeGb: 0, days: 30, deviceLimit: 2, priceToman: 390_000, sortOrder: 4 },
];

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin12345";

  const admin = await db.user.upsert({
    where: { email },
    update: { role: "admin" },
    create: { email, passwordHash: hashPassword(password), name: "مدیر سایت", role: "admin" },
  });
  console.log(`✓ حساب مدیر: ${admin.email}`);

  const planCount = await db.plan.count();
  if (planCount === 0) {
    for (const plan of PLANS) await db.plan.create({ data: plan });
    console.log(`✓ ${PLANS.length} پلن نمونه ساخته شد`);
  }

  const discountCount = await db.discount.count();
  if (discountCount === 0) {
    await db.discount.create({
      data: { code: "WELCOME10", type: "percent", value: 10, maxUses: 100, isActive: true },
    });
    console.log("✓ کد تخفیف نمونه WELCOME10 ساخته شد");
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
