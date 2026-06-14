import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface EventCtx {
  nombre: string;
  fecha: string;
  lugar: string;
  ciudad?: string;
  estado?: string;
  distanciaKm?: number | null;
  precio?: number;
}

function dias(fecha: string) {
  return differenceInDays(new Date(fecha), new Date());
}

function fechaLarga(fecha: string) {
  return format(new Date(fecha), "EEEE d 'de' MMMM 'a las' HH:mm 'hrs'", { locale: es });
}

function lugar(ev: EventCtx) {
  return [ev.lugar, ev.ciudad, ev.estado].filter(Boolean).join(', ');
}

export interface Plantilla {
  id: string;
  label: string;
  emoji: string;
  descripcion: string;
  generar: (ev: EventCtx) => { asunto: string; mensaje: string };
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'recordatorio',
    label: 'Recordatorio de carrera',
    emoji: '⏰',
    descripcion: 'Aviso de que el evento se acerca',
    generar: (ev) => {
      const d = dias(ev.fecha);
      const cuandoStr = d === 1 ? '¡es MAÑANA!' : d === 0 ? '¡es HOY!' : `es en ${d} días`;
      return {
        asunto: `⏰ Recordatorio — ${ev.nombre} ${cuandoStr}`,
        mensaje: `¡Hola corredor/a! 👋

Te recordamos que ${ev.nombre} ${cuandoStr.toLowerCase()}.

📅 Fecha: ${fechaLarga(ev.fecha)}
📍 Lugar: ${lugar(ev)}${ev.distanciaKm ? `\n🏁 Distancia: ${ev.distanciaKm} km` : ''}

Asegúrate de tener todo listo:
✅ Número de corredor
✅ Ropa y calzado adecuado
✅ Hidratación suficiente
✅ Buenas horas de descanso

¡Nos vemos en la salida! 💪

— Coach JTZ Running Club`,
      };
    },
  },
  {
    id: 'entrega_kit',
    label: 'Entrega de kit',
    emoji: '👕',
    descripcion: 'Instrucciones de entrega de número y camiseta',
    generar: (ev) => ({
      asunto: `👕 Entrega de kit — ${ev.nombre}`,
      mensaje: `¡Hola corredor/a! 👋

La entrega de kit para ${ev.nombre} se realizará el día previo al evento.

📦 ¿Qué incluye tu kit?
  • Número de corredor con chip
  • Camiseta oficial del evento
  • Bolsa del corredor

📍 Lugar de entrega: ${lugar(ev)}
📅 Evento: ${fechaLarga(ev.fecha)}

Recuerda traer:
🪪 Identificación oficial
📱 Comprobante de inscripción (pantalla o impreso)

Si tienes alguna duda, contáctanos con anticipación.

¡Ya falta poco! 🔥

— Coach JTZ Running Club`,
    }),
  },
  {
    id: 'animo',
    label: 'Mensaje de ánimo',
    emoji: '🔥',
    descripcion: 'Motivación pre-carrera para los corredores',
    generar: (ev) => {
      const d = dias(ev.fecha);
      return {
        asunto: `🔥 ¡${d <= 3 ? 'Ya casi es hora' : 'Tú puedes lograrlo'}! — ${ev.nombre}`,
        mensaje: `¡Hola corredor/a! 🙌

${d <= 1
  ? '¡El momento ha llegado! Mañana es el gran día.'
  : `Faltan ${d} días para ${ev.nombre} y queremos que sepas algo:`}

Cada kilómetro que entrenaste, cada madrugada que saliste a correr, cada vez que quisiste rendirte y no lo hiciste — todo eso te trajo hasta aquí.

📅 ${fechaLarga(ev.fecha)}
📍 ${lugar(ev)}${ev.distanciaKm ? `\n🏁 ${ev.distanciaKm} km de pura determinación` : ''}

Nuestros consejos finales:
💤 Descansa bien los días previos
🥗 Come ligero la noche anterior
💧 Hidrátate desde hoy
👟 No estrenes calzado el día del evento

¡El equipo JTZ corre contigo! 💚

— Coach JTZ Running Club`,
      };
    },
  },
  {
    id: 'logistica',
    label: 'Información logística',
    emoji: '📋',
    descripcion: 'Detalles de llegada, estacionamiento y horarios',
    generar: (ev) => ({
      asunto: `📋 Información importante — ${ev.nombre}`,
      mensaje: `¡Hola corredor/a! 👋

Queremos asegurarnos de que tengas toda la información necesaria para el día de ${ev.nombre}.

📅 Fecha y hora: ${fechaLarga(ev.fecha)}
📍 Lugar de salida: ${lugar(ev)}

⏰ Horarios importantes:
  • Apertura de área de corredores: 1 hora antes de la salida
  • Revisión de número y chip: 30 min antes
  • Salida oficial: según la hora registrada${ev.distanciaKm ? `\n  • Distancia: ${ev.distanciaKm} km` : ''}

🚗 Recomendaciones de llegada:
  • Llega con al menos 45 minutos de anticipación
  • Revisa opciones de estacionamiento cercanas
  • Considera llegar en transporte alternativo

⚠️ Recuerda:
  • Traer tu número de corredor visible
  • No se permitirá el acceso sin número asignado

Cualquier pregunta, escríbenos.

¡Nos vemos en la meta! 🏁

— Coach JTZ Running Club`,
    }),
  },
  {
    id: 'ultimo_aviso',
    label: 'Último aviso (24 hrs)',
    emoji: '🚨',
    descripcion: 'Comunicado de última hora antes del evento',
    generar: (ev) => ({
      asunto: `🚨 Último aviso — ${ev.nombre} ¡es mañana!`,
      mensaje: `¡Hola corredor/a! 🎽

¡MAÑANA ES EL DÍA! ${ev.nombre} está a horas de comenzar.

📅 ${fechaLarga(ev.fecha)}
📍 ${lugar(ev)}

✅ CHECKLIST PARA HOY:
  □ Kit listo: número, camiseta, chip
  □ Ropa y calzado preparados
  □ Hidratación y snacks en bolsa
  □ Dormir temprano esta noche
  □ Desayuno ligero mañana

🍽️ NUTRICIÓN:
  • Esta noche: cena ligera, rica en carbohidratos
  • Mañana: desayuno 2-3 horas antes de la carrera
  • No experimentes con comidas nuevas

💡 MENTALIDAD:
  Confía en tu entrenamiento. Estás listo/a.

¡El equipo JTZ está orgulloso de ti! 🌟

— Coach JTZ Running Club`,
    }),
  },
  {
    id: 'resultados',
    label: 'Resultados y agradecimiento',
    emoji: '🏅',
    descripcion: 'Felicitaciones post-evento a los participantes',
    generar: (ev) => ({
      asunto: `🏅 ¡Lo lograste! Gracias por correr ${ev.nombre}`,
      mensaje: `¡Hola corredor/a! 🎉

¡FELICIDADES! Completaste ${ev.nombre} y eso es algo de lo que debes estar muy orgulloso/a.

📍 ${lugar(ev)}${ev.distanciaKm ? `\n🏁 ${ev.distanciaKm} km conquistados` : ''}

Cada paso que diste en la carrera representa horas de entrenamiento, sacrificio y determinación. Eso no tiene precio.

🔄 RECUPERACIÓN (próximos días):
  • Hoy: hidratación y comida balanceada
  • Mañana: descanso activo (caminata suave)
  • Esta semana: sueño y alimentación nutritiva
  • Próxima semana: regresar al entrenamiento suave

📸 Comparte tus fotos y etiqueta a JTZ Running Club — ¡queremos celebrar contigo!

Ya pensamos en el próximo reto. ¡Estén atentos a nuestros próximos eventos!

Con orgullo de todo el equipo,
— Coach JTZ Running Club 💚`,
    }),
  },
];
