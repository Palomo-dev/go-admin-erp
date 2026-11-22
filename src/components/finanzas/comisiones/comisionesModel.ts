/**
 * F13 — modelo puro de `/app/finanzas/comisiones`: filtros → query, enlace
 * al origen, acciones que admite una selección y presentación de estado.
 * Sin React ni I/O: probado en `__tests__/comisionesModel.test.ts`.
 */

import { cancellationKind } from '@/lib/services/crm/commissionTransitions';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

export interface ComisionesFiltersState {
  status: 'all' | 'accrued' | 'paid' | 'cancelled';
  source_type: 'all' | 'sale' | 'invoice_sale' | 'invoice_purchase' | 'opportunity';
  payee_id: string;
  /** Días calendario YYYY-MM-DD (zona de la organización); vacíos = sin acotar. */
  from: string;
  to: string;
  search: string;
}

export function emptyFilters(): ComisionesFiltersState {
  return { status: 'all', source_type: 'all', payee_id: '', from: '', to: '', search: '' };
}

/** Tamaño de página de la lista (la API admite hasta 500; devuelve `count` total). */
export const COMMISSIONS_PAGE_SIZE = 200;

export function buildCommissionsQuery(f: ComisionesFiltersState, page?: { offset: number; limit?: number }): string {
  const p = new URLSearchParams();
  if (f.status !== 'all') p.set('status', f.status);
  if (f.source_type !== 'all') p.set('source_type', f.source_type);
  if (f.payee_id) p.set('payee_id', f.payee_id);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const search = f.search.trim();
  if (search) p.set('search', search);
  if (page && page.offset > 0) {
    p.set('offset', String(page.offset));
    p.set('limit', String(page.limit ?? COMMISSIONS_PAGE_SIZE));
  }
  return p.toString();
}

/** Une una página nueva a la lista sin duplicar filas (si algo cambió entre páginas). */
export function appendCommissionPage<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(prev.map((r) => r.id));
  return [...prev, ...next.filter((r) => !seen.has(r.id))];
}

export function activeFilterCount(f: ComisionesFiltersState): number {
  return [f.status !== 'all', f.source_type !== 'all', !!f.payee_id, !!f.from || !!f.to, !!f.search.trim()].filter(Boolean).length;
}

const SOURCE_ROUTES: Record<string, string> = {
  invoice_sale: '/app/finanzas/facturas-venta/',
  invoice_purchase: '/app/finanzas/facturas-compra/',
  opportunity: '/app/crm/oportunidades/',
  sale: '/app/pos/ventas/',
};

export const SOURCE_LABELS: Record<string, string> = {
  sale: 'Venta POS',
  invoice_sale: 'Factura de venta',
  invoice_purchase: 'Factura de compra',
  opportunity: 'Oportunidad',
};

export function sourceHref(row: { source_type: string; source_id: string | null }): string | null {
  const base = SOURCE_ROUTES[row.source_type];
  if (!base || !row.source_id) return null;
  return `${base}${encodeURIComponent(row.source_id)}`;
}

export interface SelectionActions {
  pay: boolean;
  reject: boolean;
  clawback: boolean;
}

/** Una selección solo admite acciones si TODAS sus filas parten del mismo estado. */
export function actionsForSelection(rows: readonly { status: string }[]): SelectionActions {
  if (rows.length === 0) return { pay: false, reject: false, clawback: false };
  const allAccrued = rows.every((r) => r.status === 'accrued');
  const allPaid = rows.every((r) => r.status === 'paid');
  return { pay: allAccrued, reject: allAccrued, clawback: allPaid };
}

export interface SelectionSummary {
  count: number;
  total: number;
  totalLabel: string;
  payee: string;
}

/**
 * Texto para los diálogos: «$250 de Beto» o «$150 de 2 vendedores». `currency`
 * es el código (o el contexto, con locale y decimales) de la moneda de la
 * selección; nunca se supone COP.
 */
export function describeSelection(
  rows: readonly { commission_amount: number | string | null; payee_name: string | null }[],
  currency: string | ContextoMoneda
): SelectionSummary {
  const total = rows.reduce((s, r) => s + (Number(r.commission_amount) || 0), 0);
  const names = Array.from(new Set(rows.map((r) => r.payee_name || 'Sin nombre')));
  const payee = names.length === 1 ? names[0] : `${names.length} vendedores`;
  return { count: rows.length, total, totalLabel: formatMoneda(total, currency), payee };
}

export type StatusTone = 'pending' | 'paid' | 'cancelled';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

export function statusPresentation(row: { status: string; metadata: Record<string, unknown> | null }): StatusPresentation {
  if (row.status === 'accrued') return { label: 'Pendiente', tone: 'pending' };
  if (row.status === 'paid') return { label: 'Pagada', tone: 'paid' };
  const kind = cancellationKind(row.metadata);
  if (kind === 'clawback') return { label: 'Clawback', tone: 'cancelled' };
  if (kind === 'rejected') return { label: 'Rechazada', tone: 'cancelled' };
  return { label: 'Cancelada', tone: 'cancelled' };
}

// ─── Plural y mensajes (ronda 2: «comisiónes» nunca más) ─────────────────────

/** «1 comisión» / «2 comisiones», con participio concordado si se pasa («pagada» → «pagadas»). */
export function pluralComisiones(n: number, participle?: string): string {
  const noun = n === 1 ? 'comisión' : 'comisiones';
  if (!participle) return `${n} ${noun}`;
  return `${n} ${noun} ${n === 1 ? participle : `${participle}s`}`;
}

const ACTION_WORDS: Record<'pagar' | 'rechazar', { done: string; infinitive: string }> = {
  pagar: { done: 'pagada', infinitive: 'pagar' },
  rechazar: { done: 'rechazada', infinitive: 'rechazar' },
};

/** «2 comisiones pagadas · 1 no se pudo pagar (motivo)». */
export function commissionActionMessage(action: 'pagar' | 'rechazar', ok: number, failed: number, firstReason?: string): string {
  const w = ACTION_WORDS[action];
  const head = pluralComisiones(ok, w.done);
  if (failed === 0) return head;
  const verb = failed === 1 ? 'no se pudo' : 'no se pudieron';
  return `${head} · ${failed} ${verb} ${w.infinitive}${firstReason ? ` (${firstReason})` : ''}`;
}

// ─── Foco tras confirmar (brief §4) ──────────────────────────────────────────

/**
 * A dónde vuelve el foco cuando el disparador ya no existe (la fila cambió de
 * estado; la barra de selección se desmontó): el primer candidato que siga en
 * el DOM, en el orden que pase quien llama (fila siguiente → «Actualizar» →
 * «Seleccionar todas»). `null` si no queda nada: nunca se enfoca el `body`.
 */
export function focusAfterCommissionAction<T extends { isConnected: boolean }>(
  opener: T | null,
  candidates: readonly (T | null | undefined)[]
): T | null {
  if (opener && opener.isConnected) return opener;
  for (const c of candidates) if (c && c.isConnected) return c;
  return null;
}

/** Elección de la cuenta de dinero en la confirmación de pago. */
export type CuentaPagoValor = 'rule' | 'cash' | `bank:${number}`;

/**
 * Cuerpo que esperan las rutas de pago. `rule` no manda nada: el asiento usa
 * la cuenta de la regla contable, como antes. `cash` sale de la caja abierta
 * (o la cuenta de caja del plan); `bank:<id>` de esa cuenta bancaria.
 */
export function cuentaPagoABody(v: CuentaPagoValor): { payment_method?: string; bank_account_id?: number } {
  if (v === 'cash') return { payment_method: 'cash' };
  if (v.startsWith('bank:')) {
    const id = Number(v.slice(5));
    if (Number.isInteger(id) && id > 0) return { payment_method: 'transfer', bank_account_id: id };
  }
  return {};
}

// ─── Rediseño Tesorería v2 (Figma 1012:87993 y 1012:89017) ───────────────────

/** Tope del motivo de rechazo y clawback en la UI (el servidor guarda lo que llegue). */
export const REASON_MAX = 500;

/** Lotes de la ruta de pago masivo (`bulk-pay` admite hasta 200 por llamada). */
export const PAGO_LOTE_MAX = 200;

/** Parte una lista en lotes de `tamano` sin perder el orden. */
export function enLotes<T>(lista: readonly T[], tamano = PAGO_LOTE_MAX): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

/** Pestañas de la pantalla: cada una es un filtro de estado de la API. */
export type PestanaComisiones = 'porPagar' | 'pagadas' | 'canceladas' | 'todas';
export const ESTADO_DE_PESTANA: Record<PestanaComisiones, ComisionesFiltersState['status']> = {
  porPagar: 'accrued',
  pagadas: 'paid',
  canceladas: 'cancelled',
  todas: 'all',
};
export function pestanaDeEstado(status: ComisionesFiltersState['status']): PestanaComisiones {
  return (Object.keys(ESTADO_DE_PESTANA) as PestanaComisiones[]).find((p) => ESTADO_DE_PESTANA[p] === status) ?? 'todas';
}

export interface FilaAgrupable {
  id: string;
  payee_id: string | null;
  payee_name: string | null;
  payee_type: string;
  base_amount: number | string;
  commission_amount: number | string;
  currency: string | null;
  status: string;
}

/** Total por moneda: nunca se suman importes de monedas distintas. */
export interface TotalMoneda {
  moneda: string | null;
  base: number;
  comision: number;
}

export function totalesPorMoneda(filas: readonly FilaAgrupable[], monedaBase: string | null = null): TotalMoneda[] {
  const mapa = new Map<string | null, TotalMoneda>();
  for (const f of filas) {
    const moneda = f.currency || monedaBase;
    const t = mapa.get(moneda) ?? { moneda, base: 0, comision: 0 };
    t.base += Number(f.base_amount) || 0;
    t.comision += Number(f.commission_amount) || 0;
    mapa.set(moneda, t);
  }
  // La moneda base primero; las demás en orden alfabético.
  return Array.from(mapa.values()).sort((a, b) =>
    a.moneda === monedaBase ? -1 : b.moneda === monedaBase ? 1 : String(a.moneda).localeCompare(String(b.moneda)),
  );
}

export interface GrupoVendedor<T extends FilaAgrupable> {
  clave: string;
  nombre: string | null;
  payeeType: string;
  filas: T[];
  /** Las que siguen pendientes (`accrued`): lo que paga «Pagar» del grupo. */
  pendientes: T[];
  totales: TotalMoneda[];
}

/** Clave del vendedor: su id; sin id, el nombre (beneficiarios externos). */
export function claveVendedor(f: Pick<FilaAgrupable, 'payee_id' | 'payee_name' | 'payee_type'>): string {
  return f.payee_id ? `id:${f.payee_id}` : `nombre:${f.payee_type}:${(f.payee_name ?? '').trim().toLowerCase()}`;
}

/** Agrupa por vendedor (Figma «por pagar agrupado por vendedor»), en el orden en que aparece cada uno. */
export function agruparPorVendedor<T extends FilaAgrupable>(filas: readonly T[], monedaBase: string | null = null): GrupoVendedor<T>[] {
  const grupos = new Map<string, GrupoVendedor<T>>();
  for (const f of filas) {
    const clave = claveVendedor(f);
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, nombre: f.payee_name, payeeType: f.payee_type, filas: [], pendientes: [], totales: [] };
      grupos.set(clave, g);
    }
    g.filas.push(f);
    if (f.status === 'accrued') g.pendientes.push(f);
  }
  return Array.from(grupos.values()).map((g) => ({ ...g, totales: totalesPorMoneda(g.filas, monedaBase) }));
}

/** Fila de la tabla: la cabecera del vendedor o una comisión suya. */
export type FilaTablaComision<T extends FilaAgrupable> =
  | { tipo: 'grupo'; id: string; grupo: GrupoVendedor<T> }
  | { tipo: 'comision'; id: string; fila: T; grupo: GrupoVendedor<T> };

/** Aplana los grupos para la tabla; los plegados solo muestran su cabecera. */
export function filasDeTabla<T extends FilaAgrupable>(grupos: readonly GrupoVendedor<T>[], plegados: ReadonlySet<string>): FilaTablaComision<T>[] {
  return grupos.flatMap((grupo) => [
    { tipo: 'grupo' as const, id: `g:${grupo.clave}`, grupo },
    ...(plegados.has(grupo.clave) ? [] : grupo.filas.map((fila) => ({ tipo: 'comision' as const, id: fila.id, fila, grupo }))),
  ]);
}

/** Número del comprobante del asiento («CC-12») o «#id» si no tiene consecutivo. */
export function numeroAsiento(a: { id: number; comprobante_prefijo?: string | null; comprobante_numero?: number | null }): string {
  return a.comprobante_numero ? `${a.comprobante_prefijo ?? ''}${a.comprobante_numero}` : `#${a.id}`;
}
