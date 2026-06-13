export interface Runner {
  id: number;
  userId: number;
  nombre: string;
  apellido: string;
  telefono?: string;
  ciudad: string;
  estado: string;
  fechaNacimiento?: string;
  nivel: 'principiante' | 'intermedio' | 'avanzado' | 'elite';
  activo: boolean;
  notas?: string;
  createdAt: string;
  user?: { email: string };
  memberships?: Membership[];
  payments?: Payment[];
}

export interface TrainingPlan {
  id: number;
  nombre: string;
  descripcion?: string;
  duracionSemanas: number;
  nivel: string;
  objetivo?: string;
  activo: boolean;
  createdAt: string;
  _count?: { asignaciones: number; semanas: number };
}

export interface TrainingWeek {
  id: number;
  planId: number;
  numeroSemana: number;
  descripcion?: string;
  dias: TrainingDay[];
}

export interface TrainingDay {
  id: number;
  diaSemana: string;
  tipo: string;
  distanciaKm?: number;
  duracionMin?: number;
  descripcion?: string;
  intensidad?: string;
}

export interface Event {
  id: number;
  nombre: string;
  tipo: 'carrera' | 'trail' | 'entrenamiento' | 'social';
  descripcion?: string;
  fecha: string;
  lugar: string;
  ciudad: string;
  distanciaKm?: number;
  cupoMaximo?: number;
  precio: number;
  activo: boolean;
  _count?: { registros: number };
}

export interface Payment {
  id: number;
  runnerId: number;
  concepto: string;
  monto: number;
  moneda: string;
  estado: 'pendiente' | 'pagado' | 'vencido';
  fechaVencimiento?: string;
  fechaPago?: string;
  notas?: string;
  createdAt: string;
  runner?: { nombre: string; apellido: string };
}

export interface Membership {
  id: number;
  runnerId: number;
  tipo: string;
  precio: number;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
}

export interface Product {
  id: number;
  nombre: string;
  descripcion?: string;
  tipo: 'jersey' | 'short' | 'accesorio' | 'calzado';
  precio: number;
  costo: number;
  stock: number;
  talla?: string;
  color?: string;
  imagen?: string | null;
  activo: boolean;
}

export interface Order {
  id: number;
  runnerId: number;
  estado: 'pendiente' | 'pagado' | 'entregado' | 'cancelado';
  total: number;
  notas?: string;
  createdAt: string;
  runner?: { nombre: string; apellido: string };
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  productId: number;
  cantidad: number;
  precioUnit: number;
  product: Product;
}

export interface Announcement {
  id: number;
  titulo: string;
  contenido: string;
  tipo: 'general' | 'urgente' | 'entrenamiento' | 'evento';
  publicado: boolean;
  createdAt: string;
}

export interface CommunicationLog {
  id: number;
  runnerId: number;
  tipo: 'whatsapp' | 'email' | 'llamada' | 'presencial';
  direccion: 'entrante' | 'saliente';
  mensaje: string;
  createdAt: string;
}

export interface EventRegistration {
  id: number;
  eventId: number;
  runnerId: number;
  estado: string;
  pagado: boolean;
  createdAt: string;
  event: Event;
}

export interface AuthUser {
  id: number;
  email: string;
  role: 'coach' | 'runner';
  runner?: Runner;
}
