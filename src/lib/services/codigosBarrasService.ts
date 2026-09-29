import { supabase } from '@/lib/supabase/config';
import {
  CONFIG_NUMERACION_POR_DEFECTO,
  validarCodigoBarras,
  type ConfigNumeracion,
  type FormatoNumeracion,
} from '@/lib/utils/codigoBarras';
import {
  FORMATO_ETIQUETA_RECOMENDADO,
  formatoDesdeFila,
  type FilaFormatoEtiqueta,
  type FilaPlu,
  type FormatoEtiquetaPeso,
} from '@/lib/pos/etiquetaPeso';

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

// ── Etiquetas de peso variable (PRODUCTOS-POR-PESO-BASCULA.md §2.7, fase 4) ──

const COLUMNAS_ETIQUETA =
  'weight_label_enabled, weight_label_prefixes, weight_label_content, weight_label_plu_digits, weight_label_value_digits, weight_label_value_check';

/** Formato guardado (activo o no) para la tarjeta de configuración; sin fila, el recomendado apagado. */
export async function obtenerFormatoEtiqueta(organizationId: number): Promise<FormatoEtiquetaPeso> {
  const { data, error } = await supabase
    .from('organization_barcode_settings')
    .select(COLUMNAS_ETIQUETA)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  const fila = data as FilaFormatoEtiqueta | null;
  if (!fila) return { ...FORMATO_ETIQUETA_RECOMENDADO, activo: false };
  return {
    activo: fila.weight_label_enabled === true,
    prefijos: (fila.weight_label_prefixes ?? []).map(String),
    contenido: fila.weight_label_content === 'price' ? 'price' : 'weight',
    digitosPlu: Number(fila.weight_label_plu_digits ?? 5),
    digitosValor: Number(fila.weight_label_value_digits ?? 5),
    digitoControlValor: fila.weight_label_value_check === true,
  };
}

/** Formato con el que el POS decodifica; `null` si la organización no usa etiquetas de peso. */
export async function obtenerFormatoEtiquetaActivo(organizationId: number): Promise<FormatoEtiquetaPeso | null> {
  const { data, error } = await supabase
    .from('organization_barcode_settings')
    .select(COLUMNAS_ETIQUETA)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return formatoDesdeFila(data as FilaFormatoEtiqueta | null);
}

export interface ResultadoGuardarEtiqueta {
  formato: FormatoEtiquetaPeso;
  /** Productos con un código propio que empieza por esos prefijos (siguen funcionando: el código exacto manda). */
  productosConPrefijo: number;
  /** Productos cuyo PLU no cabe en los dígitos elegidos. */
  productosPluFueraDeRango: number;
}

/** Guarda el formato (RPC `codigos_barras_configurar_peso`, permiso `pos.basculas.configurar`). */
export async function guardarFormatoEtiqueta(organizationId: number, f: FormatoEtiquetaPeso): Promise<ResultadoGuardarEtiqueta> {
  const { data, error } = await supabase.rpc('codigos_barras_configurar_peso', {
    p_org: organizationId,
    p_activo: f.activo,
    p_prefijos: [...f.prefijos],
    p_contenido: f.contenido,
    p_digitos_plu: f.digitosPlu,
    p_digitos_valor: f.digitosValor,
    p_digito_valor: f.digitoControlValor,
  });
  if (error) throw error;
  const r = (data ?? {}) as {
    enabled?: boolean;
    prefixes?: string[];
    content?: string;
    plu_digits?: number;
    value_digits?: number;
    value_check?: boolean;
    productos_con_prefijo?: number;
    productos_plu_fuera_de_rango?: number;
  };
  return {
    formato: {
      activo: r.enabled === true,
      prefijos: (r.prefixes ?? []).map(String),
      contenido: r.content === 'price' ? 'price' : 'weight',
      digitosPlu: Number(r.plu_digits ?? f.digitosPlu),
      digitosValor: Number(r.value_digits ?? f.digitosValor),
      digitoControlValor: r.value_check === true,
    },
    productosConPrefijo: Number(r.productos_con_prefijo ?? 0),
    productosPluFueraDeRango: Number(r.productos_plu_fuera_de_rango ?? 0),
  };
}

/**
 * Productos con un código propio EAN-13 que empieza por alguno de los
 * prefijos (aviso antes de guardar el formato; el POS busca primero el exacto).
 */
export async function contarCodigosConPrefijo(organizationId: number, prefijos: readonly string[]): Promise<number> {
  const validos = prefijos.filter((p) => /^\d{2}$/.test(p));
  if (validos.length === 0) return 0;
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .neq('status', 'deleted')
    .or(validos.map((p) => `barcode.like.${p}___________`).join(','));
  if (error) throw error;
  return count ?? 0;
}

/** Producto de la organización con ese PLU (para «Probar un código»). */
export async function productoPorPlu(
  organizationId: number,
  plu: number,
): Promise<{ id: number; name: string; sale_mode: string | null; qty_decimals: number | null; unit_code: string | null } | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sale_mode, qty_decimals, unit_code')
    .eq('organization_id', organizationId)
    .eq('scale_plu', plu)
    .neq('status', 'deleted')
    .maybeSingle();
  if (error) throw error;
  return (data as { id: number; name: string; sale_mode: string | null; qty_decimals: number | null; unit_code: string | null } | null) ?? null;
}

/** Mensaje del servidor al guardar el formato → clave en `posEtiquetasPeso.errores`. */
export function claveErrorEtiqueta(error: unknown): string {
  const msg = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  for (const c of ['prefijo_del_generador', 'prefijo_peso_invalido', 'prefijos_requeridos', 'formato_invalido', 'sin_permiso']) {
    if (msg.includes(c)) return c;
  }
  if (/Acceso denegado/i.test(msg)) return 'sin_permiso';
  return 'generico';
}

/** Productos con PLU para cargar la balanza (RPC `fn_productos_exportar_plu`). */
export async function listarPluExportables(organizationId: number): Promise<FilaPlu[]> {
  const { data, error } = await supabase.rpc('fn_productos_exportar_plu', { p_org: organizationId });
  if (error) throw error;
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return (
    (data ?? []) as {
      plu: number;
      product_id: number;
      nombre: string;
      precio_por_unidad: number | string | null;
      unidad: string | null;
      tara: number | string | null;
      dias_vida: number | null;
    }[]
  ).map((f) => ({
    plu: Number(f.plu),
    productId: Number(f.product_id),
    nombre: f.nombre,
    precioPorUnidad: num(f.precio_por_unidad),
    unidad: (f.unidad ?? '').trim(),
    tara: num(f.tara),
    diasVida: num(f.dias_vida),
  }));
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
  // El generador chocaría con un prefijo de etiqueta de peso (20260929230200).
  if (msg.includes('prefijo_de_peso')) return 'errores.prefijoDePeso';
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
