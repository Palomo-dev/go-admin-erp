/**
 * Retenciones de compra en el navegador (D4 fase 3 del plan de compras,
 * docs/design/RETENCIONES-COMPRAS.md).
 *
 * Todo pasa por RPC con guarda en la base; la organización es la de la sesión
 * y la base la vuelve a validar:
 * - `fn_retenciones_configuracion`: tipo, cuenta contable resuelta (la misma
 *   `fn_cuenta_retencion_compra` del asiento) y base mínima de cada retención,
 *   la UVT vigente y cuántas plantillas del país faltan.
 * - `fn_retencion_configurar`: cuenta propia (pasivo activo) y base mínima.
 *   Exige finance.create o finance.approve.
 * - `fn_retenciones_cargar_plantilla`: las retenciones del país que falten.
 * - `fn_factura_compra_asiento_previo`: el asiento que armaría la
 *   confirmación, sin confirmar (el disparador real dentro de un bloque que se
 *   deshace).
 * `fiscal_uvt` y `chart_of_accounts` se leen con la RLS de la sesión.
 */
import { supabase } from '@/lib/supabase/config';

export type ClaseRetencion = 'retefuente' | 'reteiva' | 'reteica';

export interface RetencionConfigurada {
  id: string;
  nombre: string;
  tarifa: number;
  activo: boolean;
  descripcion: string | null;
  plantillaId: number | null;
  codigo: string | null;
  clase: ClaseRetencion;
  baseMinimaUvt: number | null;
  /** Cuenta a la que va la retención en el asiento (propia o la de su clase). */
  cuenta: string;
  cuentaNombre: string | null;
  /** true si la organización eligió la cuenta; false si es la automática de su clase. */
  cuentaPropia: boolean;
}

export interface UvtVigente {
  anio: number;
  valor: number;
  norma: string | null;
}

export interface ConfiguracionRetenciones {
  pais: string;
  paisNombre: string | null;
  uvt: UvtVigente | null;
  plantillasPendientes: number;
  retenciones: RetencionConfigurada[];
}

export interface CuentaPasivo {
  codigo: string;
  nombre: string;
}

export interface LineaAsientoPrevio {
  cuenta: string;
  nombre: string | null;
  descripcion: string | null;
  debito: number;
  credito: number;
}

export interface AsientoPrevio {
  ok: boolean;
  /** Por qué no hay asiento: no_borrador, no_rule, period_closed, error… */
  motivo: string | null;
  /** El asiento sale, pero con una advertencia (p. ej. withholding_exceeds_total). */
  aviso: string | null;
  detalle: string | null;
  lineas: LineaAsientoPrevio[];
  debitos: number;
  creditos: number;
  cuadra: boolean;
}

type Crudo = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numONulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const esClase = (v: unknown): v is ClaseRetencion => v === 'retefuente' || v === 'reteiva' || v === 'reteica';

export function aConfiguracionRetenciones(data: unknown): ConfiguracionRetenciones {
  const d = (data ?? {}) as Crudo;
  const uvt = (d.uvt ?? null) as Crudo | null;
  const filas = Array.isArray(d.retenciones) ? (d.retenciones as Crudo[]) : [];
  return {
    pais: textoONulo(d.pais) ?? '',
    paisNombre: textoONulo(d.pais_nombre),
    uvt: uvt && numONulo(uvt.valor) ? { anio: num(uvt.anio), valor: num(uvt.valor), norma: textoONulo(uvt.norma) } : null,
    plantillasPendientes: num(d.plantillas_pendientes),
    retenciones: filas.map((f) => ({
      id: String(f.id),
      nombre: String(f.nombre ?? ''),
      tarifa: num(f.tarifa),
      activo: f.activo === true,
      descripcion: textoONulo(f.descripcion),
      plantillaId: numONulo(f.plantilla_id),
      codigo: textoONulo(f.codigo),
      clase: esClase(f.clase) ? f.clase : 'retefuente',
      baseMinimaUvt: numONulo(f.base_minima_uvt),
      cuenta: String(f.cuenta ?? ''),
      cuentaNombre: textoONulo(f.cuenta_nombre),
      cuentaPropia: f.cuenta_propia === true,
    })),
  };
}

export function aAsientoPrevio(data: unknown): AsientoPrevio {
  const d = (data ?? {}) as Crudo;
  const lineas = Array.isArray(d.lineas) ? (d.lineas as Crudo[]) : [];
  return {
    ok: d.ok === true,
    motivo: textoONulo(d.motivo),
    aviso: textoONulo(d.aviso),
    detalle: textoONulo(d.detalle),
    lineas: lineas.map((l) => ({
      cuenta: String(l.cuenta ?? ''),
      nombre: textoONulo(l.nombre),
      descripcion: textoONulo(l.descripcion),
      debito: num(l.debito),
      credito: num(l.credito),
    })),
    debitos: num(d.debitos),
    creditos: num(d.creditos),
    cuadra: d.cuadra === true,
  };
}

export async function leerConfiguracionRetenciones(org: number): Promise<ConfiguracionRetenciones> {
  const { data, error } = await supabase.rpc('fn_retenciones_configuracion', { p_organization_id: org });
  if (error) throw error;
  return aConfiguracionRetenciones(data);
}

/** `cuenta` null: vuelve a la cuenta automática de su clase (2365 / 2367 / 2368). */
export async function configurarRetencion(
  org: number,
  id: string,
  valores: { cuenta: string | null; baseMinimaUvt: number | null },
): Promise<void> {
  const { error } = await supabase.rpc('fn_retencion_configurar', {
    p_organization_id: org,
    p_id: id,
    p_cuenta: valores.cuenta,
    p_base_minima_uvt: valores.baseMinimaUvt,
  });
  if (error) throw error;
}

export async function cargarPlantillaRetenciones(org: number): Promise<number> {
  const { data, error } = await supabase.rpc('fn_retenciones_cargar_plantilla', { p_organization_id: org });
  if (error) throw error;
  return num((data as Crudo | null)?.creadas);
}

/** Cuentas de pasivo activas de la organización: las únicas válidas para una retención. */
export async function cuentasDePasivo(org: number): Promise<CuentaPasivo[]> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('account_code, name')
    .eq('organization_id', org)
    .eq('type', 'liability')
    .eq('is_active', true)
    .order('account_code');
  if (error) throw error;
  return ((data ?? []) as Array<{ account_code: string; name: string }>).map((c) => ({ codigo: c.account_code, nombre: c.name }));
}

/** Moneda en la que se expresa la UVT de cada país de `fiscal_uvt`. */
const MONEDA_UVT: Record<string, string> = { COL: 'COP' };

export interface UvtPais {
  pais: string;
  /** Moneda de la UVT; la base mínima solo se compara con documentos en esa moneda. */
  moneda: string | null;
  valores: Map<number, number>;
}

/** UVT por año del país de la organización (`fiscal_uvt`). */
export async function uvtPorAnio(org: number): Promise<UvtPais> {
  const { data: o, error: errorOrg } = await supabase.from('organizations').select('country_code').eq('id', org).maybeSingle();
  if (errorOrg) throw errorOrg;
  const pais = ((o as { country_code?: string | null } | null)?.country_code ?? '').trim().toUpperCase() || 'COL';
  const { data, error } = await supabase.from('fiscal_uvt').select('year, value').eq('country_code', pais);
  if (error) throw error;
  return {
    pais,
    moneda: MONEDA_UVT[pais] ?? null,
    valores: new Map(((data ?? []) as Array<{ year: number; value: number | string }>).map((u) => [Number(u.year), num(u.value)])),
  };
}

export async function asientoPrevioCompra(facturaId: string): Promise<AsientoPrevio> {
  const { data, error } = await supabase.rpc('fn_factura_compra_asiento_previo', { p_id: facturaId });
  if (error) throw error;
  return aAsientoPrevio(data);
}
