"use client";

import React from 'react';
import { FiltrosProducto } from '@/types/products';

interface FiltrosProductosProps {
  filters: FiltrosProducto;
  onFilterChange: (filters: FiltrosProducto) => void;
}

/**
 * Componente de filtros para el catálogo de productos
 * 
 * Permite filtrar productos por categoría, estado y búsqueda por texto
 */
const FiltrosProductos: React.FC<FiltrosProductosProps> = ({ filters, onFilterChange }) => {
  // Categorías de ejemplo (en producción vendrían de Supabase)
  const categorias = ['Ropa', 'Calzado', 'Accesorios', 'Electrónica'];

  const handleFilterChange = (key: string, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-grow">
          <label htmlFor="busqueda" className="block text-sm font-medium text-gray-700 mb-1">
            Buscar
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              id="busqueda"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-gray-800 placeholder-gray-500"
              placeholder="Buscar por nombre o SKU..."
              value={filters.busqueda}
              onChange={(e) => handleFilterChange('busqueda', e.target.value)}
            />
          </div>
        </div>

        <div className="sm:w-48">
          <label htmlFor="categoria" className="block text-sm font-medium text-gray-700 mb-1">
            Categoría
          </label>
          <select
            id="categoria"
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md text-gray-800"
            value={filters.categoria}
            onChange={(e) => handleFilterChange('categoria', e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-40">
          <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">
            Estado
          </label>
          <select
            id="estado"
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md text-gray-800"
            value={filters.estado}
            onChange={(e) => handleFilterChange('estado', e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default FiltrosProductos;
