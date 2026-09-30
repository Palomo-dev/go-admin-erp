/**
 * Pantalla Actividades (CRM ola 3A, Figma 769:12376 y sus estados), sin React:
 * entradas de `GET /api/crm/activities` → `TimelineEntry` del kit, grupos por
 * día en la zona de la organización («Hoy · miércoles 23 sep»), estado de la
 * pantalla, KPI y exportación. La hoja de detalle del lead reutiliza el mapeo.
 */
import type { EntradaFeed } from '@/lib/services/crm/actividadesOrgService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { localeIntl } from '@/components/kit/idioma';
import { inicioDeMes } from '@/components/kit/rangoFechas';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { diasEntrePlanos } from '@/components/crm/kit/fechasCrm';
import { tipoDesdeActividad, type TipoEntrada } from '@/components/crm/kit/timelineEntryLogica';
import { RESULTADOS_LLAMADA } from '@/components/crm/kit/activityDialogLogica';
import { hayFiltros, type FiltrosTimeline } from '@/components/crm/kit/timelineFiltersLogica';

export type { EntradaFeed };

export const TAMANO_PAGINA_ACTIVIDADES = 20;

export function tipoEntradaFeed(e: Pick<EntradaFeed, 'fuente' | 'tipo'>): TipoEntrada {
  if (e.fuente === 'note') return 'nota';
  if (e.fuente === 'task') return 'tarea';
  return tipoDesdeActividad(e.tipo);
}

/** Minutos y segundos de una duración (para «4 min 12 s»). */
export function partesDuracion(segundos: number | null | undefined): { min: number; seg: number } | null {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos <= 0) return null;
  return { min: Math.floor(segundos / 60), seg: Math.round(segundos % 60) };
}

/**
 * Clave del título (`crm.pantallaActividades.entrada.titulo.*`). La actividad
 * de sistema lleva su propio texto como título («Oportunidad creada desde lead»).
 */
export type ClaveTitulo =
  | 'llamadaSaliente'
  | 'llamadaEntrante'
  | 'llamada'
  | 'correo'
  | 'whatsapp'
  | 'reunion'
  | 'nota'
  | 'tarea'
  | 'llamadaIa'
  | 'sistema';

export function claveTitulo(e: EntradaFeed): ClaveTitulo {
  const tipo = tipoEntradaFeed(e);
  if (tipo === 'llamada') return e.direccion === 'inbound' ? 'llamadaEntrante' : e.direccion === 'outbound' ? 'llamadaSaliente' : 'llamada';
  if (tipo === 'email') return 'correo';
  if (tipo === 'whatsapp') return 'whatsapp';
  if (tipo === 'reunion') return 'reunion';
  if (tipo === 'nota') return 'nota';
  if (tipo === 'tarea') return 'tarea';
  if (tipo === 'llamadaIa') return 'llamadaIa';
  return 'sistema';
}

/** Texto libre de la entrada recortado para una línea (sin HTML de las notas enriquecidas). */
export function textoPlano(html: string | null | undefined, max = 240): string | null {
  if (!html) return null;
  const limpio = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) return null;
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/** Estado (badge) de la entrada: clave de `crm.pantallaActividades.entrada.estado.*` y tono. */
export function estadoEntrada(e: EntradaFeed): { clave: string; tono: TonoBadge } | null {
  if (e.fuente === 'note') return e.fijada ? { clave: 'fijada', tono: 'advertencia' } : null;
  if (e.fuente === 'task') {
    const s = e.tarea?.estado;
    if (s === 'done') return { clave: 'hecha', tono: 'exito' };
    if (s === 'canceled') return { clave: 'cancelada', tono: 'neutro' };
    if (s === 'in_progress') return { clave: 'enCurso', tono: 'informacion' };
    return { clave: 'pendiente', tono: 'advertencia' };
  }
  if (tipoEntradaFeed(e) === 'llamada' && e.outcome && (RESULTADOS_LLAMADA as readonly string[]).includes(e.outcome)) {
    return { clave: `resultado.${e.outcome}`, tono: e.outcome === 'answered' ? 'exito' : 'neutro' };
  }
  return null;
}

/** «Carlos Ruiz · Ana Gómez · Uniformes 2026» (autor, cliente, oportunidad; lo que haya). */
export function metaEntrada(e: EntradaFeed, sistema: string): string {
  const autor = e.tipo === 'system' && !e.autor ? sistema : e.autor;
  return [autor, e.cliente?.nombre, e.oportunidad?.nombre].filter(Boolean).join(' · ');
}

// ─── Grupos por día ─────────────────────────────────────────────────────────

export interface GrupoDia {
  /** Día calendario de la organización (YYYY-MM-DD) o '' sin fecha. */
  dia: string;
  entradas: EntradaFeed[];
}

export function agruparPorDia(entradas: readonly EntradaFeed[], zona: string): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  for (const e of entradas) {
    const instante = e.ocurrio_en ? new Date(e.ocurrio_en) : null;
    const dia = instante && !Number.isNaN(instante.getTime()) ? toPlainDate(instante, zona) : '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.entradas.push(e);
    else grupos.push({ dia, entradas: [e] });
  }
  return grupos;
}

/** Encabezado del día: «hoy»/«ayer» (o nada) y la fecha larga «miércoles 23 sep». */
export function etiquetaDia(dia: string, hoy: string, idioma: string): { relativo: 'hoy' | 'ayer' | null; fecha: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return { relativo: null, fecha: '' };
  const fecha = new Intl.DateTimeFormat(localeIntl(idioma), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(dia.slice(0, 4) !== hoy.slice(0, 4) ? { year: 'numeric' as const } : {}),
  }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
  const d = diasEntrePlanos(dia, hoy);
  return { relativo: d === 0 ? 'hoy' : d === 1 ? 'ayer' : null, fecha };
}

// ─── Estado y KPI ───────────────────────────────────────────────────────────

export type EstadoPantallaActividades = 'cargando' | 'sinPermiso' | 'error' | 'vacio' | 'sinResultados' | 'listo';

/** Filtros de entrada: todos los tipos y responsables, el mes en curso (Figma: «1 – 23 sep 2026»). */
export function filtrosPorDefecto(hoy: string): FiltrosTimeline {
  return { tipo: 'todos', texto: '', responsableId: '', entidad: null, rango: { desde: inicioDeMes(hoy), hasta: hoy } };
}

/** ¿Solo los filtros de entrada? (así un mes sin actividad es «vacío», no «sin resultados»). */
export function sonFiltrosPorDefecto(f: FiltrosTimeline, hoy: string): boolean {
  const d = filtrosPorDefecto(hoy);
  const sinOtros = !hayFiltros({ ...f, rango: null });
  return sinOtros && (!f.rango || (f.rango.desde === d.rango?.desde && f.rango.hasta === d.rango?.hasta));
}

export function estadoPantallaActividades(o: { cargando: boolean; errorStatus: number | null; hayError: boolean; mostradas: number; porDefecto: boolean }): EstadoPantallaActividades {
  if (o.errorStatus === 403) return 'sinPermiso';
  if (o.hayError && o.mostradas === 0) return 'error';
  if (o.cargando && o.mostradas === 0) return 'cargando';
  if (o.mostradas === 0) return o.porDefecto ? 'vacio' : 'sinResultados';
  return 'listo';
}

export const CLAVES_KPI_ACTIVIDADES = ['total', 'llamadas', 'correos', 'whatsapp', 'reuniones', 'notas', 'tareasAbiertas'] as const;

// ─── Acciones sobre una entrada ─────────────────────────────────────────────

/** Ruta de edición/borrado de la entrada (solo actividades y notas). */
export function rutaEntrada(e: Pick<EntradaFeed, 'fuente' | 'id'>): string | null {
  if (e.fuente === 'activity') return `/api/crm/activities/${e.id}`;
  if (e.fuente === 'note') return `/api/crm/notes/${e.id}`;
  return null;
}

/** «Duplicar»: la misma actividad o nota como nueva (se cuelga de la oportunidad o del cliente). */
export function cuerpoDuplicado(e: EntradaFeed): { ruta: string; cuerpo: Record<string, unknown> } | null {
  const destino = e.oportunidad ? { tipo: 'opportunity', id: e.oportunidad.id } : e.cliente ? { tipo: 'customer', id: e.cliente.id } : null;
  if (!destino || !e.editable) return null;
  if (e.fuente === 'note') return { ruta: '/api/crm/notes', cuerpo: { related_type: destino.tipo, related_id: destino.id, body: e.texto ?? '', is_pinned: false } };
  if (e.fuente !== 'activity') return null;
  return {
    ruta: '/api/crm/activities',
    cuerpo: {
      activity_type: e.tipo,
      related_type: destino.tipo,
      related_id: destino.id,
      notes: e.texto,
      channel: e.channel,
      outcome: e.outcome,
      duration_seconds: e.duration_seconds,
      metadata: { duplicada_de: e.id, ...(e.direccion ? { direction: e.direccion } : {}) },
    },
  };
}

/** Cuerpo de `PATCH`: nota → `body`/`is_pinned`; actividad → `notes` (y `outcome` en llamadas). */
export function cuerpoEdicionEntrada(e: Pick<EntradaFeed, 'fuente'>, v: { texto: string; fijada?: boolean; outcome?: string | null }): Record<string, unknown> {
  if (e.fuente === 'note') return { body: v.texto, ...(typeof v.fijada === 'boolean' ? { is_pinned: v.fijada } : {}) };
  return { notes: v.texto.trim() || null, ...(v.outcome !== undefined ? { outcome: v.outcome } : {}) };
}

// ─── Exportar ───────────────────────────────────────────────────────────────

const celda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

/** CSV de lo cargado (fecha en la zona de la organización). */
export function csvActividades(entradas: readonly EntradaFeed[], encabezados: readonly string[], fechaDe: (iso: string | null) => string): string {
  const filas = entradas.map((e) =>
    [fechaDe(e.ocurrio_en), e.fuente === 'activity' ? e.tipo : e.fuente, textoPlano(e.texto, 2000), e.outcome, e.duration_seconds, e.autor, e.cliente?.nombre, e.oportunidad?.nombre].map(celda).join(','),
  );
  return [encabezados.map(celda).join(','), ...filas].join('\n');
}
