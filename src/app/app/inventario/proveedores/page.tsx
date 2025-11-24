import React from 'react';
import CatalogoProveedores from '@/components/inventario/proveedores/CatalogoProveedores';

/**
 * Página principal del catálogo de proveedores
 * 
 * Esta página permite la gestión completa de proveedores incluyendo:
 * - Listado de proveedores
 * - Creación, edición y eliminación de proveedores
 * - Visualización de historial de compras
 * - Seguimiento de condiciones de pago y cumplimiento
 */
export default function ProveedoresPage() {
  return (
    <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-3 sm:px-4 md:px-6">
      <CatalogoProveedores />
    </div>
  );
}
