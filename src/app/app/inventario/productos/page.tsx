import React from 'react';
import CatalogoProductos from '@/components/inventario/productos/CatalogoProductos';

/**
 * Página principal del catálogo maestro de productos
 * 
 * Esta página permite la gestión completa de productos incluyendo:
 * - Listado de productos
 * - Creación, edición y eliminación de productos
 * - Gestión de variantes (tallas, colores, etc.)
 */
export default function ProductosPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <CatalogoProductos />
    </div>
  );
}
