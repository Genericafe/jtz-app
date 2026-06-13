import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Remove accents so emails don't have special characters
function toEmailSlug(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function main() {
  // Si el coach ya existe, no re-crear nada (evita duplicar datos en cada deploy)
  const coachExists = await prisma.user.findUnique({ where: { email: 'coach@jtz.mx' } });
  if (coachExists) {
    console.log('✅ Coach ya existe — seed omitido');
    return;
  }

  const coachPassword = await bcrypt.hash('coach123', 10);

  const coach = await prisma.user.upsert({
    where: { email: 'coach@jtz.mx' },
    update: {},
    create: {
      email: 'coach@jtz.mx',
      password: coachPassword,
      role: 'coach',
      runner: {
        create: {
          nombre: 'Jorge',
          apellido: 'Torres',
          ciudad: 'Tijuana',
          nivel: 'elite',
          notas: 'Coach principal del equipo JTZ',
        },
      },
    },
  });

  console.log('Coach creado:', coach.email);

  const runners = [
    { nombre: 'Ana', apellido: 'García', nivel: 'intermedio', telefono: '664-100-0001' },
    { nombre: 'Luis', apellido: 'Martínez', nivel: 'avanzado', telefono: '664-100-0002' },
    { nombre: 'María', apellido: 'López', nivel: 'principiante', telefono: '664-100-0003' },
    { nombre: 'Carlos', apellido: 'Hernández', nivel: 'intermedio', telefono: '664-100-0004' },
    { nombre: 'Sofía', apellido: 'Ramírez', nivel: 'avanzado', telefono: '664-100-0005' },
    { nombre: 'Diego', apellido: 'Torres', nivel: 'principiante', telefono: '664-100-0006' },
    { nombre: 'Valeria', apellido: 'Flores', nivel: 'intermedio', telefono: '664-100-0007' },
    { nombre: 'Andrés', apellido: 'Ruiz', nivel: 'elite', telefono: '664-100-0008' },
  ];

  for (const r of runners) {
    const pwd = await bcrypt.hash('runner123', 10);
    await prisma.user.upsert({
      where: { email: `${toEmailSlug(r.nombre)}.${toEmailSlug(r.apellido)}@jtz.mx` },
      update: {},
      create: {
        email: `${toEmailSlug(r.nombre)}.${toEmailSlug(r.apellido)}@jtz.mx`,
        password: pwd,
        role: 'runner',
        runner: { create: { ...r, ciudad: 'Tijuana' } },
      },
    });
  }

  console.log(`${runners.length} corredores creados`);

  const plan = await prisma.trainingPlan.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nombre: 'Plan Base 10K - 8 Semanas',
      descripcion: 'Plan para corredores que buscan completar su primer 10K',
      duracionSemanas: 8,
      nivel: 'principiante',
      objetivo: '10K',
    },
  });

  console.log('Plan creado:', plan.nombre);

  await prisma.event.createMany({
    data: [
      {
        nombre: 'Carrera Nocturna Tijuana 2024',
        tipo: 'carrera',
        descripcion: 'Carrera nocturna por el bulevar de la ciudad',
        fecha: new Date('2024-08-15T20:00:00'),
        lugar: 'Bulevar Agua Caliente',
        ciudad: 'Tijuana',
        distanciaKm: 10,
        cupoMaximo: 500,
        precio: 350,
      },
      {
        nombre: 'Trail Sierra de Juárez',
        tipo: 'trail',
        descripcion: 'Trail de montaña con vistas increíbles a la sierra',
        fecha: new Date('2024-09-22T07:00:00'),
        lugar: 'Sierra de Juárez, Tecate',
        ciudad: 'Tecate',
        distanciaKm: 21,
        cupoMaximo: 150,
        precio: 550,
      },
      {
        nombre: 'Entrenamiento Grupal Playas',
        tipo: 'entrenamiento',
        descripcion: 'Sesión de entrenamiento en la costa',
        fecha: new Date('2024-07-06T07:00:00'),
        lugar: 'Playas de Tijuana',
        ciudad: 'Tijuana',
        distanciaKm: 5,
        precio: 0,
      },
    ],
  });

  console.log('Eventos creados');

  await prisma.product.createMany({
    data: [
      { nombre: 'Jersey JTZ 2024 - Hombre', tipo: 'jersey', precio: 450, costo: 200, stock: 20, color: 'Naranja/Negro', talla: 'M' },
      { nombre: 'Jersey JTZ 2024 - Mujer', tipo: 'jersey', precio: 450, costo: 200, stock: 15, color: 'Naranja/Negro', talla: 'S' },
      { nombre: 'Short JTZ Performance', tipo: 'short', precio: 280, costo: 120, stock: 25, color: 'Negro' },
      { nombre: 'Gorra JTZ Running', tipo: 'accesorio', precio: 180, costo: 70, stock: 30, color: 'Naranja' },
      { nombre: 'Calcetas Compresión', tipo: 'accesorio', precio: 120, costo: 55, stock: 40 },
    ],
  });

  console.log('Productos creados');

  await prisma.announcement.createMany({
    data: [
      {
        titulo: 'Bienvenidos a la temporada 2024',
        contenido: 'Arrancamos la temporada con mucha energía. Este año tenemos grandes metas para el equipo. ¡Vamos JTZ!',
        tipo: 'general',
      },
      {
        titulo: 'Entrenamiento sábado 7am - Playas',
        contenido: 'Este sábado nos reunimos en la glorieta de Playas de Tijuana a las 7:00am. Llevar agua y ropa deportiva. ¡No falten!',
        tipo: 'entrenamiento',
      },
      {
        titulo: 'Uniformes 2024 disponibles',
        contenido: 'Ya están disponibles los nuevos uniformes JTZ 2024. Precio especial para miembros activos. Contáctame para apartar el tuyo.',
        tipo: 'urgente',
      },
    ],
  });

  console.log('Anuncios creados');
  console.log('\n✅ Seed completado. Credenciales de acceso:');
  console.log('  Coach: coach@jtz.mx / coach123');
  console.log('  Corredor ejemplo: ana.garcia@jtz.mx / runner123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
