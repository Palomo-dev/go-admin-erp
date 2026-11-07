/**
 * Cotizaciones — listado y reglas de presentación (Figma «Finanzas — Documentos
 * v2»: listado `1022:93252`, vacío `1023:95103`, detalle enviada `1022:94293`,
 * vencida `1022:95217`, convertida `1022:96025`; docs/design/FINANZAS-DOCUMENTOS-V2.md §3).
 *
 * Módulo hoja, sin React ni Supabase: lo usan la ruta `GET /api/cotizaciones?vista=listado`
 * (filtra, ordena, pagina y cuenta los KPI en el servidor sobre lo que entrega
 * `fn_cotizaciones_listado`, que ya deriva «vencida» con el día de la
 * organización), la pantalla y las pruebas.
 *
 * Fechas: `issue_date` y `valid_until` son columnas `date`; se comparan como
 * días planos `YYYY-MM-DD` contra el «hoy» de la organización, sin zona.
 */
import { z } from 'zod';
import type { CotizacionResumen, EstadoCotizacion } from './contratoCotizaciones';

export const RUTA_COTIZACIONES = '/app/finanzas/cotizaciones';

/** Filtros que la pantalla guarda en la URL y la ruta acepta. */
export const FILTROS_LISTADO_COTIZACIONES = ['estado', 'cliente', 'vendedor', 'desde', 'hasta', 'vigencia', 'monto_min', 'monto_max', 'oportunidad'] as const;
export const CAMPOS_ORDEN_COTIZACIONES = ['numero', 'cliente', 'emision', 'vigencia', 'total', 'estado'] as const;
export const TAMANOS_PAGINA_COTIZACIONES = [10, 25, 50, 100] as const;
/** Días hacia adelante que cuentan como «por vencer» (KPI y filtro). */
export const DIAS_POR_VENCER = 7;

export type VigenciaFiltro = 'por_vencer' | 'vencidas';
export type CampoOrdenCotizacion = (typeof CAMPOS_ORDEN_COTIZACIONES)[number];

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monto = z.coerce.number().finite().min(0);

/** Parámetros de `GET /api/cotizaciones?vista=listado` (lista blanca). */
export const parametrosListadoSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    estado: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'abiertas']).optional(),
    cliente: z.string().uuid().optional(),
    vendedor: z.string().uuid().optional(),
    desde: dia.optional(),
    hasta: dia.optional(),
    vigencia: z.enum(['por_vencer', 'vencidas']).optional(),
    monto_min: monto.optional(),
    monto_max: monto.optional(),
    oportunidad: z.enum(['con', 'sin']).optional(),
    kpi_desde: dia.optional(),
    kpi_hasta: dia.optional(),
    sucursal: z.coerce.number().int().positive().optional(),
    orden: z.string().regex(/^[a-z_]+\.(asc|desc)$/).optional(),
    pagina: z.coerce.number().int().min(1).max(10000).optional(),
    tamano: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strip();
export type ParametrosListadoCotizaciones = z.infer<typeof parametrosListadoSchema>;

/** Fila del listado tal como la pinta la pantalla. */
export interface FilaCotizacionListado {
  id: string;
  numero: string;
  /** Estado vivo: incluye 'expired' derivado al leer. */
  estado: EstadoCotizacion;
  estado_guardado: string;
  cliente_id: string | null;
  cliente: string | null;
  cliente_doc: string | null;
  cliente_correo: string | null;
  emision: string;
  valida_hasta: string | null;
  /** Días hasta `valida_hasta` (negativo = venció hace N días); null sin vigencia. */
  dias_vigencia: number | null;
  moneda: string;
  total: number;
  vendedor_id: string | null;
  vendedor: string | null;
  oportunidad_id: string | null;
  oportunidad: string | null;
  factura_id: string | null;
  sucursal_id: number | null;
}

export interface KpisCotizaciones {
  moneda: string;
  abiertas: number;
  valor_abiertas: number;
  por_vencer: number;
  valor_por_vencer: number;
  vencidas: number;
  /** Cotizaciones del periodo que salieron al cliente (no borradores). */
  enviadas_periodo: number;
  convertidas_periodo: number;
}

export interface RespuestaListadoCotizaciones {
  filas: FilaCotizacionListado[];
  total: number;
  kpis: KpisCotizaciones[];
  hoy: string;
}

/** Datos extra que la ruta lee para la página (documento del cliente, vendedor y oportunidad). */
export interface Enriquecimiento {
  documentos?: ReadonlyMap<string, string | null>;
  vendedores?: ReadonlyMap<string, string>;
  oportunidades?: ReadonlyMap<string, string>;
}

// ─── Fechas planas ──────────────────────────────────────────────────────────

function aUtc(d: string): number {
  const [a, m, di] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, di);
}

/** Días de `desde` a `hasta` (días planos; positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

// ─── Estado ─────────────────────────────────────────────────────────────────

/** Borrador o enviada: lo que todavía espera una respuesta (el KPI «Abiertas»). */
export function esAbierta(estado: string): boolean {
  return estado === 'draft' || estado === 'sent';
}

/**
 * Estado del `StatusBadge`: la tabla del kit rotula 'expired' como
 * «Expirada»; la cotización dice «Vencida» (tono peligro), como el Figma.
 */
export function estadoBadgeCotizacion(estado: string): string {
  return estado === 'expired' ? 'vencida' : estado;
}

export type TipoVigencia = 'sin' | 'vigente' | 'vence_pronto' | 'vence_hoy' | 'vencio';

/** Cómo pintar «Válida hasta»: en rojo si venció, en advertencia si vence en los próximos días. */
export function vigenciaDe(fila: Pick<FilaCotizacionListado, 'estado' | 'dias_vigencia'>): { tipo: TipoVigencia; dias: number } {
  const d = fila.dias_vigencia;
  if (d === null) return { tipo: 'sin', dias: 0 };
  if (fila.estado === 'expired' || (d < 0 && esAbierta(fila.estado))) return { tipo: 'vencio', dias: Math.abs(d) };
  if (!esAbierta(fila.estado)) return { tipo: 'vigente', dias: d };
  if (d === 0) return { tipo: 'vence_hoy', dias: 0 };
  if (d > 0 && d <= DIAS_POR_VENCER) return { tipo: 'vence_pronto', dias: d };
  return { tipo: 'vigente', dias: d };
}

// ─── De la RPC a la fila ────────────────────────────────────────────────────

export function aFila(c: CotizacionResumen, hoy: string, extra: Enriquecimiento = {}): FilaCotizacionListado {
  return {
    id: c.id,
    numero: c.number,
    estado: c.status,
    estado_guardado: c.stored_status,
    cliente_id: c.customer_id || null,
    cliente: c.customers?.full_name || null,
    cliente_doc: (c.customer_id && extra.documentos?.get(c.customer_id)) || null,
    cliente_correo: c.customers?.email ?? null,
    emision: c.issue_date,
    valida_hasta: c.valid_until,
    dias_vigencia: c.valid_until ? diasEntre(hoy, c.valid_until) : null,
    moneda: c.currency,
    total: c.total,
    vendedor_id: c.salesperson_id,
    vendedor: (c.salesperson_id && extra.vendedores?.get(c.salesperson_id)) || null,
    oportunidad_id: c.opportunity_id,
    oportunidad: (c.opportunity_id && extra.oportunidades?.get(c.opportunity_id)) || null,
    factura_id: c.converted_invoice_id,
    sucursal_id: c.branch_id,
  };
}

// ─── Filtros, orden y página ────────────────────────────────────────────────

function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filtrarCotizaciones(filas: readonly FilaCotizacionListado[], p: ParametrosListadoCotizaciones): FilaCotizacionListado[] {
  const q = normalizar(p.q?.trim());
  return filas.filter((f) => {
    if (q && ![f.numero, f.cliente, f.cliente_doc, f.cliente_correo].some((v) => normalizar(v).includes(q))) return false;
    if (p.estado === 'abiertas') {
      if (!esAbierta(f.estado)) return false;
    } else if (p.estado && f.estado !== p.estado) return false;
    if (p.cliente && f.cliente_id !== p.cliente) return false;
    if (p.vendedor && f.vendedor_id !== p.vendedor) return false;
    if (p.desde && f.emision < p.desde) return false;
    if (p.hasta && f.emision > p.hasta) return false;
    if (p.monto_min !== undefined && f.total < p.monto_min) return false;
    if (p.monto_max !== undefined && f.total > p.monto_max) return false;
    if (p.oportunidad === 'con' && !f.oportunidad_id) return false;
    if (p.oportunidad === 'sin' && f.oportunidad_id) return false;
    if (p.vigencia === 'vencidas' && f.estado !== 'expired') return false;
    if (p.vigencia === 'por_vencer') {
      if (!esAbierta(f.estado) || f.dias_vigencia === null || f.dias_vigencia < 0 || f.dias_vigencia > DIAS_POR_VENCER) return false;
    }
    return true;
  });
}

const ORDEN_ESTADO: Record<string, number> = { expired: 0, sent: 1, draft: 2, accepted: 3, converted: 4, rejected: 5 };

export function ordenarCotizaciones(filas: readonly FilaCotizacionListado[], orden: string | undefined): FilaCotizacionListado[] {
  const [campo, dir] = (orden ?? 'emision.desc').split('.') as [string, 'asc' | 'desc'];
  const s = dir === 'asc' ? 1 : -1;
  const valor = (f: FilaCotizacionListado): string | number => {
    switch (campo) {
      case 'numero':
        return f.numero;
      case 'cliente':
        return normalizar(f.cliente);
      case 'vigencia':
        return f.valida_hasta ?? '9999-12-31';
      case 'total':
        return f.total;
      case 'estado':
        return ORDEN_ESTADO[f.estado] ?? 9;
      default:
        return f.emision;
    }
  };
  return [...filas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va < vb) return -1 * s;
    if (va > vb) return 1 * s;
    // Desempate estable: el número, de mayor a menor.
    return a.numero < b.numero ? 1 : a.numero > b.numero ? -1 : 0;
  });
}

/** Orden de la URL (`useListadoServidor`) → parámetro `orden` de la ruta. */
export function ordenCotizacionesRuta(campo: string | undefined, direccion: 'asc' | 'desc' | undefined): string {
  const c = (CAMPOS_ORDEN_COTIZACIONES as readonly string[]).includes(campo ?? '') ? campo : 'emision';
  return `${c}.${direccion ?? 'desc'}`;
}

// ─── KPI ────────────────────────────────────────────────────────────────────

/**
 * KPI por moneda sobre TODAS las cotizaciones del alcance (sucursal), sin los
 * filtros del listado: abiertas (borrador + enviada) con su valor, por vencer
 * en `DIAS_POR_VENCER` días, vencidas sin respuesta y, del periodo, enviadas
 * y convertidas (la tasa de conversión es convertidas / enviadas).
 */
export function kpisCotizaciones(filas: readonly FilaCotizacionListado[], periodo: { desde?: string; hasta?: string }): KpisCotizaciones[] {
  const porMoneda = new Map<string, KpisCotizaciones>();
  for (const f of filas) {
    const k =
      porMoneda.get(f.moneda) ??
      ({ moneda: f.moneda, abiertas: 0, valor_abiertas: 0, por_vencer: 0, valor_por_vencer: 0, vencidas: 0, enviadas_periodo: 0, convertidas_periodo: 0 } as KpisCotizaciones);
    if (esAbierta(f.estado)) {
      k.abiertas += 1;
      k.valor_abiertas += f.total;
      if (f.dias_vigencia !== null && f.dias_vigencia >= 0 && f.dias_vigencia <= DIAS_POR_VENCER) {
        k.por_vencer += 1;
        k.valor_por_vencer += f.total;
      }
    }
    if (f.estado === 'expired') k.vencidas += 1;
    const enPeriodo = (!periodo.desde || f.emision >= periodo.desde) && (!periodo.hasta || f.emision <= periodo.hasta);
    if (enPeriodo && f.estado_guardado !== 'draft') {
      k.enviadas_periodo += 1;
      if (f.estado === 'converted') k.convertidas_periodo += 1;
    }
    porMoneda.set(f.moneda, k);
  }
  return [...porMoneda.values()].map((k) => ({ ...k, valor_abiertas: redondear(k.valor_abiertas), valor_por_vencer: redondear(k.valor_por_vencer) }));
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tasa de conversión 0–100 (entera) o null si no hubo enviadas. */
export function tasaConversion(k: Pick<KpisCotizaciones, 'enviadas_periodo' | 'convertidas_periodo'> | null | undefined): number | null {
  if (!k || k.enviadas_periodo === 0) return null;
  return Math.round((k.convertidas_periodo / k.enviadas_periodo) * 100);
}

/** Todo el listado de una vez: filtros, orden, página y KPI. */
export function construirListado(filas: readonly FilaCotizacionListado[], p: ParametrosListadoCotizaciones, hoy: string): RespuestaListadoCotizaciones {
  const filtradas = ordenarCotizaciones(filtrarCotizaciones(filas, p), p.orden);
  const tamano = p.tamano ?? 25;
  const pagina = p.pagina ?? 1;
  const desde = (pagina - 1) * tamano;
  return {
    filas: filtradas.slice(desde, desde + tamano),
    total: filtradas.length,
    kpis: kpisCotizaciones(filas, { desde: p.kpi_desde, hasta: p.kpi_hasta }),
    hoy,
  };
}

// ─── Acciones según el estado (detalle y menú de fila) ──────────────────────

export type AccionCotizacion =
  | 'enviar'
  | 'reenviar'
  /** Sin correo: la cotización salió por otro canal (como el «Marcar como enviada» de antes). */
  | 'marcar_enviada'
  | 'convertir'
  | 'ver_factura'
  | 'duplicar'
  | 'renovar'
  | 'editar'
  | 'aceptar'
  | 'rechazar'
  | 'eliminar'
  | 'pdf'
  | 'imprimir';

export interface PermisosCotizacion {
  /** finance.create o sales_management (crear, editar, enviar, estado, duplicar, eliminar). */
  escribir: boolean;
  /** finance.create (crea una factura). */
  convertir: boolean;
}

export interface AccionesCotizacion {
  primaria: AccionCotizacion | null;
  /** Botones secundarios visibles junto a la primaria. */
  secundarias: AccionCotizacion[];
  /** Entradas del menú «⋯», en orden. */
  menu: AccionCotizacion[];
}

/**
 * Acciones por estado (§3.3 y frames de detalle), con las reglas de la base:
 * - Editar mira el estado GUARDADO (borrador o enviada; una vencida se edita
 *   para renovar su vigencia). Convertir y aceptar, el estado VIVO.
 * - Una vencida no se convierte (`fn_cotizacion_convertir`): la primaria es
 *   «Duplicar con vigencia desde hoy»; solo se puede rechazar.
 * - Eliminar, solo borradores (`fn_cotizacion_eliminar`).
 */
export function accionesCotizacion(
  c: { estado: string; estado_guardado: string; factura_id: string | null },
  permisos: PermisosCotizacion,
): AccionesCotizacion {
  const w = permisos.escribir;
  const editable = w && (c.estado_guardado === 'draft' || c.estado_guardado === 'sent');
  const base: AccionCotizacion[] = ['pdf', 'imprimir'];
  switch (c.estado) {
    case 'draft':
      return {
        primaria: w ? 'enviar' : null,
        secundarias: editable ? ['editar'] : [],
        menu: [...base, ...(permisos.convertir ? (['convertir'] as const) : []), ...(w ? (['marcar_enviada', 'duplicar', 'aceptar', 'rechazar', 'eliminar'] as const) : [])],
      };
    case 'sent':
      return {
        primaria: permisos.convertir ? 'convertir' : w ? 'reenviar' : null,
        secundarias: permisos.convertir && w ? ['reenviar'] : [],
        menu: [...base, ...(w ? (['aceptar', 'rechazar', 'editar', 'duplicar'] as const) : [])].filter((a) => a !== 'editar' || editable),
      };
    case 'accepted':
      return {
        primaria: permisos.convertir ? 'convertir' : null,
        secundarias: w ? ['reenviar'] : [],
        menu: [...base, ...(w ? (['duplicar'] as const) : [])],
      };
    case 'expired':
      return {
        primaria: w ? 'renovar' : null,
        secundarias: ['pdf'],
        menu: ['imprimir', ...(editable ? (['editar'] as const) : []), ...(w ? (['rechazar'] as const) : [])],
      };
    case 'converted':
      return {
        primaria: c.factura_id ? 'ver_factura' : null,
        secundarias: ['pdf'],
        menu: ['imprimir', ...(w ? (['duplicar'] as const) : [])],
      };
    default:
      // Rechazada: solo consultar o partir de ella.
      return { primaria: w ? 'duplicar' : null, secundarias: ['pdf'], menu: ['imprimir'] };
  }
}

/** Acción rápida de la fila del listado (Figma: Convertir · Enviar · Duplicar). */
export function accionRapidaFila(c: { estado: string }, permisos: PermisosCotizacion): 'convertir' | 'enviar' | 'renovar' | null {
  if ((c.estado === 'sent' || c.estado === 'accepted') && permisos.convertir) return 'convertir';
  if (c.estado === 'draft' && permisos.escribir) return 'enviar';
  if (c.estado === 'expired' && permisos.escribir) return 'renovar';
  return null;
}

// ─── Impuestos por tarifa (detalle y «Qué se copia» al convertir) ───────────

export interface ImpuestoCotizacion {
  codigo: string | null;
  tarifa: number;
  base: number;
  importe: number;
}

/**
 * Agrupa los impuestos de las líneas guardadas por tarifa. La base sale del
 * neto de la línea (cantidad × precio − descuento; si el precio incluye el
 * impuesto, se le descuenta) y el importe es lo que `total_line` suma sobre
 * esa base: los mismos números que calculó la base de datos.
 */
export function impuestosPorTarifa(
  items: readonly { qty: number; unit_price: number; discount_amount: number | null; tax_code: string | null; tax_rate: number; tax_included: boolean; total_line: number }[],
): ImpuestoCotizacion[] {
  const grupos = new Map<string, ImpuestoCotizacion>();
  for (const it of items) {
    const tarifa = Number(it.tax_rate) || 0;
    if (tarifa <= 0) continue;
    const neto = (Number(it.qty) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount_amount) || 0);
    const total = Number(it.total_line) || 0;
    const base = it.tax_included ? total / (1 + tarifa / 100) : neto;
    const importe = total - base;
    const clave = `${it.tax_code ?? ''}|${tarifa}`;
    const g = grupos.get(clave) ?? { codigo: it.tax_code, tarifa, base: 0, importe: 0 };
    g.base += base;
    g.importe += importe;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, base: redondear(g.base), importe: redondear(g.importe) }))
    .sort((a, b) => b.tarifa - a.tarifa);
}
