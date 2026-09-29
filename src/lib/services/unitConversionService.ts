import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Conversiones de unidades (inventario B6a). Fachada de RPC: nada escribe
 * `unit_conversions` desde el navegador (la escritura directa se cerró en
 * 20260929161000_inv_b6a_7_unidades_esquema).
 *
 * - La regla de conversión es UNA y vive en SQL: `fn_unidad_factor(org, de, a,
 *   producto)` (producto > organización > sistema; directa antes que inversa).
 *   Recetas, producción y esta fachada la usan; no hay otra copia en TypeScript.
 * - Guardar: `fn_conversion_guardar` (permiso de catálogo en el servidor, la
 *   inversa en la misma transacción, UNIQUE por alcance).
 * - Eliminar: `fn_conversiones_eliminar` (no borra una conversión que una
 *   receta activa necesita).
 */

type Cliente = Pick<SupabaseClient, 'rpc' | 'from'>;

export type AlcanceConversion = 'sistema' | 'organizacion' | 'producto';

export interface UnitConversion {
  id: number;
  from_unit_code: string;
  to_unit_code: string;
  factor: number;
  organization_id: number | null;
  /** Con valor: la conversión vale solo para ese producto. */
  product_id: number | null;
  created_at: string;
}

export interface CreateUnitConversionData {
  from_unit_code: string;
  to_unit_code: string;
  factor: number;
  /** Se ignora: la organización la valida el servidor contra la sesión. Se conserva por compatibilidad. */
  organization_id?: number | null;
  /** Solo para este producto (NULL: toda la organización). */
  product_id?: number | null;
  /** Crear o actualizar también la inversa (1 / factor) en la misma transacción. */
  inversa?: boolean;
}

export interface ResultadoConversion {
  id: number;
  inversa_id: number | null;
}

/** Error de las RPC de conversiones con el código estable de la base (`conversion_repetida`, `tipos_distintos`…). */
export class ErrorConversion extends Error {
  constructor(
    public readonly codigo: string,
    public readonly sqlstate: string | undefined,
    public readonly relacionado: number | null,
  ) {
    super(codigo);
    this.name = 'ErrorConversion';
  }
}

function aErrorConversion(error: { message?: string; code?: string; hint?: string } | null): ErrorConversion {
  const e = error ?? {};
  return new ErrorConversion(String(e.message ?? 'desconocido'), e.code, e.hint && /^\d+$/.test(e.hint) ? Number(e.hint) : null);
}

const limpio = (codigo: string) => codigo.trim().toUpperCase();

class UnitConversionService {
  constructor(private readonly cliente: Cliente = supabase) {}

  /** Conversiones visibles para la organización (sistema + propias; con `productId`, también las de ese producto). */
  async getConversions(organizationId?: number, productId?: number | null): Promise<UnitConversion[]> {
    const org = organizationId ?? getOrganizationId();
    const { data, error } = await this.cliente
      .from('unit_conversions')
      .select('id, from_unit_code, to_unit_code, factor, organization_id, product_id, created_at')
      .or(`organization_id.is.null,organization_id.eq.${Number(org) || 0}`)
      .order('from_unit_code', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as UnitConversion[])
      .filter((c) => c.product_id === null || (productId != null && c.product_id === productId))
      .map((c) => ({ ...c, from_unit_code: limpio(c.from_unit_code), to_unit_code: limpio(c.to_unit_code), factor: Number(c.factor) }));
  }

  /** Crea una conversión (y su inversa si se pide) con `fn_conversion_guardar`. Lanza `ErrorConversion`. */
  async createConversion(data: CreateUnitConversionData): Promise<ResultadoConversion> {
    return this.guardar(null, data);
  }

  /** Crea (id null) o cambia el factor (id) de una conversión de la organización o de un producto. */
  async guardar(id: number | null, data: CreateUnitConversionData): Promise<ResultadoConversion> {
    const { data: r, error } = await this.cliente.rpc('fn_conversion_guardar', {
      p_org: getOrganizationId(),
      p_id: id,
      p_datos: {
        de: limpio(data.from_unit_code),
        a: limpio(data.to_unit_code),
        factor: data.factor,
        producto_id: data.product_id ?? null,
        inversa: data.inversa === true,
      },
    });
    if (error) throw aErrorConversion(error);
    return r as ResultadoConversion;
  }

  /** Elimina conversiones propias (con sus inversas si se pide). Lanza `ErrorConversion` (`conversion_en_uso`…). */
  async deleteConversions(ids: number[], conInversa = false): Promise<number> {
    const { data, error } = await this.cliente.rpc('fn_conversiones_eliminar', {
      p_org: getOrganizationId(),
      p_ids: ids,
      p_con_inversa: conInversa,
    });
    if (error) throw aErrorConversion(error);
    return Number(data) || 0;
  }

  async deleteConversion(id: number): Promise<void> {
    await this.deleteConversions([id], false);
  }

  /** Cantidad convertida con la regla única de la base (null si no hay conversión). */
  async convert(qty: number, fromUnit: string, toUnit: string, organizationId?: number, productId?: number | null): Promise<number | null> {
    if (limpio(fromUnit) === limpio(toUnit)) return qty;
    const { data, error } = await this.cliente.rpc('fn_unidad_convertir', {
      p_org: organizationId ?? getOrganizationId(),
      p_cantidad: qty,
      p_de: limpio(fromUnit),
      p_a: limpio(toUnit),
      p_producto: productId ?? null,
    });
    if (error) return null;
    return data === null || data === undefined ? null : Number(data);
  }

  /** Unidades a las que se puede convertir `unitCode` (directa o inversa) para la organización. */
  async getConvertibleUnits(unitCode: string, organizationId?: number): Promise<string[]> {
    const lista = await this.getConversions(organizationId);
    const u = limpio(unitCode);
    const destinos = new Set<string>();
    for (const c of lista) {
      if (c.from_unit_code === u) destinos.add(c.to_unit_code);
      if (c.to_unit_code === u) destinos.add(c.from_unit_code);
    }
    return Array.from(destinos);
  }
}

export const unitConversionService = new UnitConversionService();
