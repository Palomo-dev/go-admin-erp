/** Tipos del listado de lotes (`fn_lotes_listado`, bloque B1). */

export const ESTADOS_LOTE = ['vigente', 'por_vencer', 'vencido', 'sin_vencimiento'] as const;
export type EstadoLote = (typeof ESTADOS_LOTE)[number];

export interface FiltrosLotes {
  busqueda?: string;
  sucursales?: readonly number[];
  estados?: readonly EstadoLote[];
  /** El producto y sus variantes. */
  producto?: number;
  proveedor?: number;
  con_existencias?: boolean;
  umbral?: number;
  orden?: 'vence' | 'lote' | 'cantidad' | 'creado';
  direccion?: 'asc' | 'desc';
}

/** Una fila por (lote, sucursal). */
export interface LoteFila {
  lot_id: number;
  lot_code: string;
  creado: string;
  /** Columna `date`: se muestra con formatPlain, nunca con zona. */
  expiry_date: string | null;
  dias: number | null;
  estado: EstadoLote;
  notas: string | null;
  product_id: number;
  nombre: string;
  sku: string | null;
  unidad: string | null;
  atributos: string | null;
  branch_id: number | null;
  sucursal: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  costo_promedio: number | null;
  valor: number | null;
  supplier_id: number | null;
  proveedor: string | null;
  /** Tiene movimientos de kardex: no se puede eliminar. */
  con_historia: boolean;
}

export interface KpisLotes {
  lotes: number;
  vigentes: number;
  uds_vigentes: number;
  por_vencer: number;
  uds_por_vencer: number;
  vencidos: number;
  uds_vencidas: number;
  valor_vencido: number | null;
  valor_riesgo: number | null;
  uds: number;
}

export interface RespuestaLotes {
  filas: LoteFila[];
  total: number;
  kpis: KpisLotes;
  costos: boolean;
  /** Día de la organización (YYYY-MM-DD) con que el servidor calculó el estado. */
  hoy: string;
  umbral: number;
}
