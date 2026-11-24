/**
 * Contrato de las pantallas de Listas de precios (lo que devuelven las RPC de
 * 20261124213200_listas_precios_gestion a través de /api/listas-precios/**).
 */

export type EstadoLista = 'activa' | 'programada' | 'vencida' | 'inactiva' | 'sin_clientes';
export type BaseLista = 'percent' | 'fixed_only';
export type ModoRedondeo = 'down' | 'nearest' | 'up';

export interface ListaResumen {
  id: string;
  name: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  base_mode: BaseLista;
  base_percent: number;
  applies_to_pos: boolean;
  applies_to_web: boolean;
  applies_to_documents: boolean;
  sort_order: number;
  clientes: number;
  clientes_grupo: number;
  productos_fijos: number;
  reglas_categoria: number;
  reglas_marca: number;
  escalones: number;
  estado: EstadoLista;
}

export interface ResumenListas {
  listas: ListaResumen[];
  kpis: {
    creadas: number;
    activas: number;
    programadas: number;
    clientes: number;
    clientes_grupo: number;
    clientes_directos: number;
    productos_fijos: number;
    ventas_netas_mes: number;
    ventas_mes: number;
  };
}

export interface ReglaLista {
  id?: string;
  scope: 'category' | 'brand';
  category_id: number | null;
  category_name?: string | null;
  brand: string | null;
  adjust_percent: number | null;
  no_discount: boolean;
}

export interface ProductoLista {
  product_id: number;
  name: string;
  sku: string | null;
  normal_price: number | null;
  escalones: { min_qty: number; price: number }[];
}

export interface GrupoLista {
  segment_id: string;
  name: string;
  is_dynamic: boolean;
  miembros: number;
}

export interface ListaPrecios {
  id: string;
  organization_id: number;
  name: string;
  currency_code: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  base_mode: BaseLista;
  base_percent: number;
  rounding_step: number;
  rounding_mode: ModoRedondeo;
  applies_to_pos: boolean;
  applies_to_web: boolean;
  applies_to_documents: boolean;
  branches: number[] | null;
  sort_order: number;
  web_login_notice: boolean;
  updated_at: string;
  created_at: string;
}

export interface DetalleLista {
  lista: ListaPrecios;
  estado: EstadoLista;
  reglas: ReglaLista[];
  productos: ProductoLista[];
  grupos: GrupoLista[];
  kpis: {
    clientes: number;
    clientes_grupo: number;
    clientes_directos: number;
    ventas_netas_mes: number;
    ventas_mes: number;
    ahorro_mes: number;
  };
}

export interface ClienteDeLista {
  id: string;
  nombre: string | null;
  doc_type: string | null;
  doc_number: string | null;
  via: 'directo' | 'grupo';
  grupo: string | null;
  ultima_compra: string | null;
  ventas_netas_mes: number;
  ahorro_mes: number;
}

export interface CandidatoCliente {
  id: string;
  nombre: string | null;
  doc_type: string | null;
  doc_number: string | null;
  lista_actual_id: string | null;
  lista_actual: string | null;
  via: 'directo' | 'grupo' | null;
}

export interface CandidatoGrupo {
  segment_id: string;
  name: string;
  is_dynamic: boolean;
  miembros: number;
  lista_id: string | null;
  lista: string | null;
  con_directa: number;
  con_directa_lista: string | null;
}

export interface InfoListaCliente {
  via: 'directo' | 'grupo' | 'sin_lista' | 'ninguna';
  lista: {
    id: string;
    name: string;
    base_mode: BaseLista;
    base_percent: number;
    applies_to_pos: boolean;
    applies_to_web: boolean;
    applies_to_documents: boolean;
    productos_fijos: number;
    reglas: { scope: 'category' | 'brand'; name: string | null; adjust_percent: number | null; no_discount: boolean }[] | null;
    estado: EstadoLista;
  } | null;
  grupo: { id: string; name: string } | null;
  lista_del_grupo_id: string | null;
  ahorro_mes: number;
  compras_mes: number;
  opciones: { id: string; name: string; base_mode: BaseLista; base_percent: number; effective_from: string; productos_fijos: number; estado: EstadoLista }[];
}

export type EstadoFilaImportacion =
  | 'igual'
  | 'nuevo'
  | 'escalon_nuevo'
  | 'cambia'
  | 'no_existe'
  | 'precio_invalido'
  | 'cantidad_invalida'
  | 'duplicado';

export interface FilaImportacion {
  fila: number;
  sku: string | null;
  product_id: number | null;
  nombre: string | null;
  min_qty: number | null;
  hoy: number | null;
  nuevo: number | null;
  estado: EstadoFilaImportacion;
}

export interface ResultadoImportacion {
  resumen: { filas: number; nuevos: number; cambian: number; iguales: number; errores: number; quedan_fuera: number; aplicado: boolean };
  filas: FilaImportacion[];
}

/** Lo que la pantalla de edición manda a `price_list_save`. */
export interface DatosLista {
  name: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  base_mode: BaseLista;
  base_percent: number;
  rounding_step: number;
  rounding_mode: ModoRedondeo;
  applies_to_pos: boolean;
  applies_to_web: boolean;
  applies_to_documents: boolean;
  branches: number[] | null;
  rules: ReglaLista[];
  items: { product_id: number; min_qty: number; price: number }[];
}

/** Códigos de error estables (las RPC los levantan como mensaje). */
export const CODIGOS_ERROR_LISTA = [
  'sin_permiso',
  'no_encontrada',
  'no_encontrado',
  'nombre_requerido',
  'nombre_duplicado',
  'datos_invalidos',
  'sede_invalida',
  'regla_duplicada',
  'regla_invalida',
  'escalon_duplicado',
  'precio_invalido',
  'archivo_invalido',
  'demasiados_clientes',
  'error_desconocido',
] as const;
export type CodigoErrorLista = (typeof CODIGOS_ERROR_LISTA)[number];

export function codigoErrorLista(err: unknown): CodigoErrorLista {
  const mensaje = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  const codigo = (CODIGOS_ERROR_LISTA as readonly string[]).find((c) => mensaje === c || mensaje.startsWith(`${c}:`));
  return (codigo as CodigoErrorLista | undefined) ?? 'error_desconocido';
}
