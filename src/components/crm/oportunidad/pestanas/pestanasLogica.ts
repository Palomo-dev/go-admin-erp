/**
 * Lógica sin React de las pestañas de la oportunidad (drawer y detalle):
 * Actividad, Tareas, Notas, Documentos e IA (Figma CRM 820:66213, 822:235333,
 * 822:235945, 822:236526, 822:237089 y sus vacíos 823:*).
 *
 * Fechas siempre en la zona de la organización (docs/reglas-fechas-timezone.md):
 * la zona la pasa el componente desde `useFormatDate()`.
 */
import type { TimelineEntry, TimelineKind } from '@/lib/services/crm/timelineService';
import type { EntradaLinea } from '@/components/crm/kit/timelineEntryLogica';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { diaRelativo, diasEntrePlanos, fechaCortaInstante } from '@/components/crm/kit/fechasCrm';

export type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

// ─── Actividad ──────────────────────────────────────────────────────────────

/** Chips del filtro (Figma 820:66671): Todo · Llamadas · Correos · WhatsApp · Notas · Tareas · Etapas. */
export const CHIPS_ACTIVIDAD = ['todo', 'llamadas', 'correos', 'whatsapp', 'notas', 'tareas', 'etapas'] as const;
export type ChipActividad = (typeof CHIPS_ACTIVIDAD)[number];

const KINDS_CHIP: Record<ChipActividad, TimelineKind[]> = {
  todo: [],
  llamadas: ['call', 'call_live', 'ai_call'],
  correos: ['email'],
  whatsapp: ['whatsapp'],
  notas: ['note'],
  tareas: ['task'],
  etapas: ['system'],
};

/** Tipos de entrada que pide el chip (vacío = todos). */
export function kindsDeChip(chip: ChipActividad): TimelineKind[] | undefined {
  const k = KINDS_CHIP[chip];
  return k.length ? [...k] : undefined;
}

/** «4 min 12 s» · «45 s» · null sin duración. */
export function duracionLlamada(segundos: number | null | undefined, t: Traductor): string | null {
  if (!segundos || segundos <= 0) return null;
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return m > 0 ? t('duracion', { m, s }) : t('duracionSeg', { s });
}

const ESTADO_LLAMADA: Record<string, { clave: string; tono: TonoBadge }> = {
  completed: { clave: 'contestada', tono: 'exito' },
  answered: { clave: 'contestada', tono: 'exito' },
  'no-answer': { clave: 'sinRespuesta', tono: 'advertencia' },
  no_answer: { clave: 'sinRespuesta', tono: 'advertencia' },
  busy: { clave: 'sinRespuesta', tono: 'advertencia' },
  failed: { clave: 'fallida', tono: 'peligro' },
  canceled: { clave: 'sinRespuesta', tono: 'advertencia' },
  'in-progress': { clave: 'enCurso', tono: 'informacion' },
  in_progress: { clave: 'enCurso', tono: 'informacion' },
  ringing: { clave: 'enCurso', tono: 'informacion' },
  initiated: { clave: 'enCurso', tono: 'informacion' },
  queued: { clave: 'enCurso', tono: 'informacion' },
};

const ESTADO_CORREO: Record<string, { clave: string; tono: TonoBadge }> = {
  delivered: { clave: 'entregado', tono: 'exito' },
  sent: { clave: 'enviado', tono: 'neutro' },
  bounced: { clave: 'rebotado', tono: 'peligro' },
  failed: { clave: 'fallido', tono: 'peligro' },
};

const sinHtml = (html: string | null | undefined): string =>
  (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/** Texto plano de una nota o un cuerpo enriquecido. */
export function textoPlano(html: string | null | undefined): string {
  return sinHtml(html);
}

/**
 * Entrada del timeline del servidor → fila del kit (`TimelineEntry`): título,
 * detalle, estado y autor como en Figma («Llamada saliente · 4 min 12 s»,
 * «Resumen IA: …», «Contestada»). `t` apunta a `crm.oportunidad.pestanas.actividad`.
 */
export function entradaDeTimeline(e: TimelineEntry, t: Traductor): EntradaLinea {
  const base = { id: `${e.kind}:${e.id}`, ocurrioEn: e.occurred_at, autor: e.user?.name ?? null };
  const est = (m: { clave: string; tono: TonoBadge } | undefined) => (m ? { etiqueta: t(`estados.${m.clave}`), tono: m.tono } : null);
  switch (e.kind) {
    case 'call':
    case 'call_live': {
      const titulo = e.kind === 'call_live' ? t('titulos.llamadaEnCurso') : t(e.call.direction === 'inbound' ? 'titulos.llamadaEntrante' : 'titulos.llamadaSaliente');
      const dur = duracionLlamada(e.call.duration_seconds ?? e.activity?.duration_seconds, t);
      const resumen = e.call.analysis?.summary?.trim();
      return {
        ...base,
        tipo: 'llamada',
        titulo: dur ? t('titulos.conDuracion', { titulo, duracion: dur }) : titulo,
        detalle: resumen ? t('titulos.resumenIa', { resumen }) : e.activity?.notes ?? null,
        estado: est(ESTADO_LLAMADA[e.kind === 'call_live' ? 'in-progress' : e.call.status]),
      };
    }
    case 'email': {
      const asunto = e.email.subject || '—';
      const entrante = !!e.email.from_email && e.email.status === 'received';
      const partes: string[] = [];
      if (e.email.open_count > 0) partes.push(t('titulos.correoAperturas', { n: e.email.open_count }));
      if (e.email.click_count > 0) partes.push(t('titulos.correoClics', { n: e.email.click_count }));
      return {
        ...base,
        tipo: 'email',
        titulo: t(entrante ? 'titulos.correoRecibido' : 'titulos.correoEnviado', { asunto }),
        detalle: partes.length ? partes.join(' · ') : null,
        estado: e.email.open_count > 0 ? { etiqueta: t('estados.abierto'), tono: 'informacion' } : est(ESTADO_CORREO[e.email.status]),
      };
    }
    case 'whatsapp': {
      const ultimo = e.messages[e.messages.length - 1] ?? e.messages[0];
      return { ...base, tipo: 'whatsapp', titulo: t('titulos.whatsapp', { n: e.count }), detalle: ultimo ? sinHtml(ultimo.content) : null, estado: null };
    }
    case 'ai_call': {
      const agente = e.voice_agent_call?.agent?.name;
      const dur = duracionLlamada(e.voice_agent_call?.duration_seconds ?? e.call?.duration_seconds, t);
      const titulo = agente ? t('titulos.llamadaIaAgente', { agente }) : t('titulos.llamadaIa');
      const resumen = e.call?.analysis?.summary?.trim();
      return {
        ...base,
        tipo: 'llamadaIa',
        titulo: dur ? t('titulos.conDuracion', { titulo, duracion: dur }) : titulo,
        detalle: resumen ? t('titulos.resumenIa', { resumen }) : e.voice_agent_call?.outcome ?? null,
        estado: null,
      };
    }
    case 'task': {
      const hecha = e.task.status === 'done';
      return {
        ...base,
        tipo: 'tarea',
        titulo: t('titulos.tarea', { titulo: e.task.title }),
        detalle: e.task.description ? sinHtml(e.task.description) : null,
        estado: hecha ? { etiqueta: t('estados.hecha'), tono: 'exito' } : e.task.status === 'canceled' ? null : { etiqueta: t('estados.pendiente'), tono: 'advertencia' },
      };
    }
    case 'note': {
      const fijada = !!e.note?.is_pinned;
      return {
        ...base,
        tipo: 'nota',
        titulo: t(fijada ? 'titulos.notaFijada' : 'titulos.nota'),
        detalle: sinHtml(e.note?.body ?? e.activity?.notes) || null,
        estado: fijada ? { etiqueta: t('estados.fijada'), tono: 'advertencia' } : null,
      };
    }
    case 'meeting': {
      const lugar = e.event?.location?.trim();
      return { ...base, tipo: 'reunion', titulo: lugar ? t('titulos.reunionEn', { lugar }) : t('titulos.reunion'), detalle: e.activity.notes, estado: null };
    }
    case 'system': {
      const titulo = e.to_stage
        ? e.from_stage
          ? t('titulos.cambioEtapa', { desde: e.from_stage.name, hacia: e.to_stage.name })
          : t('titulos.etapaInicial', { hacia: e.to_stage.name })
        : t('titulos.sistema');
      return { ...base, autor: base.autor ?? t('autorSistema'), tipo: 'sistema', titulo, detalle: e.activity?.notes ?? null, estado: null };
    }
    default:
      return { ...base, tipo: 'sistema', titulo: t(e.kind === 'sms' ? 'titulos.sms' : 'titulos.actividad'), detalle: e.activity?.notes ?? null, estado: null };
  }
}

/** ¿La entrada tiene un detalle rico (grabación, transcripción, correo, chat) que mostrar al abrirla? */
export function tieneDetalle(e: TimelineEntry): boolean {
  return e.kind === 'call' || e.kind === 'call_live' || e.kind === 'email' || e.kind === 'whatsapp' || e.kind === 'ai_call' || e.kind === 'meeting';
}

export interface GrupoDia<T> {
  dia: string;
  clave: 'hoy' | 'ayer' | 'fecha';
  fecha: string;
  entradas: T[];
}

/** Agrupa por día calendario de la zona («Hoy», «Ayer», «22 sep.»), en el orden recibido. */
export function agruparPorDia<T>(entradas: readonly T[], instante: (x: T) => string | null, zona: string, ahora: Date, idioma: string): GrupoDia<T>[] {
  const hoy = toPlainDate(ahora, zona);
  const grupos = new Map<string, GrupoDia<T>>();
  for (const x of entradas) {
    const v = instante(x);
    const fecha = v ? new Date(v) : null;
    const dia = fecha && !Number.isNaN(fecha.getTime()) ? toPlainDate(fecha, zona) : '';
    let g = grupos.get(dia);
    if (!g) {
      const d = dia ? diasEntrePlanos(dia, hoy) : null;
      g = { dia, clave: d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'fecha', fecha: v ? fechaCortaInstante(v, zona, idioma) : '', entradas: [] };
      grupos.set(dia, g);
    }
    g.entradas.push(x);
  }
  return [...grupos.values()];
}

// ─── Tareas ─────────────────────────────────────────────────────────────────

export interface TareaLinea {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  completada_por: string | null;
}

export const PRIORIDADES_TAREA = ['low', 'med', 'high', 'critical'] as const;

/** Pendientes (abiertas o en progreso, por vencimiento) y hechas (la más reciente primero). Las canceladas no se muestran. */
export function separarTareas<T extends TareaLinea>(tareas: readonly T[]): { pendientes: T[]; hechas: T[] } {
  const pendientes = tareas.filter((x) => x.status !== 'done' && x.status !== 'canceled');
  const hechas = tareas.filter((x) => x.status === 'done');
  const venc = (x: T) => (x.due_date ? Date.parse(x.due_date) : Number.POSITIVE_INFINITY);
  pendientes.sort((a, b) => venc(a) - venc(b));
  hechas.sort((a, b) => Date.parse(b.completed_at ?? '') - Date.parse(a.completed_at ?? '') || 0);
  return { pendientes, hechas };
}

/**
 * Segunda línea de una tarea (Figma 822:235333): «Vence mañana 10:00 · Alta»,
 * «Vencida hace 2 d · Media» (en rojo) o «Hecha el 18 sep. · Carlos Ruiz».
 * `t` apunta a `crm.oportunidad.pestanas.tareas`.
 */
export function lineaTarea(x: TareaLinea, ahora: Date, zona: string, idioma: string, t: Traductor): { texto: string; vencida: boolean } {
  if (x.status === 'done') {
    const fecha = x.completed_at ? t('hecha', { fecha: fechaCortaInstante(x.completed_at, zona, idioma) }) : t('hechaSinFecha');
    return { texto: [fecha, x.completada_por].filter(Boolean).join(' · '), vencida: false };
  }
  const prioridad = x.priority && (PRIORIDADES_TAREA as readonly string[]).includes(x.priority) ? t(`prioridad.${x.priority}`) : null;
  let venc = t('vence.sinFecha');
  let vencida = false;
  const r = diaRelativo(x.due_date, ahora, zona);
  if (r && x.due_date) {
    vencida = Date.parse(x.due_date) < ahora.getTime();
    if (vencida) venc = r.tipo === 'hoy' ? t('vence.vencidaHoy', { hora: r.hora }) : t('vence.vencidaDias', { n: r.tipo === 'ayer' ? 1 : r.tipo === 'pasado' ? r.dias : 0 });
    else if (r.tipo === 'hoy') venc = t('vence.hoy', { hora: r.hora });
    else if (r.tipo === 'manana') venc = t('vence.manana', { hora: r.hora });
    else venc = t('vence.fecha', { fecha: fechaCortaInstante(x.due_date, zona, idioma), hora: r.hora });
  }
  return { texto: [venc, prioridad].filter(Boolean).join(' · '), vencida };
}

// ─── Notas ──────────────────────────────────────────────────────────────────

export interface NotaLinea {
  id: string;
  fijada: boolean;
  ocurrio_en: string | null;
}

/** Fijadas primero; dentro de cada grupo, la más reciente arriba. */
export function ordenarNotas<T extends NotaLinea>(notas: readonly T[]): T[] {
  return [...notas].sort((a, b) => Number(b.fijada) - Number(a.fijada) || String(b.ocurrio_en ?? '').localeCompare(String(a.ocurrio_en ?? '')));
}

/** «Hoy 09:40» · «22 sep. 15:20» (cabecera de la nota). */
export function cuandoNota(valor: string | null, ahora: Date, zona: string, idioma: string, t: Traductor): string {
  const r = diaRelativo(valor, ahora, zona);
  if (!r || !valor) return '';
  if (r.tipo === 'hoy') return t('hoy', { hora: r.hora });
  if (r.tipo === 'ayer') return t('ayer', { hora: r.hora });
  return t('fecha', { fecha: fechaCortaInstante(valor, zona, idioma), hora: r.hora });
}

// ─── Documentos ─────────────────────────────────────────────────────────────

/** «1,2 MB» · «860 KB» · «512 B», con el separador decimal del idioma. */
export function tamanoArchivo(bytes: number | null | undefined, idioma: string): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '';
  const fmt = (n: number, dec: number) => new Intl.NumberFormat(idioma, { maximumFractionDigits: dec }).format(n);
  if (bytes < 1024) return `${fmt(bytes, 0)} B`;
  if (bytes < 1024 * 1024) return `${fmt(Math.round(bytes / 1024), 0)} KB`;
  return `${fmt(bytes / (1024 * 1024), 1)} MB`;
}

// ─── IA ─────────────────────────────────────────────────────────────────────

/** «hace un momento» · «hace 2 min» · «hace 3 h» desde que se generó la sugerencia. */
export function haceCuanto(desde: number, ahora: number, t: Traductor): string {
  const min = Math.floor(Math.max(0, ahora - desde) / 60_000);
  if (min < 1) return t('ahora');
  if (min < 60) return t('haceMin', { n: min });
  return t('haceHoras', { n: Math.floor(min / 60) });
}

/**
 * Línea de una tarea en el DETALLE de la oportunidad (Figma 775:473990):
 * «mañana 10:00 · Carlos Ruiz», «Vencida · ayer 16:00 · Carlos Ruiz» o
 * «18 sep. · Laura Pérez», con su estado (Pendiente · Vencida · Completada).
 * `t` apunta a `crm.oportunidad.pestanas.tareas.detalle`.
 */
export function lineaTareaDetalle(
  x: TareaLinea & { responsable?: string | null },
  ahora: Date,
  zona: string,
  idioma: string,
  t: Traductor,
): { texto: string; estado: 'pendiente' | 'vencida' | 'completada' } {
  if (x.status === 'done') {
    return { texto: [x.completed_at ? fechaCortaInstante(x.completed_at, zona, idioma) : null, x.completada_por].filter(Boolean).join(' · '), estado: 'completada' };
  }
  const r = diaRelativo(x.due_date, ahora, zona);
  let cuando: string | null = null;
  if (r && x.due_date) {
    if (r.tipo === 'hoy') cuando = t('hoy', { hora: r.hora });
    else if (r.tipo === 'manana') cuando = t('manana', { hora: r.hora });
    else if (r.tipo === 'ayer') cuando = t('ayer', { hora: r.hora });
    else cuando = t('fecha', { fecha: fechaCortaInstante(x.due_date, zona, idioma), hora: r.hora });
  }
  const vencida = !!x.due_date && Date.parse(x.due_date) < ahora.getTime();
  return { texto: [vencida ? t('vencida') : null, cuando, x.responsable ?? null].filter(Boolean).join(' · '), estado: vencida ? 'vencida' : 'pendiente' };
}
