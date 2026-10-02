/**
 * Reglas puras de los avisos al miembro.
 * El arreglo vacio de allowed_types significa todos los eventos.
 * El centinela `ninguno` apaga el correo sin tocar la campana.
 */

export const EVENTOS_AVISO = [
  'tarea.asignada',
  'oportunidad.asignada',
  'oportunidad.etapa',
  'tarea.completada',
  'tarea.atrasada',
  'tarea.vence',
  'oportunidad.vence',
  'oportunidad.atrasada',
  'oportunidad.ganada',
  'oportunidad.perdida',
  'oportunidad.contacto',
  'caja.diferencia',
  'cartera.resumen',
  'inventario.cero',
  'inventario.bajo',
] as const;

export type EventoAviso = (typeof EVENTOS_AVISO)[number];

/** Eventos de la primera tanda. Una lista guardada con todos estos y ninguno nuevo deja los avisos nuevos prendidos. */
const EVENTOS_ANTERIORES: readonly EventoAviso[] = [
  'tarea.asignada',
  'oportunidad.asignada',
  'oportunidad.etapa',
  'tarea.completada',
  'tarea.atrasada',
  'tarea.vence',
  'oportunidad.vence',
  'oportunidad.atrasada',
];

export const GRUPOS_AVISO = {
  'tarea.asignada': ['tarea.asignada'],
  'oportunidad.asignada': ['oportunidad.asignada'],
  'oportunidad.etapa': ['oportunidad.etapa'],
  'tarea.completada': ['tarea.completada'],
  // El vencimiento de una tarea no sale por correo: ni el día, ni atrasada, ni cerca.
  // La campana sí. El correo de la tarea queda en la asignación y en la completada.
  vence: ['oportunidad.vence', 'oportunidad.atrasada'],
  'oportunidad.cierre': ['oportunidad.ganada', 'oportunidad.perdida'],
  'oportunidad.contacto': ['oportunidad.contacto'],
  'caja.diferencia': ['caja.diferencia'],
  'cartera.resumen': ['cartera.resumen'],
  inventario: ['inventario.cero', 'inventario.bajo'],
} as const;

export type GrupoAviso = keyof typeof GRUPOS_AVISO;

export type ClaseVencimiento = 'vence' | 'atrasada';

const CENTINELA_NINGUNO = 'ninguno';

/** Una tarea que vence, ya venció o está por vencer no gasta correo. La asignación sí. */
const EVENTOS_TAREA_SIN_CORREO = new Set<string>(['tarea.vence', 'tarea.atrasada']);

export function correoPermitido(
  allowed: string[] | null | undefined,
  evento: string,
  mute: boolean,
): boolean {
  if (EVENTOS_TAREA_SIN_CORREO.has(evento)) return false;
  if (mute) return false;
  if (!allowed || allowed.length === 0) return true;
  if (allowed.includes(CENTINELA_NINGUNO)) return false;
  return allowed.includes(evento);
}

export function gruposActivos(allowed: string[] | null | undefined): Record<GrupoAviso, boolean> {
  const claves = Object.keys(GRUPOS_AVISO) as GrupoAviso[];
  const activos = {} as Record<GrupoAviso, boolean>;
  const lista = allowed ?? [];
  const apagado = lista.includes(CENTINELA_NINGUNO);
  const todos = lista.length === 0;
  const nuevosYaElegidos = lista.some(
    (tipo) => (EVENTOS_AVISO as readonly string[]).includes(tipo) && !(EVENTOS_ANTERIORES as readonly string[]).includes(tipo),
  );
  const anteriorCompleta = !apagado && !nuevosYaElegidos && EVENTOS_ANTERIORES.every((evento) => lista.includes(evento));
  for (const clave of claves) {
    const eventos = GRUPOS_AVISO[clave];
    if (todos) {
      activos[clave] = true;
    } else if (apagado) {
      activos[clave] = false;
    } else if (eventos.every((evento) => lista.includes(evento))) {
      activos[clave] = true;
    } else if (eventos.some((evento) => lista.includes(evento))) {
      activos[clave] = false;
    } else if (anteriorCompleta && eventos.every((evento) => !(EVENTOS_ANTERIORES as readonly string[]).includes(evento))) {
      activos[clave] = true;
    } else {
      activos[clave] = false;
    }
  }
  return activos;
}

export function tiposDesdeGrupos(activos: Record<GrupoAviso, boolean>): string[] {
  const claves = Object.keys(GRUPOS_AVISO) as GrupoAviso[];
  if (claves.every((clave) => activos[clave])) return [];
  if (claves.every((clave) => !activos[clave])) return [CENTINELA_NINGUNO];
  return claves.filter((clave) => activos[clave]).flatMap((clave) => [...GRUPOS_AVISO[clave]]);
}

/** Conserva otros tipos del canal y escribe solo la parte de estos avisos. */
export function fusionarTiposAviso(existentes: string[] | null | undefined, activos: Record<GrupoAviso, boolean>): string[] {
  const deAvisos = new Set<string>([...EVENTOS_AVISO, CENTINELA_NINGUNO]);
  const resto = (existentes ?? []).filter((tipo) => !deAvisos.has(tipo));
  const avisos = tiposDesdeGrupos(activos);
  if (avisos.length === 0) return resto.length ? [...resto, ...EVENTOS_AVISO] : [];
  return [...resto, ...avisos];
}

/** Hoy y sigue abierta: vence. Antes de hoy y sigue abierta: atrasada. Nunca las dos. */
export function clasificarVencimiento(
  fechaLocal: string,
  hoy: string,
  abierta: boolean,
): ClaseVencimiento | null {
  if (!abierta || !/^\d{4}-\d{2}-\d{2}$/.test(fechaLocal) || !/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return null;
  if (fechaLocal === hoy) return 'vence';
  if (fechaLocal < hoy) return 'atrasada';
  return null;
}

/** A partir de las 7:00, hora de la organización, sale el resumen del día. */
export const MINUTO_RESUMEN = 7 * 60;

export function esHoraDeResumen(minutos: number): boolean {
  return minutos >= MINUTO_RESUMEN;
}

/**
 * La variante avisa por su existencia. El padre con hijas vivas no.
 * Un producto simple, o un padre que ya no tiene hijas, sí.
 * Misma regla que el trigger de stock bajo y fn_avisos_miembro_stock_cero.
 */
export function productoAvisable(producto: {
  trackStock: boolean;
  eliminado: boolean;
  esPadre: boolean;
  hijosVivos: number;
  padreEliminado: boolean;
}): boolean {
  if (!producto.trackStock || producto.eliminado || producto.padreEliminado) return false;
  if (producto.esPadre && producto.hijosVivos > 0) return false;
  return true;
}

/** Cruzó el mínimo y todavía quedan unidades. En cero lo cubre el resumen. */
export function cruzoMinimo(anterior: number, actual: number, minimo: number | null): boolean {
  if (minimo == null || minimo <= 0) return false;
  return anterior > minimo && actual > 0 && actual <= minimo;
}

export function eventoVencimiento(
  entidad: 'task' | 'opportunity',
  clase: ClaseVencimiento,
): EventoAviso {
  if (entidad === 'task') return clase === 'vence' ? 'tarea.vence' : 'tarea.atrasada';
  return clase === 'vence' ? 'oportunidad.vence' : 'oportunidad.atrasada';
}

export function minutosDelDia(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const encontrado = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
  if (!encontrado) return null;
  const horas = Number(encontrado[1]);
  const minutos = Number(encontrado[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/**
 * Ventana de no molestar en minutos del dia local.
 * Inicio igual a fin no pausa. Si el inicio es mayor, la ventana cruza la medianoche.
 */
export function enNoMolestar(
  inicio: string | null | undefined,
  fin: string | null | undefined,
  ahoraMinutos: number,
): boolean {
  const desde = minutosDelDia(inicio);
  const hasta = minutosDelDia(fin);
  if (desde == null || hasta == null || desde === hasta) return false;
  if (desde < hasta) return ahoraMinutos >= desde && ahoraMinutos < hasta;
  return ahoraMinutos >= desde || ahoraMinutos < hasta;
}

export function minutosEnZona(fecha: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const hora = Number(partes.find((parte) => parte.type === 'hour')?.value ?? '0') % 24;
  const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value ?? '0');
  return hora * 60 + minuto;
}
