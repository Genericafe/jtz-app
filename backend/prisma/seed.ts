import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash('coach123', 10);

  await prisma.user.upsert({
    where: { email: 'coach@jtz.mx' },
    update: {},
    create: {
      email: 'coach@jtz.mx',
      password: hashed,
      role: 'coach',
      runner: {
        create: {
          nombre: 'Jorge',
          apellido: 'Torres',
          ciudad: 'Tijuana',
          nivel: 'elite',
        },
      },
    },
  });

  console.log('✅ Coach listo: coach@jtz.mx / coach123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
