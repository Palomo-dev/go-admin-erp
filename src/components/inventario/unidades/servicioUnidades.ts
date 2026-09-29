import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import type { ProductoConversion } from '@/components/kit/receta';
import type { Conversion, DatosUnidad, KpisUnidades, ResumenUnidades, TipoUnidad, Unidad } from './tipos';

/**
 * Unidades de medida y conversiones (inventario B6a). Fachada de RPC: la
 * pantalla no lee ni escribe tablas salvo el buscador de productos.
 * - `fn_unidades_resumen`: unidades del sistema y propias con su uso, las
 *   conversiones que aplican (sistema, organización y por producto) y avisos.
 * - `fn_unidad_guardar` / `fn_unidades_eliminar`: unidades PROPIAS (las del
 *   sistema son de solo lectura).
 * - Las conversiones se guardan y eliminan con `unitConversionService`
 *   (`fn_conversion_guardar`, `fn_conversiones_eliminar`).
 * Todo exige en el servidor la organización de la sesión y el permiso de
 * inventario (`ver`, `editar_catalogo`, `eliminar`).
 */

type Cliente = Pick<SupabaseClient, 'rpc' | 'from'>;

export class ErrorUnidades extends Error {
  constructor(
    public readonly codigo: string,
    public readonly sqlstate: string | undefined,
  ) {
    super(codigo);
    this.name = 'ErrorUnidades';
  }
}

const TIPOS = new Set(['weight', 'volume', 'count', 'length', 'area']);
const n = (x: unknown) => Number(x) || 0;
const codigo = (x: unknown) => String(x ?? '').trim().toUpperCase();

/** Normaliza la respuesta de `fn_unidades_resumen`. */
export function aResumenUnidades(data: unknown): ResumenUnidades {
  const r = (data ?? {}) as Record<string, unknown>;
  const lista = (x: unknown) => (Array.isArray(x) ? x : []) as Record<string, unknown>[];
  const tipo = (x: unknown) => (TIPOS.has(String(x)) ? (x as TipoUnidad) : null);
  const unidades: Unidad[] = lista(r.unidades).map((u) => ({
    codigo: codigo(u.codigo),
    nombre: String(u.nombre ?? ''),
    tipo: tipo(u.tipo),
    ambito: u.ambito === 'organizacion' ? 'organizacion' : 'sistema',
    activo: u.activo !== false,
    dian_id: u.dian_id == null ? null : Number(u.dian_id),
    dian_codigo: (u.dian_codigo as string | null) ?? null,
    dian_nombre: (u.dian_nombre as string | null) ?? null,
    productos: n(u.productos),
    recetas: n(u.recetas),
    conversiones: n(u.conversiones),
  }));
  const conversiones: Conversion[] = lista(r.conversiones).map((c) => {
    const p = c.producto as Record<string, unknown> | null;
    return {
      id: Number(c.id),
      de: codigo(c.de),
      a: codigo(c.a),
      factor: Number(c.factor),
      nombre_de: (c.nombre_de as string | null) ?? null,
      nombre_a: (c.nombre_a as string | null) ?? null,
      tipo_de: tipo(c.tipo_de),
      tipo_a: tipo(c.tipo_a),
      ambito: c.ambito === 'producto' ? 'producto' : c.ambito === 'organizacion' ? 'organizacion' : 'sistema',
      producto: p ? { id: Number(p.id), nombre: String(p.nombre ?? ''), sku: (p.sku as string | null) ?? null } : null,
      inversa_id: c.inversa_id == null ? null : Number(c.inversa_id),
      recetas: n(c.recetas),
      revisar: c.revisar === true,
    };
  });
  const k = (r.kpis ?? {}) as Record<string, unknown>;
  const kpis: KpisUnidades = {
    unidades_en_uso: n(k.unidades_en_uso),
    unidades_disponibles: n(k.unidades_disponibles),
    productos_sin_unidad: n(k.productos_sin_unidad),
    unidades_sin_conversion: (Array.isArray(k.unidades_sin_conversion) ? k.unidades_sin_conversion : []).map(codigo),
    recetas_mezcladas: n(k.recetas_mezcladas),
    recetas_mezcladas_sin_conversion: n(k.recetas_mezcladas_sin_conversion),
    ingredientes_sin_conversion: n(k.ingredientes_sin_conversion),
    conversiones_usadas: n(k.conversiones_usadas),
    conversiones_revisar: n(k.conversiones_revisar),
  };
  const dian = lista(r.dian).map((d) => ({ id: Number(d.id), codigo: String(d.codigo ?? ''), nombre: String(d.nombre ?? '') }));
  return { unidades, conversiones, kpis, dian };
}

async function llamar<T>(cliente: Cliente, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw new ErrorUnidades(String(error.message ?? 'desconocido'), error.code);
  return data as T;
}

export const unidadesService = {
  async resumen(org: number, cliente: Cliente = supabase): Promise<ResumenUnidades> {
    return aResumenUnidades(await llamar<unknown>(cliente, 'fn_unidades_resumen', { p_org: org }));
  },

  /** `codigoOriginal` null: unidad nueva. */
  guardar(org: number, codigoOriginal: string | null, datos: DatosUnidad, cliente: Cliente = supabase): Promise<{ codigo: string }> {
    return llamar(cliente, 'fn_unidad_guardar', {
      p_org: org,
      p_codigo: codigoOriginal,
      p_datos: { codigo: datos.codigo.trim().toUpperCase(), nombre: datos.nombre, tipo: datos.tipo, dian_id: datos.dian_id, activo: datos.activo ?? true },
    });
  },

  eliminar(org: number, codigos: string[], cliente: Cliente = supabase): Promise<number> {
    return llamar(cliente, 'fn_unidades_eliminar', { p_org: org, p_codigos: codigos });
  },

  /** Buscador de productos de la organización para «Aplica a · Un producto». */
  async buscarProductos(org: number, texto: string, senal?: AbortSignal, cliente: Cliente = supabase): Promise<ProductoConversion[]> {
    let q = cliente
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', org)
      .neq('status', 'deleted')
      .order('name')
      .limit(20);
    const filtro = ilikeAnyOf(['name', 'sku', 'barcode'], texto);
    if (filtro) q = q.or(filtro);
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as { id: number; name: string; sku: string | null }[]).map((p) => ({ id: Number(p.id), nombre: p.name, sku: p.sku }));
  },
};
