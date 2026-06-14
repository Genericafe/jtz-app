import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // El seed NUNCA corre en producción — solo para setup inicial en desarrollo
  if (process.env.NODE_ENV === 'production') {
    console.log('Seed omitido en producción');
    return;
  }

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
          nombre: 'Jotaze',
          apellido: '',
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
