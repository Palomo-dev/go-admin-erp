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
/**
 * Interfaz para los productos del catálogo
 *
 * Si el producto se gestiona por lotes, usar el campo `lotes`.
 */
export interface Producto {
  proveedorId?: string; // Relación con proveedor principal (opcional)
  proveedor?: Proveedor; // Objeto proveedor (opcional, para visualización)
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
  // URL de la imagen del producto (opcional)
  imagenUrl?: string;
  // Código o nombre de la unidad de medida asociada (opcional)
  unidad?: string;
  // Nuevos campos para gestión de etiquetas, códigos de barras y QR
  codigoBarras?: string;
  codigoQR?: string;
  etiquetas?: EtiquetaProducto[];
  ubicacion?: string; // Para facilitar el seguimiento en el inventario físico
  variantes?: { id?: string; nombre: string; valor: string; sku: string; stock: number; precio: number }[]; // Variantes completas agregadas desde el formulario

  /**
   * Lotes asociados al producto (gestión de vencimientos y trazabilidad).
   * Si el producto no requiere control de lotes, dejar vacío o no usar.
   */
  lotes?: LoteProducto[];

  /**
   * Números de serie asociados al producto (gestión individual y trazabilidad).
   * Si el producto requiere seguimiento individual, llenar este campo.
   */
  numerosSerie?: NumeroSerieProducto[];
}

/**
 * Interfaz para la gestión de números de serie de productos
 */
export interface NumeroSerieProducto {
  id: string; // Identificador único del número de serie
  numeroSerie: string; // Número de serie único
  observaciones?: string; // Campo opcional para notas adicionales
  vendido?: boolean; // Indica si el artículo fue vendido
  fechaVenta?: string; // Fecha de venta (ISO) si aplica
}

/**
 * Interfaz para la gestión de lotes y fechas de vencimiento de productos
 */
export interface LoteProducto {
  id: string; // Identificador único del lote
  numeroLote: string; // Número o código del lote
  cantidad: number; // Cantidad de unidades en el lote
  fechaVencimiento: string; // Fecha de vencimiento en formato ISO (YYYY-MM-DD)
  observaciones?: string; // Campo opcional para notas adicionales
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

/**
 * Tipos de movimientos para el Kardex de inventario
 */
export enum TipoMovimientoInventario {
  ENTRADA = 'entrada',       // Compras, devoluciones de clientes
  SALIDA = 'salida',        // Ventas, envíos
  AJUSTE = 'ajuste',        // Correcciones de inventario
  TRASLADO = 'traslado',    // Movimiento entre ubicaciones
  MERMA = 'merma',          // Pérdida, deterioro, caducidad
  INVENTARIO = 'inventario' // Ajuste por conteo de inventario
}

/**
 * Interfaz para los movimientos de inventario (Kardex)
 */
/**
 * Interfaz para proveedores
 */
export interface Proveedor {
  id: string; // Identificador único del proveedor
  nombre: string; // Nombre comercial
  contacto?: string; // Nombre de contacto
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
}

/**
 * Interfaz para órdenes de compra
 */
export interface OrdenCompra {
  id: string; // Identificador único de la orden
  proveedorId: string; // Relación con proveedor
  proveedor?: Proveedor; // Objeto proveedor (opcional para visualización)
  fecha: string; // Fecha de emisión (ISO)
  estado: 'pendiente' | 'recibida' | 'cancelada';
  productos: OrdenCompraProducto[]; // Productos solicitados
  total: number;
  notas?: string;
}

/**
 * Producto dentro de una orden de compra
 */
export interface OrdenCompraProducto {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  loteAsignado?: string;
  numeroSerieAsignado?: string;
}

export interface MovimientoInventario {
  id: string;
  fecha: Date;
  productoId: string;
  productoNombre: string;   // Para facilitar la visualización sin joins
  productoSku: string;      // Para facilitar la visualización sin joins
  varianteId?: string;      // Si el movimiento es específico a una variante
  tipoMovimiento: TipoMovimientoInventario;
  cantidad: number;         // Cantidad positiva o negativa según el tipo
  stockPrevio: number;      // Stock antes del movimiento
  stockResultante: number;  // Stock después del movimiento
  precioUnitario?: number;  // Para calcular valores de inventario
  motivo: string;           // Descripción detallada del motivo
  documentoReferencia?: string; // Número de factura, orden, etc.
  responsable: string;      // Usuario que realizó el movimiento
  ubicacion?: string;       // Ubicación física del producto
  notas?: string;           // Información adicional
}
