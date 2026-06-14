// Lineamientos de comunicación coach-deportista basados en metodología profesional:
// • Saludo personalizado que crea vínculo individual
// • Propósito claro en las primeras líneas (el atleta lee entre entrenamientos)
// • Contenido específico y accionable (no genérico)
// • Sabiduría de coaching contextual al tipo de mensaje
// • Llamada a la acción concreta
// • Cierre que refuerza identidad de equipo

export interface ComunicadoTipo {
  id: string;
  emoji: string;
  label: string;
  descripcion: string;
  placeholder: string;
  asunto: string;
  apertura: string;
  contextoCoaching: string;
  llamadaAccion: string;
  cierre: string;
}

export const COMUNICADO_TIPOS: ComunicadoTipo[] = [
  {
    id: 'motivacional',
    emoji: '🔥',
    label: 'Motivacional',
    descripcion: 'Inspirar, reconocer esfuerzo y mantener el compromiso del equipo',
    placeholder: 'Ej: El equipo ha completado las 3 semanas más duras del plan y quiero reconocer su dedicación y recordarles por qué están aquí...',
    asunto: '🔥 Un mensaje de tu coach',
    apertura: 'Te escribo con algo que llevo tiempo queriendo decirte.',
    contextoCoaching: 'Los resultados en el running no se construyen en un día — se construyen en los días en los que NO tienes ganas pero vas de todas formas. Esa disciplina silenciosa es lo que separa al corredor promedio del corredor que alcanza sus metas.',
    llamadaAccion: 'Esta semana, cuando el cuerpo pida parar, recuerda por qué empezaste. Confía en el proceso y en el trabajo que ya hemos hecho juntos.',
    cierre: '¡Vamos con todo, equipo JTZ!',
  },
  {
    id: 'tecnico',
    emoji: '📋',
    label: 'Técnico',
    descripcion: 'Instrucciones de sesión, técnica de carrera o carga de entrenamiento',
    placeholder: 'Ej: Esta semana el trabajo principal es fartlek 20min a ritmo percibido 7/10, seguido de 4 strides de 100m. Enfocarse en cadencia alta y no en velocidad...',
    asunto: '📋 Instrucciones de entrenamiento — Léelo antes de tu sesión',
    apertura: 'Quiero que llegues a tu próxima sesión con todo claro. Lee esto con calma.',
    contextoCoaching: 'La diferencia entre un entrenamiento ordinario y uno extraordinario no está en el esfuerzo bruto — está en la intención. Ejecuta cada repetición con foco técnico: postura erguida, cadera adelantada, brazos relajados. Cuando la forma se rompe, es la señal de reducir intensidad, no de ignorarla.',
    llamadaAccion: 'Si durante la sesión algo se siente diferente a lo habitual — dolor articular, mareo, ritmo cardíaco inusualmente alto — detente y avísame. El mejor atleta es el que sabe cuándo parar.',
    cierre: '¡A entrenar con cabeza!',
  },
  {
    id: 'carrera',
    emoji: '🏁',
    label: 'Prep. Carrera',
    descripcion: 'Comunicación previa a competencia: logística, estrategia y mental',
    placeholder: 'Ej: El domingo es la Serial Ensenada, salida a las 7am en el Parque Revolución. Estrategia: primeros 3km conservador, segunda mitad progresar. Llevar número visible...',
    asunto: '🏁 Todo listo para la carrera — Información importante',
    apertura: '¡Se acerca el momento que llevamos meses preparando! Quiero que tengas todo claro.',
    contextoCoaching: 'El cuerpo ya tiene el entrenamiento. Lo que decides en el día de la carrera es la mentalidad. Arranca conservador — siempre es mejor negative split que salir rápido y sufrir en el último tercio. Confía en lo que hemos trabajado: la preparación está hecha.',
    llamadaAccion: 'Protocolo de la noche anterior: cena ligera que conozcas bien (sin experimentar), hidratación constante, ropa y accesorios listos, dormir temprano aunque el nervio no deje. El descanso es parte del rendimiento.',
    cierre: '¡Tú puedes, JTZ puede!',
  },
  {
    id: 'reconocimiento',
    emoji: '🌟',
    label: 'Reconocimiento',
    descripcion: 'Felicitar logros, mejoras de marca o consistencia destacada',
    placeholder: 'Ej: Quiero reconocer que este mes completaron el 95% de las sesiones planificadas, algo que pocas personas logran. Eso merece un reconocimiento específico...',
    asunto: '🌟 Reconocimiento merecido — Palabras de tu coach',
    apertura: 'Te escribo porque hay algo importante que quiero que sepas.',
    contextoCoaching: 'El progreso deportivo tiene dos caras: los resultados que se ven (tiempos, distancias, podios) y los que no se ven (la disciplina diaria, el sacrificio silencioso, la mentalidad). Los segundos son los que hacen posibles los primeros.',
    llamadaAccion: 'Guarda esto en tu memoria cuando el entrenamiento se ponga difícil. Ese momento de duda es exactamente cuando los buenos corredores se convierten en grandes corredores.',
    cierre: 'Con orgullo de coach,',
  },
  {
    id: 'ajuste',
    emoji: '⚡',
    label: 'Ajuste de Plan',
    descripcion: 'Cambios de horario, sesión cancelada o modificación al plan semanal',
    placeholder: 'Ej: Movemos el entrenamiento del martes al miércoles 6am por la lluvia prevista. La sesión de fuerza del jueves se cancela esta semana para dar más recuperación antes del long run...',
    asunto: '⚡ Cambio en el plan — Léelo hoy',
    apertura: 'Necesito informarte de un ajuste al plan. Lee esto con atención.',
    contextoCoaching: 'Los ajustes al plan no son fracasos — son parte de un entrenamiento inteligente. Los mejores coaches del mundo modifican planes constantemente en función de la recuperación, el clima, la carga acumulada y el estado del atleta. La flexibilidad táctica protege el objetivo estratégico.',
    llamadaAccion: 'Por favor confirma que recibiste y entendiste este mensaje. Si el cambio te genera algún conflicto de agenda, escríbeme directamente y encontramos una solución.',
    cierre: 'Gracias por tu comprensión y adaptabilidad,',
  },
  {
    id: 'recordatorio',
    emoji: '📅',
    label: 'Recordatorio',
    descripcion: 'Aviso de próxima sesión grupal, evento o fecha importante',
    placeholder: 'Ej: Mañana sábado tenemos el long run grupal a las 6:00am en el Parque Revolución. Ruta de 18km, ritmo conversacional. Llevar hidratación para más de 1hr...',
    asunto: '📅 Recordatorio — Mañana te esperamos',
    apertura: 'Te mando este aviso para que llegues preparado/a y puntual.',
    contextoCoaching: 'La puntualidad en el deporte no es solo una cuestión de respeto al grupo — es parte de la mentalidad profesional del atleta. Un corredor que llega listo y a tiempo hace mejor entrenamiento, reduce el riesgo de lesión y contagia energía positiva al equipo.',
    llamadaAccion: 'Prepara todo esta noche: ropa, calzado, hidratación, y si el horario lo requiere, algo ligero para comer antes. Llega 10 minutos antes de la hora indicada.',
    cierre: '¡Te esperamos mañana!',
  },
  {
    id: 'bienvenida',
    emoji: '🤝',
    label: 'Bienvenida',
    descripcion: 'Recibir nuevos integrantes al equipo JTZ',
    placeholder: 'Ej: Nos alegra mucho que hayas decidido unirte a JTZ. Somos un equipo de corredores con diferentes niveles y el objetivo común de mejorar. El primer entrenamiento es el sábado...',
    asunto: '🤝 ¡Bienvenido/a a JTZ Running Club!',
    apertura: '¡Es un placer enorme darte la bienvenida a la familia JTZ!',
    contextoCoaching: 'En JTZ creemos que cada corredor/a tiene un potencial único que vale la pena descubrir. Mi trabajo como coach no es empujarte a límites irreales — es acompañarte a descubrir lo que realmente eres capaz de lograr, respetando tu cuerpo, tu tiempo y tus objetivos personales.',
    llamadaAccion: 'En los próximos días recibirás información sobre tu plan de entrenamiento personalizado. Mientras tanto, si tienes preguntas sobre logística, niveles o cualquier duda, escríbeme directamente — estoy aquí para eso.',
    cierre: '¡Bienvenido/a a donde perteneces!',
  },
  {
    id: 'general',
    emoji: '📢',
    label: 'General',
    descripcion: 'Cualquier comunicado importante para el equipo',
    placeholder: 'Ej: Quiero comunicar que a partir del mes que viene cambiaremos el día de entrenamiento grupal del martes al miércoles para facilitar la asistencia del equipo...',
    asunto: '📢 Comunicado importante — Coach JTZ',
    apertura: 'Quiero compartirte un mensaje importante. Léelo con atención.',
    contextoCoaching: 'La comunicación clara entre coach y atleta es una de las bases del rendimiento deportivo. Por eso me aseguro de mantenerte siempre informado/a de todo lo que impacta tu preparación.',
    llamadaAccion: 'Si tienes alguna pregunta, duda o comentario sobre este mensaje, no dudes en contactarme. Mi objetivo es que siempre tengas claridad sobre tu proceso.',
    cierre: 'Un abrazo deportivo,',
  },
];

export function generarComunicado(
  tipo: ComunicadoTipo,
  idea: string,
): { asunto: string; cuerpo: string } {
  // Formatear la idea: capitalizar primera letra, asegurar que termina con punto
  const ideaTrim = idea.trim();
  const ideaFormateada = ideaTrim.charAt(0).toUpperCase() + ideaTrim.slice(1);
  const ideaConPunto = ideaFormateada.endsWith('.') || ideaFormateada.endsWith('!') || ideaFormateada.endsWith('?')
    ? ideaFormateada
    : ideaFormateada + '.';

  const cuerpo =
`Hola {nombre},

${tipo.apertura}

${ideaConPunto}

${tipo.contextoCoaching}

${tipo.llamadaAccion}

${tipo.cierre}
El Coach`;

  return { asunto: tipo.asunto, cuerpo };
}
