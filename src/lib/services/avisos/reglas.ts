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
] as const;

export type EventoAviso = (typeof EVENTOS_AVISO)[number];

export const GRUPOS_AVISO = {
  'tarea.asignada': ['tarea.asignada'],
  'oportunidad.asignada': ['oportunidad.asignada'],
  'oportunidad.etapa': ['oportunidad.etapa'],
  'tarea.completada': ['tarea.completada'],
  vence: ['tarea.atrasada', 'tarea.vence', 'oportunidad.vence', 'oportunidad.atrasada'],
} as const;

export type GrupoAviso = keyof typeof GRUPOS_AVISO;

export type ClaseVencimiento = 'vence' | 'atrasada';

const CENTINELA_NINGUNO = 'ninguno';

export function correoPermitido(
  allowed: string[] | null | undefined,
  evento: string,
  mute: boolean,
): boolean {
  if (mute) return false;
  if (!allowed || allowed.length === 0) return true;
  if (allowed.includes(CENTINELA_NINGUNO)) return false;
  return allowed.includes(evento);
}

export function gruposActivos(allowed: string[] | null | undefined): Record<GrupoAviso, boolean> {
  const claves = Object.keys(GRUPOS_AVISO) as GrupoAviso[];
  const activos = {} as Record<GrupoAviso, boolean>;
  const apagado = !!allowed?.includes(CENTINELA_NINGUNO);
  const todos = !allowed || allowed.length === 0;
  for (const clave of claves) {
    activos[clave] = todos || (!apagado && GRUPOS_AVISO[clave].every((evento) => allowed.includes(evento)));
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
