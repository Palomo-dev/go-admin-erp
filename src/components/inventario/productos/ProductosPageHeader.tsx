"use client";

import React from 'react';

interface ProductosPageHeaderProps {
  title: string;
  showActions?: boolean;
  onCreateNew?: () => void;
  onBack?: () => void;
  onEdit?: () => void;
  onImport?: () => void;
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
  onImport,
}) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
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

      <div className="flex flex-row gap-3 mt-2 sm:mt-0">
        {showActions && onEdit && (
          <button
            onClick={onEdit}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
          >
            Editar
          </button>
        )}
        
        {showActions && onImport && (
          <button
            onClick={onImport}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Importar
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
