"use client";

import React from 'react';

interface ProductosPageHeaderProps {
  title: string;
  showActions?: boolean;
  onCreateNew?: () => void;
  onBack?: () => void;
  onEdit?: () => void;
}

/**
 * Cabecera para las páginas de productos
 * 
 * Este componente muestra el título de la página y las acciones principales
 * como crear nuevo producto, volver atrás o editar producto.
 */
const ProductosPageHeader: React.FC<ProductosPageHeaderProps> = ({
  title,
  showActions = false,
  onCreateNew,
  onBack,
  onEdit,
}) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <button 
            onClick={onBack} 
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Volver atrás"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth={1.5} 
              stroke="currentColor" 
              className="w-5 h-5 text-gray-700"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
        )}
        <h1 className="text-2xl font-semibold text-gray-800">{title}</h1>
      </div>

      <div className="space-x-3">
        {showActions && onEdit && (
          <button
            onClick={onEdit}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
          >
            Editar
          </button>
        )}
        
        {showActions && onCreateNew && (
          <button
            onClick={onCreateNew}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Nuevo Producto
          </button>
        )}
      </div>
    </div>
  );
};

export default ProductosPageHeader;
