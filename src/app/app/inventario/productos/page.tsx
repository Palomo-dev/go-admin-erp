import React from 'react';
import CatalogoProductos from '@/components/inventario/productos/CatalogoProductos';

/**
 * Página principal del catálogo de productos
 * 
 * Esta página permite la gestión completa de productos incluyendo:
 * - Listado de productos con información de stock, precios y estado
 * - Filtrado por categorías, estado y búsqueda por texto
 * - Creación, edición, duplicación y eliminación de productos
 * - Importación y exportación de datos en formato CSV
 */
export default function ProductosPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <CatalogoProductos />
    </div>
  );
}
