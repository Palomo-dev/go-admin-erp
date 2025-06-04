/**
 * Tipos compartidos para el módulo de productos
 * 
 * Este archivo centraliza las definiciones de tipos para evitar 
 * inconsistencias entre componentes y permitir una fácil reutilización.
 */

/**
 * Interfaz para los productos del catálogo
 */
export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  categoria: string;
  precio: number;
  stock: number;
  estado: string;
  tieneVariantes: boolean;
  descripcion?: string;
}

/**
 * Interfaz para los filtros de búsqueda de productos
 */
export interface FiltrosProducto {
  categoria: string;
  estado: string;
  busqueda: string;
}

/**
 * Interfaz para las variantes de producto
 */
export interface VarianteProducto {
  id: string;
  productoId: string; 
  nombre: string;
  sku: string;
  precio?: number;
  stock: number;
  atributos?: Record<string, string>; // Por ejemplo: {color: 'rojo', talla: 'XL'}
}
