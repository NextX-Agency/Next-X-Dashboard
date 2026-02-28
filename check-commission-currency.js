const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const commissions = await prisma.commission.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      commissionAmount: true,
      createdAt: true,
      sale: {
        select: {
          id: true,
          totalAmount: true,
          currency: true
        }
      }
    }
  });

  console.log('Recent commissions:');
  console.table(commissions);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
