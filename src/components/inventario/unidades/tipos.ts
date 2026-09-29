/**
 * Contrato de `fn_unidades_resumen` y de las RPC de unidades y conversiones
 * (migraciones `20260929161000_inv_b6a_7…` a `20260929161200_inv_b6a_9…`).
 */

export type TipoUnidad = 'weight' | 'volume' | 'count' | 'length' | 'area';
export const TIPOS_UNIDAD: readonly TipoUnidad[] = ['count', 'weight', 'volume', 'length', 'area'];

export type AmbitoUnidad = 'sistema' | 'organizacion';
export type AmbitoConversion = 'sistema' | 'organizacion' | 'producto';

export interface Unidad {
  codigo: string;
  nombre: string;
  tipo: TipoUnidad | null;
  ambito: AmbitoUnidad;
  activo: boolean;
  /** Unidad DIAN con la que se factura (dian_unit_measures); sin valor: 94 Unidad. */
  dian_id: number | null;
  dian_codigo: string | null;
  dian_nombre: string | null;
  productos: number;
  /** Líneas de recetas activas que la usan (en la línea o como unidad del ingrediente). */
  recetas: number;
  conversiones: number;
}

export interface Conversion {
  id: number;
  de: string;
  a: string;
  factor: number;
  nombre_de: string | null;
  nombre_a: string | null;
  tipo_de: TipoUnidad | null;
  tipo_a: TipoUnidad | null;
  ambito: AmbitoConversion;
  producto: { id: number; nombre: string; sku: string | null } | null;
  inversa_id: number | null;
  /** Líneas de recetas activas que la usan para convertir el consumo. */
  recetas: number;
  /** Conversión de conteo para toda la organización o el sistema (PAQ, CAJ): no vale igual para todos los productos. */
  revisar: boolean;
}

export interface KpisUnidades {
  unidades_en_uso: number;
  unidades_disponibles: number;
  productos_sin_unidad: number;
  unidades_sin_conversion: string[];
  recetas_mezcladas: number;
  recetas_mezcladas_sin_conversion: number;
  ingredientes_sin_conversion: number;
  conversiones_usadas: number;
  conversiones_revisar: number;
}

export interface UnidadDian {
  id: number;
  codigo: string;
  nombre: string;
}

export interface ResumenUnidades {
  unidades: Unidad[];
  conversiones: Conversion[];
  kpis: KpisUnidades;
  dian: UnidadDian[];
}

export interface DatosUnidad {
  codigo: string;
  nombre: string;
  tipo: TipoUnidad;
  dian_id: number | null;
  activo?: boolean;
}
