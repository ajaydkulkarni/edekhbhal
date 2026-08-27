import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({
    where: { code: "STARTER" },
    update: {},
    create: { code: "STARTER", name: "Starter", maxUsers: 5, maxProperties: 1, maxWorkAreas: 25, monthlyPriceCents: 0 }
  });
  await prisma.plan.upsert({
    where: { code: "PROFESSIONAL" },
    update: {},
    create: { code: "PROFESSIONAL", name: "Professional", maxUsers: 50, maxProperties: 10, maxWorkAreas: 500, monthlyPriceCents: 4900 }
  });
  await prisma.plan.upsert({
    where: { code: "ENTERPRISE" },
    update: {},
    create: { code: "ENTERPRISE", name: "Enterprise", monthlyPriceCents: 0 }
  });
}

main().finally(() => prisma.$disconnect());
