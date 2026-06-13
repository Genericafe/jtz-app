/**
 * Utilidades de texto para español mexicano.
 * Corrección ortográfica (RAE / DEM) + generación de textos para redes sociales.
 * 100% client-side, sin API externa.
 */

// ─── Correcciones ortográficas frecuentes en español mexicano ─────────────────
// Formato: [patrón_incorrecto, corrección]
// Solo patrones de alta confianza (sin ambigüedad de contexto)
const CORRECCIONES: [RegExp, string][] = [
  // Tildes obligatorias por regla — RAE
  [/\bmas\b(?!\s*(o\s*menos|bien|tarde|temprano|nunca|siempre|allá))/g, 'más'],
  [/\btu\b(?=\s+(eres|estás|tienes|puedes|quieres|debes|vas|vendrás|podrás))/g, 'tú'],
  [/\bel\b(?=\s+(que|cual|cual|quien))/g, 'él'],
  [/\bsi\b(?=\s+(puedo|puede|quiero|quiere|voy|vas|viene|sabes|sabe|es\s+posible))/g, 'sí'],
  [/\bde\b(?=\s+acuerdo)/g, 'de'],

  // Errores comunes de teclado / autocorrect
  [/\bq\s+/g, 'que '],
  [/\bxq\b/g, 'por qué'],
  [/\bxke\b/gi, 'porque'],
  [/\bdnd\b/gi, 'donde'],
  [/\btb\b/gi, 'también'],
  [/\btmb\b/gi, 'también'],
  [/\bpq\b/gi, 'porque'],
  [/\bslds\b/gi, 'saludos'],
  [/\bntp\b/gi, 'no te preocupes'],

  // Signos de puntuación y tipografía — RAE / ORTOGRAFÍA ESPAÑOLA
  [/\.\.\./g, '…'],              // Puntos suspensivos → carácter tipográfico
  [/--/g, '—'],                  // Guión doble → raya tipográfica
  [/([!?])\1+/g, '$1'],          // !!! o ??? → solo uno (RAE: máximo uno)
  [/([¡¿])\1+/g, '$1'],         // ¡¡ o ¿¿ → solo uno

  // Comillas — RAE recomienda «angulares» en español
  [/"([^"]+)"/g, '«$1»'],

  // Errores de espaciado con puntuación
  [/\s+([.,;:!?…»\)])/g, '$1'],         // espacio antes de puntuación → eliminar
  [/([.,;:!?…«\(])(?=[^\s\d\n])/g, '$1 '], // falta espacio después de puntuación

  // Doble espacio
  [/  +/g, ' '],

  // Líneas en blanco excesivas (máx 2)
  [/\n{3,}/g, '\n\n'],
];

// ─── Correcciones de mayúsculas ───────────────────────────────────────────────

function capitalizarOraciones(texto: string): string {
  // Capitaliza la primera letra tras un punto, signo de exclamación o interrogación
  return texto
    .replace(/(^|\.\s+|!\s+|\?\s+|…\s+)([a-záéíóúüñ])/g,
      (_match, separador, letra) => separador + letra.toUpperCase())
    .replace(/^[a-záéíóúüñ]/, l => l.toUpperCase());
}

// ─── Formateo para redes sociales ─────────────────────────────────────────────

function formateoRedesSociales(texto: string): string {
  // 1. Saltos de línea dobles entre párrafos para mejor legibilidad
  let r = texto.replace(/\. ([A-ZÁÉÍÓÚÜÑ])/g, '.\n\n$1');

  // 2. Asegurar punto final si no hay puntuación al terminar
  r = r.trimEnd();
  if (r.length > 0 && !/[.!?…»]$/.test(r)) r += '.';

  // 3. Limpiar espacios al inicio de cada línea
  r = r.split('\n').map(l => l.trimStart()).join('\n');

  return r;
}

// ─── Función principal exportada ──────────────────────────────────────────────

// ─── Generador de texto de invitación para eventos ───────────────────────────

interface DatosEvento {
  nombre:      string;
  tipo:        string;
  lugar:       string;
  ciudad:      string;
  fecha:       string; // ISO o datetime-local string
  distanciaKm: string;
  precio:      string;
  descripcion: string;
}

const TIPO_CONFIG: Record<string, { emoji: string; verbo: string; hashtags: string[]; motivacion: string[] }> = {
  carrera: {
    emoji: '🏃',
    verbo: 'correr',
    hashtags: ['#Running', '#Carrera', '#RunningMexico', '#JTZRunning'],
    motivacion: [
      '¡Ven a demostrar de qué estás hecho!',
      '¡Prepárate para romper tus marcas!',
      '¡La adrenalina te espera en la línea de salida!',
    ],
  },
  trail: {
    emoji: '🏔️',
    verbo: 'conquistar la montaña',
    hashtags: ['#TrailRunning', '#Trail', '#MontañaMexico', '#JTZRunning'],
    motivacion: [
      '¡La montaña te llama!',
      '¡Ven a conquistar cada kilómetro de terreno!',
      '¡Barro, pendientes y adrenalina te esperan!',
    ],
  },
  entrenamiento: {
    emoji: '💪',
    verbo: 'entrenar',
    hashtags: ['#Entrenamiento', '#TrainingDay', '#JTZRunning', '#RunningClub'],
    motivacion: [
      '¡No hay excusas, hay resultados!',
      '¡Tu mejor versión empieza aquí!',
      '¡Entrena duro, compite fuerte!',
    ],
  },
  social: {
    emoji: '🎉',
    verbo: 'celebrar juntos',
    hashtags: ['#JTZRunning', '#RunningFamily', '#Comunidad'],
    motivacion: [
      '¡La familia JTZ te espera!',
      '¡Comparte, ríe y disfruta con el equipo!',
      '¡Porque correr también es celebrar!',
    ],
  },
};

function formatearFecha(fechaStr: string): string {
  if (!fechaStr) return '';
  try {
    const fecha = new Date(fechaStr);
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dia     = diasSemana[fecha.getDay()];
    const numero  = fecha.getDate();
    const mes     = meses[fecha.getMonth()];
    const año     = fecha.getFullYear();
    const horas   = fecha.getHours();
    const minutos = fecha.getMinutes().toString().padStart(2, '0');
    const periodo = horas >= 12 ? 'PM' : 'AM';
    const hora12  = horas % 12 || 12;
    return `${dia} ${numero} de ${mes} de ${año} · ${hora12}:${minutos} ${periodo}`;
  } catch {
    return fechaStr;
  }
}

export function generarTextoEvento(datos: DatosEvento): string {
  const cfg = TIPO_CONFIG[datos.tipo] ?? TIPO_CONFIG.carrera;
  const motivacion = cfg.motivacion[Math.floor(Math.random() * cfg.motivacion.length)];
  const fechaFormateada = formatearFecha(datos.fecha);

  const lineas: string[] = [];

  // Encabezado
  lineas.push(`${cfg.emoji} ¡${datos.nombre.toUpperCase()}!`);
  lineas.push('');

  // Detalles del evento
  if (fechaFormateada) lineas.push(`📅 ${fechaFormateada}`);
  if (datos.lugar)     lineas.push(`📍 ${datos.lugar}${datos.ciudad ? `, ${datos.ciudad}` : ''}`);
  if (datos.distanciaKm && Number(datos.distanciaKm) > 0)
                       lineas.push(`🏁 Distancia: ${datos.distanciaKm} km`);
  const precio = Number(datos.precio);
  if (!isNaN(precio))  lineas.push(`💰 Inscripción: ${precio === 0 ? '¡Gratis!' : `$${precio.toLocaleString('es-MX')} MXN`}`);
  lineas.push('');

  // Cuerpo motivacional
  lineas.push(motivacion);
  lineas.push('¡Cupo limitado — no te quedes fuera! Inscríbete con tu coach.');
  lineas.push('');

  // Hashtags
  const ciudad = datos.ciudad ? `#${datos.ciudad.replace(/\s+/g, '')}` : '';
  const hashtags = [...cfg.hashtags, ciudad].filter(Boolean).join(' ');
  lineas.push(hashtags);

  return lineas.join('\n');
}

export function formatearTextoES(texto: string): string {
  let r = texto;

  // 1. Aplicar correcciones léxicas y tipográficas
  for (const [patron, correccion] of CORRECCIONES) {
    r = r.replace(patron, correccion);
  }

  // 2. Capitalización de oraciones
  r = capitalizarOraciones(r);

  // 3. Formato para redes sociales
  r = formateoRedesSociales(r);

  // 4. Trim final
  r = r.trim();

  return r;
}
