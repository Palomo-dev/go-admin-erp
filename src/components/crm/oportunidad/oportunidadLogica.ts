/**
 * Lógica pura de las pantallas de oportunidades de la ola 3B (Pipeline,
 * Oportunidades, drawer, detalle y diálogos). Sin React: se prueba con jest.
 *
 * Datos: `GET /api/crm/opportunities` (lista paginada), `…/resumen`,
 * `GET /api/crm/pipelines/[id]/board` y `GET /api/crm/opportunities/[id]`
 * (`oportunidadesLecturaService`). Permisos: los de `/api/crm/permisos`,
 * resueltos en el servidor; aquí solo deciden qué se pinta. Toda escritura
 * vuelve a exigirlos en su ruta.
 */
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { OportunidadTarjeta } from '@/components/crm/kit/opportunityCardLogica';
import type { PermisosOportunidad } from '@/components/crm/kit/opportunityRowMenuLogica';
import type { RequisitoPendiente } from '@/components/crm/kit/moveStageDialogLogica';
import { sumarEnMonedaBase, type ResumenMonedaBase, type TasaCambio } from '@/components/crm/kit/monedaCrm';
import { totalColumna, type TotalColumna } from '@/components/crm/kit/stageColumnLogica';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { nombreUsuario, puede } from '@/components/crm/acciones/catalogosCrmLogica';

export interface EtapaApi {
  id: string;
  /** Presente cuando se mezclan etapas de varios pipelines (lista de Oportunidades). */
  pipeline_id?: string;
  name: string;
  position: number;
  probability: number | null;
  color: string | null;
  sla_days?: number | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  exit_criteria?: unknown;
}

export interface OportunidadApi {
  id: string;
  name: string;
  customer_id: string | null;
  pipeline_id: string;
  stage_id: string;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  record_type?: string | null;
  temperature?: string | null;
  score_total?: number | null;
  icp_band?: string | null;
  salesperson_id: string | null;
  created_by?: string | null;
  expected_close_date?: string | null;
  next_contact_at?: string | null;
  next_action?: string | null;
  last_contact_at?: string | null;
  contact_channel?: string | null;
  loss_reason_value?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cliente_nombre?: string | null;
  /** Contacto del cliente (motivos de las acciones rápidas de la tarjeta: sin teléfono, no llamar…). */
  cliente?: { full_name?: string | null; phone?: string | null; email?: string | null; do_not_call?: boolean | null } | null;
  etapa?: Omit<EtapaApi, 'id'> | null;
  entro_etapa_en?: string | null;
  es_lead?: boolean;
}

export interface GrupoMonedaApi {
  moneda: string;
  monto: number;
  cantidad: number;
  ponderado?: number;
}

export interface ResumenApi {
  conteos: { open: number; won: number; lost: number; total: number };
  abiertas: GrupoMonedaApi[];
  por_etapa: Record<string, { cantidad: number; grupos: GrupoMonedaApi[] }>;
  cierran_periodo: number | null;
  ganadas_90: number;
  perdidas_90: number;
  tasas: TasaCambio[];
  truncado: boolean;
  base: string;
}

// ─── Permisos (resueltos en el servidor; aquí solo deciden qué se pinta) ─────

export interface PermisosPantalla {
  ver: boolean;
  crear: boolean;
  editarPropias: boolean;
  editarCualquiera: boolean;
  eliminar: boolean;
  cerrar: boolean;
  saltarGate: boolean;
  gestionarPipelines: boolean;
  gestionarEtapas: boolean;
}

export function permisosPantalla(p: Record<string, boolean>): PermisosPantalla {
  return {
    ver: puede(p, 'crm.opportunities.view'),
    crear: puede(p, 'crm.opportunities.create'),
    editarPropias: puede(p, 'crm.opportunities.edit'),
    editarCualquiera: puede(p, 'crm.opportunities.edit_any'),
    eliminar: puede(p, 'crm.opportunities.delete'),
    cerrar: puede(p, 'crm.opportunities.close'),
    saltarGate: puede(p, 'crm.stages.override_gate'),
    gestionarPipelines: puede(p, 'crm.pipelines.manage'),
    gestionarEtapas: puede(p, 'crm.stages.manage'),
  };
}

/** Editar/mover: `edit_any`, o `edit` si es responsable o creador (D5; la ruta lo vuelve a exigir). */
export function puedeEditarOportunidad(p: PermisosPantalla, usuarioId: string | null, op: Pick<OportunidadApi, 'salesperson_id' | 'created_by'>): boolean {
  if (p.editarCualquiera) return true;
  return p.editarPropias && !!usuarioId && (op.salesperson_id === usuarioId || op.created_by === usuarioId);
}

export function permisosFila(p: PermisosPantalla, usuarioId: string | null, op: Pick<OportunidadApi, 'salesperson_id' | 'created_by'>): PermisosOportunidad {
  const editar = puedeEditarOportunidad(p, usuarioId, op);
  return { editar, cerrar: editar && p.cerrar, crear: p.crear, eliminar: p.eliminar };
}

// ─── Filas y tarjetas ───────────────────────────────────────────────────────

export function aTarjeta(op: OportunidadApi, usuarios: readonly OpcionUsuario[]): OportunidadTarjeta {
  const responsable = nombreUsuario(usuarios, op.salesperson_id);
  return {
    id: op.id,
    name: op.name,
    clienteNombre: op.cliente_nombre ?? null,
    amount: op.amount,
    currency: op.currency,
    status: op.status,
    temperature: op.temperature,
    score_total: op.score_total,
    next_contact_at: op.next_contact_at,
    next_action: op.next_action,
    last_contact_at: op.last_contact_at,
    contact_channel: op.contact_channel,
    closed_at: op.closed_at,
    motivoPerdida: op.loss_reason_value ?? null,
    entroEtapaEn: op.entro_etapa_en ?? op.created_at ?? null,
    responsable: responsable ? { nombre: responsable } : null,
    etapaNombre: op.etapa?.name ?? null,
    esLead: op.es_lead === true || op.record_type === 'lead',
  };
}

// ─── Moneda: KPI y totales por columna ──────────────────────────────────────

/** Grupos del servidor (ya sumados) → resumen en la base con las tasas de la organización. */
export function resumenEnBase(grupos: readonly GrupoMonedaApi[], base: string, tasas: readonly TasaCambio[], hoy: string | null, campo: 'monto' | 'ponderado' = 'monto'): ResumenMonedaBase {
  return sumarEnMonedaBase(
    grupos.map((g) => ({ monto: campo === 'ponderado' ? (g.ponderado ?? 0) : g.monto, moneda: g.moneda, cantidad: g.cantidad })),
    base,
    tasas,
    hoy,
  );
}

export function totalDeEtapa(resumen: ResumenApi | null, etapaId: string, hoy: string | null): TotalColumna & { cantidad: number } {
  const e = resumen?.por_etapa[etapaId];
  const base = resumen?.base ?? '';
  const total = totalColumna((e?.grupos ?? []).map((g) => ({ monto: g.monto, moneda: g.moneda, cantidad: g.cantidad })), base, resumen?.tasas ?? [], hoy);
  return { ...total, cantidad: e?.cantidad ?? 0 };
}

/** Tasa de cierre a 90 días (0–100) o null sin cierres. */
export function tasaCierre(r: Pick<ResumenApi, 'ganadas_90' | 'perdidas_90'> | null): number | null {
  if (!r) return null;
  const n = r.ganadas_90 + r.perdidas_90;
  return n > 0 ? Math.round((r.ganadas_90 / n) * 100) : null;
}

// ─── Estados de pantalla ────────────────────────────────────────────────────

export type EstadoPantalla = 'cargando' | 'error' | 'sinPermiso' | 'vacio' | 'sinResultados' | 'listo';

export function estadoPantalla(o: { cargando: boolean; error: unknown; total: number | null; hayFiltros: boolean }): EstadoPantalla {
  if (o.error instanceof ErrorApiCrm && (o.error.status === 401 || o.error.status === 403)) return 'sinPermiso';
  if (o.error) return 'error';
  if (o.cargando && o.total === null) return 'cargando';
  if ((o.total ?? 0) === 0) return o.hayFiltros ? 'sinResultados' : 'vacio';
  return 'listo';
}

// ─── Rechazos del servidor al mover de etapa ────────────────────────────────

export type RechazoEtapa =
  | { tipo: 'gate'; pendientes: RequisitoPendiente[] }
  | { tipo: 'cierre'; motivo: 'needs_won' | 'needs_lost' }
  | { tipo: 'sinPermiso' }
  | { tipo: 'conflicto' }
  | { tipo: 'otro'; mensaje: string };

/** `gate.missing` ({ type, label, detail }) → requisitos del `MoveStageDialog`. */
export function pendientesDeGate(gate: unknown): RequisitoPendiente[] {
  const missing = (gate as { missing?: unknown } | null)?.missing;
  if (!Array.isArray(missing)) return [];
  return missing.map((m, i) => {
    if (typeof m === 'string') return { id: `r${i}`, etiqueta: m };
    const o = m as { type?: string; label?: string; detail?: string };
    return { id: `${o.type ?? 'r'}-${i}`, etiqueta: (o.detail || o.label || '').trim() || '—' };
  });
}

export function interpretarRechazo(e: unknown): RechazoEtapa {
  if (!(e instanceof ErrorApiCrm)) return { tipo: 'otro', mensaje: e instanceof Error ? e.message : String(e) };
  if (e.status === 401 || e.status === 403) return { tipo: 'sinPermiso' };
  const reason = (e.cuerpo?.reason as string | undefined) ?? e.codigo;
  if (e.status === 409 && reason === 'gate') return { tipo: 'gate', pendientes: pendientesDeGate(e.cuerpo?.gate) };
  if (e.status === 409 && (reason === 'needs_won' || reason === 'needs_lost')) return { tipo: 'cierre', motivo: reason };
  if (e.status === 409 && reason === 'conflict') return { tipo: 'conflicto' };
  return { tipo: 'otro', mensaje: e.message };
}

// ─── Tablero optimista ──────────────────────────────────────────────────────

export interface ColumnaTablero {
  filas: OportunidadApi[];
  total: number;
  pagina: number;
  cargando: boolean;
  error: boolean;
}

export type Tablero = Record<string, ColumnaTablero>;

export const COLUMNA_VACIA: ColumnaTablero = { filas: [], total: 0, pagina: 0, cargando: true, error: false };

/**
 * Mueve la tarjeta a otra columna ANTES de que responda el servidor
 * (optimista). Devuelve el tablero nuevo; el anterior sirve para revertir.
 */
export function moverEnTablero(t: Tablero, id: string, destino: string, etapaDestino?: Omit<EtapaApi, 'id'> | null): Tablero {
  const origen = Object.keys(t).find((k) => t[k].filas.some((f) => f.id === id));
  if (!origen || origen === destino || !t[destino]) return t;
  const fila = t[origen].filas.find((f) => f.id === id)!;
  const status = etapaDestino?.is_won ? 'won' : etapaDestino?.is_lost ? 'lost' : 'open';
  const movida: OportunidadApi = { ...fila, stage_id: destino, status, etapa: etapaDestino ?? fila.etapa, entro_etapa_en: new Date().toISOString() };
  return {
    ...t,
    [origen]: { ...t[origen], filas: t[origen].filas.filter((f) => f.id !== id), total: Math.max(0, t[origen].total - 1) },
    [destino]: { ...t[destino], filas: [movida, ...t[destino].filas], total: t[destino].total + 1 },
  };
}

/** Une la página nueva de una columna sin duplicar (otra tarjeta pudo llegar arrastrada). */
export function unirPagina(actual: readonly OportunidadApi[], nuevas: readonly OportunidadApi[], pagina: number): OportunidadApi[] {
  if (pagina <= 1) return [...nuevas];
  const vistos = new Set(actual.map((f) => f.id));
  return [...actual, ...nuevas.filter((f) => !vistos.has(f.id))];
}

/** Columna de la tarjeta (para el menú «Mover» y la navegación con teclado). */
export function columnaDe(t: Tablero, id: string): string | null {
  return Object.keys(t).find((k) => t[k].filas.some((f) => f.id === id)) ?? null;
}

// ─── Selección masiva ───────────────────────────────────────────────────────

export function alternarSeleccion(sel: ReadonlySet<string>, id: string): Set<string> {
  const n = new Set(sel);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

export function seleccionarPagina(sel: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const todas = ids.length > 0 && ids.every((i) => sel.has(i));
  const n = new Set(sel);
  ids.forEach((i) => (todas ? n.delete(i) : n.add(i)));
  return n;
}

// ─── Exportar ───────────────────────────────────────────────────────────────

const celda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

/** CSV de lo ya cargado (nada se vuelve a pedir); sin fórmulas al abrirlo. */
export function csvOportunidades(filas: readonly OportunidadApi[], usuarios: readonly OpcionUsuario[], encabezados: readonly string[]): string {
  const lineas = filas.map((r) =>
    [r.name, r.cliente_nombre, r.etapa?.name, r.amount, r.currency, r.etapa?.probability, r.expected_close_date, nombreUsuario(usuarios, r.salesperson_id), r.next_contact_at, r.status, r.es_lead ? 'lead' : 'deal']
      .map(celda)
      .join(','),
  );
  return [encabezados.map(celda).join(','), ...lineas].join('\n');
}

/** Etapas del pipeline de la oportunidad (la lista mezcla pipelines). */
export function etapasDeOportunidad<T extends Pick<EtapaApi, 'pipeline_id'>>(etapas: readonly T[], pipelineId: string | null | undefined): T[] {
  return etapas.filter((e) => !e.pipeline_id || !pipelineId || e.pipeline_id === pipelineId);
}
