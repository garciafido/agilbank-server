import "reflect-metadata";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./prisma-test/client/client";

function createTestPrisma() {
  const adapter = new PrismaBetterSqlite3({
    url: "file:./prisma-test/test.db",
  });
  return new PrismaClient({ adapter });
}

beforeEach(async () => {
  // Limpiar datos antes de cada test
  const prisma = createTestPrisma();
  try {
    await prisma.$transaction([
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.product.deleteMany(),
      prisma.user.deleteMany(),
      prisma.tenant.deleteMany(),
    ]);
  } catch (error) {
    console.error("Error cleaning test database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
});

afterAll(async () => {
  // Limpiar datos después de todos los tests
  const prisma = createTestPrisma();
  try {
    await prisma.$transaction([
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.product.deleteMany(),
      prisma.user.deleteMany(),
      prisma.tenant.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
});
