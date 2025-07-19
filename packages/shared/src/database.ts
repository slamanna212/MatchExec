import { PrismaClient } from './generated/client';

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    if (process.env.NODE_ENV === 'production') {
      prisma = new PrismaClient();
    } else {
      // In development, reuse connection to prevent exhausting database connections
      if (!global.__prisma) {
        global.__prisma = new PrismaClient();
      }
      prisma = global.__prisma;
    }
  }
  return prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
}

export { PrismaClient }; 