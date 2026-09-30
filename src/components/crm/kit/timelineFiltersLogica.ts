/**
 * Lógica de `TimelineFilters` (Figma 759:444935). Sin React.
 *
 * Los 9 chips son los 9 tipos de `activities.activity_type` que tienen
 * entrada en la línea de tiempo (CHECK `activities_activity_type_check`,
 * verificado por MCP el 2026-09-29; `sms` y `visit` se agrupan con llamada y
 * reunión). El rango es de días calendario en la zona de la organización y se
 * convierte a instantes al consultar.
 */
import { nextPlainDay, plainDateToInstant } from '@/lib/utils/dateDisplay';
import type { RangoFechas } from '@/components/kit/rangoFechas';

export const TIPOS_TIMELINE = ['todos', 'call', 'email', 'whatsapp', 'meeting', 'note', 'task', 'system', 'ai_call'] as const;
export type TipoTimeline = (typeof TIPOS_TIMELINE)[number];

/** Tipos de `activity_type` que cubre cada chip. */
const TIPOS_DB: Record<Exclude<TipoTimeline, 'todos'>, readonly string[]> = {
  call: ['call', 'sms'],
  email: ['email'],
  whatsapp: ['whatsapp'],
  meeting: ['meeting', 'visit'],
  note: ['note'],
  task: ['task'],
  system: ['system'],
  ai_call: ['ai_call'],
};

export interface EntidadTimeline {
  tipo: 'customer' | 'opportunity';
  id: string;
  nombre: string;
}

export interface FiltrosTimeline {
  tipo: TipoTimeline;
  texto: string;
  responsableId: string;
  entidad: EntidadTimeline | null;
  rango: RangoFechas | null;
}

export function filtrosVacios(): FiltrosTimeline {
  return { tipo: 'todos', texto: '', responsableId: '', entidad: null, rango: null };
}

export function tiposDb(tipo: TipoTimeline): readonly string[] | null {
  return tipo === 'todos' ? null : TIPOS_DB[tipo];
}

/** Filtros que en móvil viven en el panel (responsable, entidad y fechas): el número del botón «Filtros». */
export function contarFiltrosPanel(f: FiltrosTimeline): number {
  return [f.responsableId, f.entidad, f.rango].filter(Boolean).length;
}

/** Hay algo que limpiar. */
export function hayFiltros(f: FiltrosTimeline): boolean {
  return f.tipo !== 'todos' || !!f.texto.trim() || contarFiltrosPanel(f) > 0;
}

/** Parámetros de consulta: el rango pasa a `[desde 00:00, hasta+1 00:00)` en la zona. */
export function parametrosTimeline(f: FiltrosTimeline, zona: string): Record<string, string> {
  const p: Record<string, string> = {};
  const tipos = tiposDb(f.tipo);
  if (tipos) p.types = tipos.join(',');
  if (f.texto.trim()) p.q = f.texto.trim();
  if (f.responsableId) p.user_id = f.responsableId;
  if (f.entidad) p[f.entidad.tipo === 'customer' ? 'customer_id' : 'opportunity_id'] = f.entidad.id;
  if (f.rango) {
    const desde = f.rango.desde <= f.rango.hasta ? f.rango.desde : f.rango.hasta;
    const hasta = f.rango.desde <= f.rango.hasta ? f.rango.hasta : f.rango.desde;
    p.from = plainDateToInstant(desde, zona);
    p.to = plainDateToInstant(nextPlainDay(hasta), zona);
  }
  return p;
}
