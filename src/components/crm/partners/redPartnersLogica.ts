/**
 * Lógica pura de la pantalla Partners del CRM (Figma «CRM · Red y gestión»,
 * fila 2 · Partners: 1316:773848 Directorio, 1316:776081 Ficha, 1318:91569
 * Registrar deal, 1319:94585 Comisiones y niveles, 1411:41956/42449/42968
 * estados y 1438:1908 móvil). Sin I/O ni React: la reutilizan la página, la
 * ficha y sus pruebas.
 *
 * Reglas de negocio que NO se duplican aquí (regla 7): la tasa efectiva y el
 * resumen de comisiones salen de `partnerCommission`, la promoción y el
 * ranking de niveles de `partnerTierFor`, y la comisión de cada deal la
 * calcula el servidor.
 */

import { effectiveCommissionRate, isCommissionStatus, type CommissionStatus, type DealType } from '@/lib/services/crm/partnerCommission';
import { partnerStats, rankTiers, type PartnerStats, type TierLike } from '@/lib/services/crm/partnerTierFor';
import { toPlainDate } from '@/lib/utils/dateCore';

// ─── Tipos mínimos (estructurales: sirven para PartnerView y para filas de prueba) ──

export interface NivelRef {
  id: string;
  name: string;
  commission_rate: number | string;
}

export interface PartnerFila {
  id: string;
  name: string;
  company_name: string | null;
  email: string;
  phone?: string | null;
  tier_id: string | null;
  tier: NivelRef | null;
  commission_rate: number | string;
  effective_rate: number;
  is_active: boolean;
  deals_count: number;
  revenue_attributed?: number;
  commissions: { outstanding: number; paid: number; pending: number; approved: number; rejected: number; count: number };
}

export interface OportunidadDeal {
  id?: string;
  name?: string | null;
  amount: number | string | null;
  currency?: string | null;
  status: string | null;
  customer_name?: string | null;
}

export interface DealFila {
  id: string;
  partner_id: string;
  deal_type: DealType | string;
  commission_amount: number | string | null;
  commission_status: CommissionStatus | string;
  commission_paid_at: string | null;
  created_at: string;
  opportunity: OportunidadDeal | null;
  partner?: { id: string; name: string } | null;
}

export type TonoBadgePartner = 'marca' | 'exito' | 'advertencia' | 'peligro' | 'informacion' | 'neutro';

// ─── Pestañas ───────────────────────────────────────────────────────────────

export const PESTANAS_PARTNERS = ['partners', 'deals', 'comisiones', 'niveles'] as const;
export type PestanaPartners = (typeof PESTANAS_PARTNERS)[number];

/** Pestaña de la URL; «Comisiones» se oculta sin permiso de gestión (anotación 1411:43453). */
export function pestanaPartners(valor: string | null | undefined, puedeGestionar: boolean): PestanaPartners {
  const v = (PESTANAS_PARTNERS as readonly string[]).includes(valor ?? '') ? (valor as PestanaPartners) : 'partners';
  return v === 'comisiones' && !puedeGestionar ? 'partners' : v;
}

export const PESTANAS_FICHA = ['deals', 'comisiones', 'datos'] as const;
export type PestanaFicha = (typeof PESTANAS_FICHA)[number];

// ─── Tonos de las insignias ─────────────────────────────────────────────────

export const TONO_COMISION: Record<CommissionStatus, TonoBadgePartner> = {
  pending: 'advertencia',
  approved: 'informacion',
  paid: 'exito',
  rejected: 'peligro',
};

export const TONO_TIPO_DEAL: Record<DealType, TonoBadgePartner> = {
  referral: 'informacion',
  co_sell: 'marca',
  reseller: 'neutro',
};

export function tonoComision(status: string): TonoBadgePartner {
  return isCommissionStatus(status) ? TONO_COMISION[status] : 'neutro';
}

export function tonoTipoDeal(tipo: string): TonoBadgePartner {
  return (TONO_TIPO_DEAL as Record<string, TonoBadgePartner>)[tipo] ?? 'neutro';
}

export type EstadoNegocio = 'ganado' | 'perdido' | 'abierto';

/** `opportunities.status` (CHECK open|won|lost, verificado por MCP 2026-11-15). */
export function estadoNegocio(status: string | null | undefined): EstadoNegocio {
  return status === 'won' ? 'ganado' : status === 'lost' ? 'perdido' : 'abierto';
}

export const TONO_NEGOCIO: Record<EstadoNegocio, TonoBadgePartner> = { ganado: 'exito', perdido: 'peligro', abierto: 'neutro' };

/**
 * Tono del nivel por su posición en el ranking (de menor a mayor exigencia):
 * el primero azul, el segundo gris, el tercero ámbar y del cuarto en adelante
 * el de marca, como Bronce · Plata · Oro · Platino del Figma. Sin nivel: gris.
 */
export function tonoNivel(tierId: string | null | undefined, tiers: ReadonlyArray<TierLike>): TonoBadgePartner {
  if (!tierId) return 'neutro';
  const idx = rankTiers(tiers).findIndex((t) => t.id === tierId);
  if (idx < 0) return 'neutro';
  return (['informacion', 'neutro', 'advertencia'] as const)[idx] ?? 'marca';
}

// ─── Comisión efectiva ──────────────────────────────────────────────────────

export type FuenteTasa = 'propia' | 'nivel' | 'sinNivel';

/** De dónde sale la tasa efectiva (columna «Comisión»: «del nivel», «propia», «sin nivel»). */
export function fuenteTasa(p: { commission_rate: number | string | null; tier: NivelRef | null }): FuenteTasa {
  const own = Number(p.commission_rate);
  if (Number.isFinite(own) && own > 0) return 'propia';
  return p.tier ? 'nivel' : 'sinNivel';
}

export function tasaEfectiva(p: { commission_rate: number | string | null }, tier: { commission_rate: number | string | null } | null): number {
  return effectiveCommissionRate(p, tier);
}

// ─── Filtros y orden del directorio ─────────────────────────────────────────

export const SIN_NIVEL = 'sin-nivel';
export type EstadoFiltro = 'activos' | 'inactivos' | 'todos';

export interface FiltrosPartners {
  q: string;
  /** '' = todos · id de nivel · `SIN_NIVEL`. */
  nivel: string;
  estado: EstadoFiltro;
}

export const FILTROS_PARTNERS_INICIALES: FiltrosPartners = { q: '', nivel: '', estado: 'activos' };

export function hayFiltrosPartners(f: FiltrosPartners): boolean {
  return f.q.trim() !== '' || f.nivel !== '' || f.estado !== 'activos';
}

function norm(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrarPartners<P extends PartnerFila>(lista: readonly P[], f: FiltrosPartners): P[] {
  const q = norm(f.q).trim();
  return lista.filter((p) => {
    if (f.estado === 'activos' && !p.is_active) return false;
    if (f.estado === 'inactivos' && p.is_active) return false;
    if (f.nivel === SIN_NIVEL && p.tier) return false;
    if (f.nivel && f.nivel !== SIN_NIVEL && p.tier?.id !== f.nivel) return false;
    if (!q) return true;
    return [p.name, p.company_name, p.email].some((v) => norm(v).includes(q));
  });
}

export type CampoOrdenPartners = 'nombre' | 'deals' | 'revenue';
export interface OrdenPartners {
  campo: CampoOrdenPartners | string;
  direccion: 'asc' | 'desc';
}

export function ordenarPartners<P extends PartnerFila>(lista: readonly P[], orden: OrdenPartners | null): P[] {
  if (!orden) return [...lista];
  const dir = orden.direccion === 'desc' ? -1 : 1;
  const valor = (p: P): number | string =>
    orden.campo === 'deals' ? p.deals_count : orden.campo === 'revenue' ? p.revenue_attributed ?? 0 : norm(p.name);
  return [...lista].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'es') * dir;
  });
}

/** Deals por oportunidad (nombre) o por monto de la oportunidad. */
export function ordenarDeals<D extends DealFila>(lista: readonly D[], orden: OrdenPartners | null): D[] {
  if (!orden) return [...lista];
  const dir = orden.direccion === 'desc' ? -1 : 1;
  return [...lista].sort((a, b) =>
    orden.campo === 'monto'
      ? (monto(a.opportunity?.amount) - monto(b.opportunity?.amount)) * dir
      : norm(a.opportunity?.name).localeCompare(norm(b.opportunity?.name), 'es') * dir,
  );
}

/** Siguiente orden al pulsar la cabecera: asc → desc → sin orden. */
export function siguienteOrden(actual: OrdenPartners | null, campo: string): OrdenPartners | null {
  if (!actual || actual.campo !== campo) return { campo, direccion: 'asc' };
  return actual.direccion === 'asc' ? { campo, direccion: 'desc' } : null;
}

export function paginar<T>(lista: readonly T[], pagina: number, tamano: number): T[] {
  const desde = Math.max(0, (pagina - 1) * tamano);
  return lista.slice(desde, desde + tamano);
}

// ─── Año en la zona de la organización ──────────────────────────────────────

/** Año calendario de un `timestamptz` en la zona horaria de la organización (nunca el día UTC). */
export function anioEnZona(iso: string | null | undefined, zona: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Number(toPlainDate(d, zona).slice(0, 4));
}

/** Años con deals registrados, más el actual; de más reciente a más antiguo. */
export function aniosConDeals(deals: ReadonlyArray<Pick<DealFila, 'created_at'>>, zona: string, anioActual: number): number[] {
  const set = new Set<number>([anioActual]);
  for (const d of deals) {
    const a = anioEnZona(d.created_at, zona);
    if (a) set.add(a);
  }
  return [...set].sort((a, b) => b - a);
}

function monto(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// ─── KPI del directorio (1316:774347) ───────────────────────────────────────

export interface KpisPartners {
  activos: number;
  inactivos: number;
  dealsAnio: number;
  ganadosAnio: number;
  abiertosAnio: number;
  /** Pendientes + aprobadas (todas las fechas): lo que falta registrar como pagado. */
  porPagar: number;
  porPagarCantidad: number;
  pagadoAnio: number;
  pagadasAnio: number;
}

export function kpisPartners(partners: ReadonlyArray<Pick<PartnerFila, 'is_active'>>, deals: readonly DealFila[], anio: number, zona: string): KpisPartners {
  const k: KpisPartners = { activos: 0, inactivos: 0, dealsAnio: 0, ganadosAnio: 0, abiertosAnio: 0, porPagar: 0, porPagarCantidad: 0, pagadoAnio: 0, pagadasAnio: 0 };
  for (const p of partners) {
    if (p.is_active) k.activos += 1;
    else k.inactivos += 1;
  }
  for (const d of deals) {
    if (anioEnZona(d.created_at, zona) === anio) {
      k.dealsAnio += 1;
      const negocio = estadoNegocio(d.opportunity?.status);
      if (negocio === 'ganado') k.ganadosAnio += 1;
      else if (negocio === 'abierto') k.abiertosAnio += 1;
    }
    if (d.commission_status === 'pending' || d.commission_status === 'approved') {
      k.porPagar += monto(d.commission_amount);
      k.porPagarCantidad += 1;
    }
    if (d.commission_status === 'paid' && anioEnZona(d.commission_paid_at, zona) === anio) {
      k.pagadoAnio += monto(d.commission_amount);
      k.pagadasAnio += 1;
    }
  }
  k.porPagar = redondear(k.porPagar);
  k.pagadoAnio = redondear(k.pagadoAnio);
  return k;
}

// ─── Acción de cada deal (Ficha 1316:776081) ────────────────────────────────

/**
 * Qué se ofrece en la fila del deal según la máquina de la comisión
 * (`pending → approved → paid | rejected`) y el negocio:
 * - pendiente con negocio ganado → «Aprobar» / «Rechazar»;
 * - pendiente con negocio abierto → «Se aprueba al ganarse» (texto);
 * - pendiente con negocio perdido → «Rechazar»;
 * - aprobada → «Registrar pago»; pagada → «Pagada el …»; rechazada → «No cuenta para el nivel».
 * Sin permiso de gestión, solo los textos (el servidor exige admin/manager igual).
 */
export type AccionDeal = 'aprobarRechazar' | 'rechazar' | 'registrarPago' | 'esperaGanar' | 'pagada' | 'noCuenta' | 'ninguna';

export function accionDeal(d: Pick<DealFila, 'commission_status' | 'opportunity'>, puedeGestionar: boolean): AccionDeal {
  const negocio = estadoNegocio(d.opportunity?.status);
  switch (d.commission_status) {
    case 'pending':
      if (negocio === 'abierto') return 'esperaGanar';
      if (!puedeGestionar) return 'ninguna';
      return negocio === 'ganado' ? 'aprobarRechazar' : 'rechazar';
    case 'approved':
      return puedeGestionar ? 'registrarPago' : 'ninguna';
    case 'paid':
      return 'pagada';
    case 'rejected':
      return 'noCuenta';
    default:
      return 'ninguna';
  }
}

// ─── Ficha: cifras y camino al siguiente nivel ──────────────────────────────

export interface CifrasFicha {
  deals: number;
  revenue: number;
  porPagar: number;
  pagada: number;
  comisiones: number;
}

export function cifrasFicha(deals: readonly DealFila[]): CifrasFicha {
  let revenue = 0;
  let porPagar = 0;
  let pagada = 0;
  let noRechazados = 0;
  let comisiones = 0;
  for (const d of deals) {
    if (d.commission_status === 'rejected') continue;
    noRechazados += 1;
    if (monto(d.commission_amount) > 0) comisiones += 1;
    if (d.opportunity?.status === 'won') revenue += monto(d.opportunity.amount);
    if (d.commission_status === 'paid') pagada += monto(d.commission_amount);
    else porPagar += monto(d.commission_amount);
  }
  return { deals: noRechazados, revenue: redondear(revenue), porPagar: redondear(porPagar), pagada: redondear(pagada), comisiones };
}

export interface CaminoNivel<T extends TierLike = TierLike> {
  siguiente: T;
  deals: { actual: number; meta: number };
  revenue: { actual: number; meta: number };
}

/**
 * Camino al nivel inmediatamente superior al actual con los DOS umbrales que
 * usa la promoción (`partnerStats`: deals no rechazados y su monto). `null` si
 * ya está en el más alto o no hay niveles.
 */
export function caminoSiguienteNivel<T extends TierLike>(
  deals: ReadonlyArray<Pick<DealFila, 'commission_status' | 'opportunity'>>,
  tiers: readonly T[],
  tierActualId: string | null | undefined,
): CaminoNivel<T> | null {
  const ranked = rankTiers(tiers);
  if (ranked.length === 0) return null;
  const idx = tierActualId ? ranked.findIndex((t) => t.id === tierActualId) : -1;
  const siguiente = ranked[idx + 1];
  if (!siguiente) return null;
  const stats: PartnerStats = partnerStats(deals.map((d) => ({ commission_status: d.commission_status, amount: d.opportunity?.amount ?? null })));
  return {
    siguiente,
    deals: { actual: stats.deals, meta: monto(siguiente.min_deals) },
    revenue: { actual: stats.revenue, meta: monto(siguiente.min_revenue) },
  };
}

export function beneficiosNivel(benefits: unknown): string[] {
  return Array.isArray(benefits) ? benefits.filter((b): b is string => typeof b === 'string' && b.trim() !== '') : [];
}

// ─── Comisiones del año (1319:94585) ────────────────────────────────────────

export interface TramoComision {
  estado: CommissionStatus;
  monto: number;
  /** Porcentaje entero sobre el total del año (0 si no hay total). */
  pct: number;
}

export interface ResumenComisionesAnio {
  total: number;
  tramos: TramoComision[];
}

const ORDEN_TRAMOS: CommissionStatus[] = ['paid', 'approved', 'pending', 'rejected'];

/** Comisiones por fecha de registro del deal, agregadas por estado. */
export function resumenComisionesAnio(deals: readonly DealFila[], anio: number, zona: string): ResumenComisionesAnio {
  const suma: Record<CommissionStatus, number> = { pending: 0, approved: 0, paid: 0, rejected: 0 };
  for (const d of deals) {
    if (anioEnZona(d.created_at, zona) !== anio || !isCommissionStatus(d.commission_status)) continue;
    suma[d.commission_status] += monto(d.commission_amount);
  }
  const total = redondear(ORDEN_TRAMOS.reduce((acc, e) => acc + suma[e], 0));
  return {
    total,
    tramos: ORDEN_TRAMOS.map((estado) => ({ estado, monto: redondear(suma[estado]), pct: total > 0 ? Math.round((suma[estado] / total) * 100) : 0 })),
  };
}

export interface FilaComisionPartner {
  partnerId: string;
  nombre: string;
  nivel: string | null;
  tasa: number;
  propia: boolean;
  pendiente: number;
  aprobada: number;
  pagada: number;
  total: number;
}

export interface TablaComisiones {
  filas: FilaComisionPartner[];
  total: Omit<FilaComisionPartner, 'partnerId' | 'nombre' | 'nivel' | 'tasa' | 'propia'>;
}

/** Una fila por partner con movimiento en el año (pendiente, aprobada o pagada); el total excluye las rechazadas. */
export function comisionesPorPartner(partners: readonly PartnerFila[], deals: readonly DealFila[], anio: number, zona: string): TablaComisiones {
  const porPartner = new Map<string, { pendiente: number; aprobada: number; pagada: number }>();
  for (const d of deals) {
    if (anioEnZona(d.created_at, zona) !== anio) continue;
    const acc = porPartner.get(d.partner_id) ?? { pendiente: 0, aprobada: 0, pagada: 0 };
    const m = monto(d.commission_amount);
    if (d.commission_status === 'pending') acc.pendiente += m;
    else if (d.commission_status === 'approved') acc.aprobada += m;
    else if (d.commission_status === 'paid') acc.pagada += m;
    else continue;
    porPartner.set(d.partner_id, acc);
  }
  const filas: FilaComisionPartner[] = [];
  for (const p of partners) {
    const acc = porPartner.get(p.id);
    if (!acc) continue;
    const total = redondear(acc.pendiente + acc.aprobada + acc.pagada);
    if (total === 0) continue;
    filas.push({
      partnerId: p.id,
      nombre: p.name,
      nivel: p.tier?.name ?? null,
      tasa: p.effective_rate,
      propia: fuenteTasa(p) === 'propia',
      pendiente: redondear(acc.pendiente),
      aprobada: redondear(acc.aprobada),
      pagada: redondear(acc.pagada),
      total,
    });
  }
  filas.sort((a, b) => b.total - a.total);
  const total = filas.reduce(
    (acc, f) => ({ pendiente: acc.pendiente + f.pendiente, aprobada: acc.aprobada + f.aprobada, pagada: acc.pagada + f.pagada, total: acc.total + f.total }),
    { pendiente: 0, aprobada: 0, pagada: 0, total: 0 },
  );
  return { filas, total: { pendiente: redondear(total.pendiente), aprobada: redondear(total.aprobada), pagada: redondear(total.pagada), total: redondear(total.total) } };
}

export function partnersEnNivel(partners: ReadonlyArray<Pick<PartnerFila, 'tier_id'>>, tierId: string): number {
  return partners.filter((p) => p.tier_id === tierId).length;
}

// ─── Moneda ─────────────────────────────────────────────────────────────────

/** Moneda de las cifras agregadas: la única de los deals; si no hay o se mezclan, la de la organización. */
export function monedaDeals(deals: ReadonlyArray<Pick<DealFila, 'opportunity'>>, monedaOrganizacion: string): { moneda: string; mezcladas: boolean } {
  const set = new Set(deals.map((d) => (d.opportunity?.currency ?? '').trim().toUpperCase()).filter(Boolean));
  if (set.size === 1) return { moneda: [...set][0], mezcladas: false };
  return { moneda: monedaOrganizacion, mezcladas: set.size > 1 };
}

/** «$ 86,4 M» para las cifras compactas del móvil. */
export function montoCompacto(valor: number, moneda: string, idioma: string): string {
  try {
    return new Intl.NumberFormat(idioma, { style: 'currency', currency: moneda, notation: 'compact', maximumFractionDigits: 1 }).format(valor);
  } catch {
    return new Intl.NumberFormat(idioma, { notation: 'compact', maximumFractionDigits: 1 }).format(valor);
  }
}

// ─── Exportar ───────────────────────────────────────────────────────────────

function celdaCsv(v: string | number): string {
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV del directorio (lo que se ve con los filtros aplicados). Montos sin formato para hojas de cálculo. */
export function csvPartners(
  partners: readonly PartnerFila[],
  encabezados: readonly string[],
  textos: { activo: string; inactivo: string; sinNivel: string },
): string {
  const filas = partners.map((p) => [
    p.name,
    p.company_name ?? '',
    p.email,
    p.phone ?? '',
    p.tier?.name ?? textos.sinNivel,
    p.effective_rate,
    p.deals_count,
    p.revenue_attributed ?? 0,
    p.commissions.outstanding,
    p.is_active ? textos.activo : textos.inactivo,
  ]);
  return [encabezados, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n');
}
