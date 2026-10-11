import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated-client/client';
import { requestPoolConfig } from './poolOptions';

const prismaClientSingleton = () => {
  const pool = new Pool(requestPoolConfig(process.env.DATABASE_URL));
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: [{ emit: 'stdout', level: 'error' }],
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

// La instancia base, SIN middleware aplicado aquí
export const basePrisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}
