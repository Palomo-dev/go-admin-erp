import React from 'react';
import CategoriasManager from '@/components/inventario/categorias/CategoriasManager';

/**
 * Página principal de gestión de categorías y familias de productos
 * 
 * Esta página permite la gestión completa de la estructura jerárquica de categorías:
 * - Visualización en árbol de categorías y subcategorías
 * - Creación, edición y eliminación de categorías
 * - Reordenación mediante drag-and-drop
 * - Definición de atributos específicos por categoría
 */
export default function CategoriasPage() {
  return (
    <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-3 sm:px-4 md:px-6">
      <CategoriasManager />
    </div>
  );
}
