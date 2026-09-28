import { supabase } from '@/lib/supabase/config';
import {
  CONFIG_NUMERACION_POR_DEFECTO,
  validarCodigoBarras,
  type ConfigNumeracion,
  type FormatoNumeracion,
} from '@/lib/utils/codigoBarras';

/**
 * Códigos de barras de productos (y variantes). Generar y comprobar unicidad
 * es trabajo del servidor: RPC `codigos_barras_*` (SECURITY DEFINER con
 * `fn_assert_acceso_org`, migración 20260924030000). Este servicio solo las
 * llama; la parte pura (dígito de control, formatos) está en
 * `@/lib/utils/codigoBarras`.
 */

export interface ConflictoCodigo {
  productId: number;
  nombre: string;
  sku: string | null;
  /** Si es una variante, el nombre de su producto padre. */
  nombrePadre: string | null;
  esVariante: boolean;
}

export interface CodigoAsignado {
  productId: number;
  codigo: string;
}

interface FilaConfig {
  format: FormatoNumeracion;
  prefix: string;
  next_number: number;
  code_length: number;
}

const aConfig = (f: FilaConfig): ConfigNumeracion => ({
  formato: f.format,
  prefijo: f.prefix,
  siguiente: Number(f.next_number),
  longitud: Number(f.code_length),
});

/** Numeración de la organización (sin fila: la de por defecto). */
export async function obtenerNumeracion(organizationId: number): Promise<ConfigNumeracion> {
  const { data, error } = await supabase
    .from('organization_barcode_settings')
    .select('format, prefix, next_number, code_length')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return data ? aConfig(data as FilaConfig) : { ...CONFIG_NUMERACION_POR_DEFECTO };
}

export async function guardarNumeracion(organizationId: number, cfg: ConfigNumeracion): Promise<ConfigNumeracion> {
  const { data, error } = await supabase.rpc('codigos_barras_configurar', {
    p_org: organizationId,
    p_formato: cfg.formato,
    p_prefijo: cfg.prefijo,
    p_siguiente: cfg.siguiente,
    p_longitud: cfg.longitud,
  });
  if (error) throw error;
  return aConfig(data as FilaConfig);
}

/** Reserva el siguiente código libre (botón «Generar» de un formulario). */
export async function reservarCodigo(organizationId: number): Promise<string> {
  const { data, error } = await supabase.rpc('codigos_barras_reservar', { p_org: organizationId, p_cantidad: 1 });
  if (error) throw error;
  const codigo = Array.isArray(data) ? (data[0] as string | undefined) : undefined;
  if (!codigo) throw new Error('El servidor no devolvió un código');
  return codigo;
}

/**
 * Asigna código a los productos que no tienen (y a sus variantes, si se
 * pide). Los que ya tienen no se tocan. Transaccional en el servidor.
 */
export async function generarCodigosFaltantes(
  organizationId: number,
  productIds: number[],
  incluirVariantes = true,
): Promise<CodigoAsignado[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase.rpc('codigos_barras_generar_faltantes', {
    p_org: organizationId,
    p_product_ids: productIds,
    p_incluir_variantes: incluirVariantes,
  });
  if (error) throw error;
  return ((data ?? []) as { product_id: number; barcode: string }[]).map((f) => ({
    productId: Number(f.product_id),
    codigo: f.barcode,
  }));
}

/** Otros productos o variantes de la organización que ya usan `codigo`. */
export async function buscarConflictos(
  organizationId: number,
  codigo: string,
  excluirIds: number[] = [],
): Promise<ConflictoCodigo[]> {
  const limpio = codigo.trim();
  if (!limpio) return [];
  const { data, error } = await supabase.rpc('codigos_barras_verificar', {
    p_org: organizationId,
    p_codigo: limpio,
    p_excluir_ids: excluirIds,
  });
  if (error) throw error;
  return (
    (data ?? []) as { product_id: number; name: string; sku: string | null; parent_product_id: number | null; parent_name: string | null }[]
  ).map((f) => ({
    productId: Number(f.product_id),
    nombre: f.name,
    sku: f.sku,
    nombrePadre: f.parent_name,
    esVariante: f.parent_product_id !== null,
  }));
}

/** Mensaje de error del servidor → clave de traducción (namespace inventarioEtiquetas.codigos). */
export function claveErrorCodigos(error: unknown): string {
  const msg = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (msg.includes('rango_agotado')) return 'errores.rangoAgotado';
  if (msg.includes('prefijo_invalido')) return 'errores.prefijo';
  if (msg.includes('demasiados_productos')) return 'errores.demasiados';
  if (msg.includes('Acceso denegado')) return 'errores.acceso';
  return 'errores.generico';
}

export interface ProblemaCodigo {
  codigo: string;
  tipo: 'formato' | 'repetidoEnFormulario' | 'duplicado';
  conflicto?: ConflictoCodigo;
}

/**
 * Revisión antes de guardar un formulario con varios códigos (producto y sus
 * variantes): formato válido, sin repetirse entre ellos y sin chocar con otro
 * producto o variante de la organización (servidor). Devuelve el primer
 * problema o `null`. Los vacíos no cuentan.
 */
export async function revisarCodigos(
  organizationId: number,
  codigos: readonly (string | null | undefined)[],
  excluirIds: number[] = [],
): Promise<ProblemaCodigo | null> {
  const limpios = codigos.map((c) => (c ?? '').trim()).filter(Boolean);
  const vistos = new Set<string>();
  for (const codigo of limpios) {
    if (!validarCodigoBarras(codigo).valido) return { codigo, tipo: 'formato' };
    if (vistos.has(codigo)) return { codigo, tipo: 'repetidoEnFormulario' };
    vistos.add(codigo);
  }
  for (const codigo of Array.from(vistos)) {
    const otros = await buscarConflictos(organizationId, codigo, excluirIds);
    if (otros.length) return { codigo, tipo: 'duplicado', conflicto: otros[0] };
  }
  return null;
}
