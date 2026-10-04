/** Datos ficticios del prototipo. No representan la sesión ni validaciones reales. */
export type VozDemo = {
  id: string;
  nombre: string;
  pais: string;
  idioma: string;
  genero: string;
  estilo: string;
  uso: string;
  descripcion: string;
  guardada: boolean;
  clonada?: boolean;
};
export type AgenteDemo = {
  id: string;
  nombre: string;
  objetivo: string;
  vozId: string;
  activo: boolean;
  etapas: string[];
};
export type EstadoCampana =
  "running" | "scheduled" | "paused" | "draft" | "blocked" | "completed";
export type CampanaDemo = {
  id: string;
  nombre: string;
  agenteId: string;
  segmentoId: string;
  estado: EstadoCampana;
  total: number;
  procesados: number;
  efectivos: number;
  reuniones: number;
  minutos: number;
  diario: number;
  hora: number;
  simultaneas: number;
  horario: string;
  actividad: string;
  inicio?: string;
  franja?: "laboral" | "manana";
  cumplimiento?: { rne: boolean; datos: boolean; minutos: boolean };
};
export type RelacionDemo = {
  tipo:
    | "agente"
    | "segmento"
    | "llamadas"
    | "calendario"
    | "proveedores"
    | "pipeline";
  id?: string;
};
export const VOCES_INICIALES: VozDemo[] = [
  {
    id: "valentina",
    nombre: "Valentina",
    pais: "Colombia",
    idioma: "Español",
    genero: "Femenina",
    estilo: "Cercana",
    uso: "Conversación",
    descripcion:
      "Clara y cálida. Una conversación natural para acompañar a tus clientes.",
    guardada: true,
  },
  {
    id: "mateo",
    nombre: "Mateo",
    pais: "Colombia",
    idioma: "Español",
    genero: "Masculina",
    estilo: "Profesional",
    uso: "Conversación",
    descripcion:
      "Serena y precisa. Ideal para explicar propuestas y resolver preguntas.",
    guardada: true,
  },
  {
    id: "isabel",
    nombre: "Isabel",
    pais: "España",
    idioma: "Español",
    genero: "Femenina",
    estilo: "Profesional",
    uso: "Narración",
    descripcion: "Expresiva y pausada, con una pronunciación clara y cuidada.",
    guardada: false,
  },
  {
    id: "santiago",
    nombre: "Santiago",
    pais: "México",
    idioma: "Español",
    genero: "Masculina",
    estilo: "Cercana",
    uso: "Conversación",
    descripcion:
      "Amable y directa. Da continuidad a cada conversación comercial.",
    guardada: false,
  },
  {
    id: "lucia",
    nombre: "Lucía",
    pais: "Argentina",
    idioma: "Español",
    genero: "Femenina",
    estilo: "Dinámica",
    uso: "Conversación",
    descripcion:
      "Ágil y expresiva. Para conversaciones con energía y personalidad.",
    guardada: false,
  },
  {
    id: "andres",
    nombre: "Andrés",
    pais: "Colombia",
    idioma: "Español",
    genero: "Masculina",
    estilo: "Serena",
    uso: "Narración",
    descripcion:
      "Tranquila y consistente. Acompaña explicaciones sin perder claridad.",
    guardada: false,
  },
];
export const AGENTES_INICIALES: AgenteDemo[] = [
  {
    id: "clara",
    nombre: "Clara, asistente comercial",
    objetivo: "Agendar una reunión",
    vozId: "valentina",
    activo: true,
    etapas: ["Contacto inicial", "Propuesta"],
  },
  {
    id: "seguimiento",
    nombre: "Asistente de seguimiento",
    objetivo: "Dar seguimiento a una propuesta",
    vozId: "mateo",
    activo: true,
    etapas: ["Propuesta", "Negociación"],
  },
  {
    id: "postventa",
    nombre: "Asistente posventa",
    objetivo: "Conocer la experiencia del cliente",
    vozId: "valentina",
    activo: false,
    etapas: ["Ganado"],
  },
];
export const SEGMENTOS_DEMO = [
  {
    id: "propuestas",
    nombre: "Propuestas pendientes",
    descripcion: "Oportunidades en Propuesta · Pipeline comercial",
    total: 120,
    excluidos: 8,
    elegibles: 112,
  },
  {
    id: "leads",
    nombre: "Leads por contactar",
    descripcion: "Leads nuevos con teléfono y consentimiento",
    total: 84,
    excluidos: 6,
    elegibles: 78,
  },
  {
    id: "demos",
    nombre: "Demos de esta semana",
    descripcion: "Clientes con demostración pendiente",
    total: 36,
    excluidos: 2,
    elegibles: 34,
  },
];
export const CAMPANAS_INICIALES: CampanaDemo[] = [
  {
    id: "reactivacion",
    nombre: "Seguimiento de propuestas",
    agenteId: "seguimiento",
    segmentoId: "propuestas",
    estado: "running",
    cumplimiento: { rne: true, datos: true, minutos: true },
    total: 112,
    procesados: 48,
    efectivos: 24,
    reuniones: 6,
    minutos: 72,
    diario: 50,
    hora: 20,
    simultaneas: 3,
    horario: "Lun–vie · 9:00 a. m. – 5:00 p. m.",
    actividad: "Hace 8 minutos",
  },
  {
    id: "bienvenida",
    nombre: "Primer contacto con leads",
    agenteId: "clara",
    segmentoId: "leads",
    estado: "scheduled",
    inicio: "2026-10-05T09:00:00-05:00",
    franja: "laboral",
    cumplimiento: { rne: true, datos: true, minutos: true },
    total: 78,
    procesados: 0,
    efectivos: 0,
    reuniones: 0,
    minutos: 0,
    diario: 50,
    hora: 20,
    simultaneas: 3,
    horario: "Lun–vie · 9:00 a. m. – 5:00 p. m.",
    actividad: "Programada · 5 oct, 9:00 a. m.",
  },
  {
    id: "confirmacion",
    nombre: "Confirmación de demos",
    agenteId: "clara",
    segmentoId: "demos",
    estado: "blocked",
    cumplimiento: { rne: false, datos: true, minutos: true },
    total: 34,
    procesados: 0,
    efectivos: 0,
    reuniones: 0,
    minutos: 0,
    diario: 20,
    hora: 10,
    simultaneas: 2,
    horario: "Lun–vie · 9:00 a. m. – 5:00 p. m.",
    actividad: "Falta verificar RNE",
  },
  {
    id: "renovacion",
    nombre: "Seguimiento de renovación",
    agenteId: "seguimiento",
    segmentoId: "propuestas",
    estado: "draft",
    cumplimiento: { rne: false, datos: false, minutos: false },
    total: 112,
    procesados: 0,
    efectivos: 0,
    reuniones: 0,
    minutos: 0,
    diario: 50,
    hora: 20,
    simultaneas: 3,
    horario: "Sin programar",
    actividad: "Borrador · sin programar",
  },
];
