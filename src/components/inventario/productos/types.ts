/**
 * Tipos compartidos para el módulo de productos
 * 
 * Este archivo centraliza las definiciones de tipos para evitar 
 * inconsistencias entre componentes y permitir una fácil reutilización.
 */

/**
 * Interfaz para las etiquetas de producto
 */
export interface EtiquetaProducto {
  id: string;
  nombre: string;
  color?: string; // Color en formato hexadecimal para visualizar la etiqueta
}

/**
 * Interfaz para los productos del catálogo
 */
export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  categoria: string;
  /**
   * Precio principal (legacy). Usar 'precios' para nuevos desarrollos.
   */
  precio: number;
  /**
   * Precios múltiples por segmento de cliente.
   * - mayorista: precio para clientes mayoristas
   * - minorista: precio para clientes minoristas/retail
   */
  precios?: {
    mayorista: number;
    minorista: number;
  };
  stock: number;
  estado: string;
  tieneVariantes: boolean;
  descripcion?: string;
  // Nuevos campos para gestión de etiquetas, códigos de barras y QR
  codigoBarras?: string;
  codigoQR?: string;
  etiquetas?: EtiquetaProducto[];
  ubicacion?: string; // Para facilitar el seguimiento en el inventario físico
  variantes?: { nombre: string; valor: string; sku: string; stock: number; precio: number }[]; // Variantes completas agregadas desde el formulario
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
