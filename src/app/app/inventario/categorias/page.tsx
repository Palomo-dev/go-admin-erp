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
    <div className="container mx-auto py-6 px-4">
      <CategoriasManager />
    </div>
  );
}
