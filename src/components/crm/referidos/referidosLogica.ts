/**
 * Lógica pura de la pantalla Referidos (Figma «CRM · Red y gestión»,
 * 1298:768716 y hermanos): siguiente paso de cada fila, cifras de las KPI,
 * filtros de estado y programa, orden, páginas, filas de «Recompensas» y CSV.
 * Sin React ni I/O: las reglas de estado salen de `referralStateMachine` y las
 * de recompensa de `referralReward` (regla 7, no se duplican aquí).
 */

import { nextReferralStatuses, REFERRAL_STATUSES, type ReferralStatus } from '@/lib/services/crm/referralStateMachine';
import { checkRewardPayable } from '@/lib/services/crm/referralReward';
import { filterReferrals } from '@/lib/services/crm/referralModel';
import type { ReferralProgram, ReferralView } from '@/lib/services/crm/referralsService';
import type { TonoBadge } from '@/components/kit/estadoTono';

// ─── Estados ─────────────────────────────────────────────────────────────────

export const TONO_ESTADO: Record<ReferralStatus, TonoBadge> = {
  pending: 'neutro',
  contacted: 'informacion',
  qualified: 'advertencia',
  converted: 'exito',
  rejected: 'peligro',
};

export type PestanaEstado = ReferralStatus | 'todos';
export const PESTANAS_ESTADO: readonly PestanaEstado[] = ['todos', ...REFERRAL_STATUSES];

export function contarPorEstado(lista: readonly ReferralView[]): Record<PestanaEstado, number> {
  const c = { todos: lista.length } as Record<PestanaEstado, number>;
  for (const s of REFERRAL_STATUSES) c[s] = 0;
  for (const r of lista) if (r.status in c) c[r.status] += 1;
  return c;
}

// ─── Siguiente paso (la ÚNICA transición válida de la última columna) ──────

export type SiguientePaso = 'contactar' | 'calificar' | 'convertir' | 'registrarPago' | 'verLead' | 'final';

/** ¿Se puede registrar la recompensa? La misma regla que aplica el servidor. */
export function recompensaPendiente(r: Pick<ReferralView, 'status' | 'reward_paid' | 'program_id'>): boolean {
  return checkRewardPayable(r).ok;
}

export function siguientePaso(r: ReferralView): SiguientePaso {
  if (r.status === 'pending') return 'contactar';
  if (r.status === 'contacted') return 'calificar';
  if (r.status === 'qualified') return 'convertir';
  if (r.status === 'converted') {
    if (recompensaPendiente(r)) return 'registrarPago';
    if (r.opportunity_id || r.referred_customer_id) return 'verLead';
  }
  return 'final';
}

/** «Rechazar» vive en el menú «⋯»: solo si la máquina lo permite. */
export function puedeRechazar(r: Pick<ReferralView, 'status'>): boolean {
  return nextReferralStatuses(r.status).includes('rejected');
}

/** Enlace del lead creado: la oportunidad si ya la hay; si no, la ficha del cliente (D2). */
export function enlaceLead(r: Pick<ReferralView, 'opportunity_id' | 'referred_customer_id'>): string | null {
  if (r.opportunity_id) return `/app/crm/oportunidades/${r.opportunity_id}`;
  if (r.referred_customer_id) return `/app/crm/clientes/${r.referred_customer_id}`;
  return null;
}

// ─── Recompensa ──────────────────────────────────────────────────────────────

type ProgramaRecompensa = Pick<ReferralProgram, 'reward_type' | 'reward_amount' | 'reward_to'>;

/** Crédito y efectivo son dinero; un regalo solo si tiene valor; un descuento nunca (es un %). */
export function esMonetaria(p: ProgramaRecompensa | null | undefined): boolean {
  if (!p) return false;
  if (p.reward_type === 'credit' || p.reward_type === 'cash') return true;
  return p.reward_type === 'gift' && Number(p.reward_amount) > 0;
}

/** Personas que reciben la recompensa: «ambos» son dos. */
export function beneficiarios(p: ProgramaRecompensa | null | undefined): number {
  if (!p) return 0;
  return p.reward_to === 'both' ? 2 : 1;
}

/** Lo que se debe por un referido (monto × beneficiarios), o 0 si no es dinero. */
export function montoAdeudado(p: ProgramaRecompensa | null | undefined): number {
  if (!esMonetaria(p)) return 0;
  const n = Number(p!.reward_amount);
  return Number.isFinite(n) ? Math.round(n * beneficiarios(p) * 100) / 100 : 0;
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface ResumenReferidos {
  total: number;
  esteMes: number;
  mesAnterior: number;
  convertidos: number;
  /** Porcentaje entero (0–100). */
  tasa: number;
  pendientesMonto: number;
  pendientesN: number;
  pagadasMonto: number;
  pagadasN: number;
  noMonetariasPendientes: number;
}

/**
 * `diaDe` convierte un instante en día calendario `YYYY-MM-DD` en la zona de
 * la organización (`toPlainDate`); `hoy` es ese día para «ahora».
 */
export function resumenReferidos(lista: readonly ReferralView[], hoy: string, diaDe: (iso: string) => string): ResumenReferidos {
  const mes = hoy.slice(0, 7);
  const anio = hoy.slice(0, 4);
  const [a, m] = mes.split('-').map(Number);
  const mesAnt = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  const r: ResumenReferidos = { total: lista.length, esteMes: 0, mesAnterior: 0, convertidos: 0, tasa: 0, pendientesMonto: 0, pendientesN: 0, pagadasMonto: 0, pagadasN: 0, noMonetariasPendientes: 0 };
  for (const x of lista) {
    const dia = diaDe(x.created_at);
    if (dia.startsWith(mes)) r.esteMes += 1;
    else if (dia.startsWith(mesAnt)) r.mesAnterior += 1;
    if (x.status === 'converted') r.convertidos += 1;
    if (recompensaPendiente(x)) {
      r.pendientesN += 1;
      r.pendientesMonto += montoAdeudado(x.program);
      if (!esMonetaria(x.program)) r.noMonetariasPendientes += 1;
    }
    if (x.reward_paid && x.reward_paid_at && diaDe(x.reward_paid_at).startsWith(anio)) {
      r.pagadasN += 1;
      r.pagadasMonto += montoAdeudado(x.program);
    }
  }
  r.tasa = r.total ? Math.round((r.convertidos / r.total) * 100) : 0;
  r.pendientesMonto = Math.round(r.pendientesMonto * 100) / 100;
  r.pagadasMonto = Math.round(r.pagadasMonto * 100) / 100;
  return r;
}

// ─── Filtros, orden y páginas ────────────────────────────────────────────────

/** `'todos'`, `'sin'` (sin programa) o el id de un programa. */
export type FiltroPrograma = string;
export const PROGRAMA_TODOS = 'todos';
export const PROGRAMA_SIN = 'sin';

export interface FiltrosReferidos {
  estado: PestanaEstado;
  programa: FiltroPrograma;
  q: string;
}

export const FILTROS_VACIOS: FiltrosReferidos = { estado: 'todos', programa: PROGRAMA_TODOS, q: '' };

export function hayFiltros(f: FiltrosReferidos): boolean {
  return f.estado !== 'todos' || f.programa !== PROGRAMA_TODOS || f.q.trim() !== '';
}

/** Programa y texto (sin estado): sobre esto se cuentan las pestañas. */
export function filtrarSinEstado(lista: readonly ReferralView[], f: FiltrosReferidos): ReferralView[] {
  const porTexto = filterReferrals([...lista], { status: 'all', q: f.q });
  if (f.programa === PROGRAMA_TODOS) return porTexto;
  if (f.programa === PROGRAMA_SIN) return porTexto.filter((r) => !r.program_id);
  return porTexto.filter((r) => r.program_id === f.programa);
}

export function filtrar(lista: readonly ReferralView[], f: FiltrosReferidos): ReferralView[] {
  const base = filtrarSinEstado(lista, f);
  return f.estado === 'todos' ? base : base.filter((r) => r.status === f.estado);
}

export type CampoOrden = 'referido' | 'registrado';
export interface Orden {
  campo: CampoOrden;
  dir: 'asc' | 'desc';
}
export const ORDEN_INICIAL: Orden = { campo: 'registrado', dir: 'desc' };

export function ordenar(lista: readonly ReferralView[], orden: Orden, idioma = 'es'): ReferralView[] {
  const signo = orden.dir === 'asc' ? 1 : -1;
  return [...lista].sort((a, b) => {
    const c = orden.campo === 'referido' ? a.referred_name.localeCompare(b.referred_name, idioma, { sensitivity: 'base' }) : a.created_at.localeCompare(b.created_at);
    return c * signo || a.id.localeCompare(b.id);
  });
}

export function alternarOrden(actual: Orden, campo: CampoOrden): Orden {
  if (actual.campo !== campo) return { campo, dir: campo === 'registrado' ? 'desc' : 'asc' };
  return { campo, dir: actual.dir === 'asc' ? 'desc' : 'asc' };
}

export function paginar<T>(lista: readonly T[], pagina: number, tamano: number): T[] {
  const ultima = Math.max(1, Math.ceil(lista.length / tamano));
  const p = Math.min(Math.max(1, pagina), ultima);
  return lista.slice((p - 1) * tamano, p * tamano);
}

/** Cuántos referidos tiene cada programa (hoja «Programas»). */
export function referidosPorPrograma(lista: readonly ReferralView[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of lista) if (r.program_id) c[r.program_id] = (c[r.program_id] ?? 0) + 1;
  return c;
}

// ─── Recompensas ─────────────────────────────────────────────────────────────

export type VistaRecompensas = 'pendientes' | 'pagadas';

export function filasRecompensas(lista: readonly ReferralView[], vista: VistaRecompensas): ReferralView[] {
  const filas = vista === 'pendientes' ? lista.filter(recompensaPendiente) : lista.filter((r) => r.reward_paid && !!r.program_id);
  return [...filas].sort((a, b) => (vista === 'pagadas' ? (b.reward_paid_at ?? '').localeCompare(a.reward_paid_at ?? '') : b.created_at.localeCompare(a.created_at)));
}

/** Fecha de conversión mostrable: no hay columna propia; el alta del lead (ficha creada al convertir). */
export function fechaConversion(r: ReferralView): string | null {
  return r.referred?.created_at ?? null;
}

/** Celdas del CSV de recompensas (cabeceras traducidas por la pantalla). */
export function csvRecompensas(filas: readonly ReferralView[], cabeceras: readonly string[], celda: (r: ReferralView) => readonly string[]): string {
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cabeceras.map(esc).join(','), ...filas.map((r) => celda(r).map(esc).join(','))].join('\n');
}
