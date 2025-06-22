/**
 * Tipos para el módulo de Categorías y Familias
 */

/**
 * Interfaz para la estructura de categoría
 */
export interface Categoria {
  id: number;
  organization_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  rank: number;
  created_at?: string;
  updated_at?: string;
  // Campos adicionales para interfaz
  children?: Categoria[];
  level?: number;
  isExpanded?: boolean;
}

/**
 * Interfaz para atributos de categoría
 */
export interface CategoriaAtributo {
  id: number;
  category_id: number;
  name: string;
  tipo: 'texto' | 'numero' | 'fecha' | 'booleano' | 'seleccion';
  obligatorio: boolean;
  opciones?: string[]; // Para tipo 'seleccion'
}

/**
 * Interfaz para filtros de búsqueda de categorías
 */
export interface FiltrosCategorias {
  search: string;
  parent: number | null;
  soloRaiz: boolean;
}
