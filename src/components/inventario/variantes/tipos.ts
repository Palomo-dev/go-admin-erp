/**
 * Contrato de las RPC del catálogo de variantes (migraciones
 * `20260929160000_inv_b6a_1_variantes_esquema` y
 * `20260929160100_inv_b6a_2_variantes_funciones`).
 */

export type EstiloTipo = 'texto' | 'color' | 'imagen';
export type AtributoMeta = 'color' | 'size' | 'material' | 'pattern' | 'gender' | 'age_group';
export type IdiomaTraduccion = 'en' | 'fr' | 'pt';
export type Traducciones = Partial<Record<IdiomaTraduccion, string>>;

export const IDIOMAS_TRADUCCION: readonly IdiomaTraduccion[] = ['en', 'fr', 'pt'];
export const ESTILOS_TIPO: readonly EstiloTipo[] = ['texto', 'color', 'imagen'];
export const ATRIBUTOS_META: readonly AtributoMeta[] = ['color', 'size', 'material', 'pattern', 'gender', 'age_group'];

/** Otra forma de escribir el tipo o el valor dentro de las variantes («talla» para «Talla»). */
export interface Escritura {
  texto: string;
  variantes: number;
}

export interface TipoVariante {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
  estilo: EstiloTipo;
  meta: AtributoMeta | null;
  traducciones: Traducciones;
  creado: string | null;
  /** Variantes (productos hijo no borrados) que usan el tipo en `variant_data`. */
  variantes: number;
  /** Filas de `product_variant_relations` (solo la importación las escribe). */
  relaciones: number;
  /** Valores en uso que aún no están en el catálogo. */
  valores_fuera: number;
  escrituras: Escritura[];
}

export interface ValorVariante {
  id: number;
  tipo_id: number;
  valor: string;
  orden: number;
  activo: boolean;
  hex: string | null;
  imagen: string | null;
  sku: string | null;
  traducciones: Traducciones;
  variantes: number;
  relaciones: number;
  escrituras: Escritura[];
}

export interface TipoGlobal {
  id: number;
  nombre: string;
  valores: string[];
}

export interface ResumenVariantes {
  tipos: TipoVariante[];
  valores: ValorVariante[];
  fuera_catalogo: { tipos: Escritura[]; pares: number };
  /** Variantes con al menos un atributo. */
  variantes: number;
  /** Catálogo global sugerido (org 0) para el estado vacío. */
  globales: TipoGlobal[];
}

export interface DatosTipo {
  nombre: string;
  estilo?: EstiloTipo;
  meta?: AtributoMeta | null;
  traducciones?: Traducciones;
  activo?: boolean;
  /** Reescribir también las otras escrituras de las variantes con este nombre. */
  unificar?: boolean;
}

export interface DatosValor {
  tipo_id?: number;
  valor: string;
  hex?: string | null;
  imagen?: string | null;
  sku?: string | null;
  traducciones?: Traducciones;
  activo?: boolean;
  unificar?: boolean;
}

export interface ResultadoGuardado {
  id: number;
  variantes_actualizadas: number;
}

export interface ResultadoFusion {
  destino: number;
  fusionados: number;
  variantes_actualizadas: number;
}
