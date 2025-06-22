"use client";

import React from 'react';
import { useTheme } from 'next-themes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { FiltrosProveedores as FiltrosProveedoresType } from './types';

interface FiltrosProveedoresProps {
  filters: FiltrosProveedoresType;
  setFilters: React.Dispatch<React.SetStateAction<FiltrosProveedoresType>>;
}

/**
 * Componente para filtrar la lista de proveedores
 * 
 * Permite buscar proveedores por nombre, NIT, contacto, etc.
 */
const FiltrosProveedores: React.FC<FiltrosProveedoresProps> = ({
  filters,
  setFilters
}) => {
  const { theme } = useTheme();
  
  // Maneja cambios en la entrada de búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, busqueda: e.target.value }));
  };
  
  // Limpia todos los filtros
  const handleClearFilters = () => {
    setFilters({
      busqueda: '',
      estado: '',
      ordenarPor: 'name'
    });
  };
  
  return (
    <div className={`p-4 rounded-md border ${
      theme === 'dark' ? 'border-gray-800 bg-gray-950/50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex flex-wrap gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className={`absolute left-2.5 top-2.5 h-4 w-4 ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`} />
            <Input
              type="search"
              placeholder="Buscar por nombre, NIT, contacto..."
              value={filters.busqueda}
              onChange={handleSearchChange}
              className={`pl-9 ${
                theme === 'dark' 
                  ? 'border-gray-800 bg-gray-900 text-gray-300 placeholder:text-gray-500' 
                  : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400'
              }`}
            />
          </div>
        </div>
        
        {/* Aquí se pueden agregar más filtros como estado, fecha de creación, etc */}
        
        <Button
          variant="outline"
          onClick={handleClearFilters}
          className={`${
            theme === 'dark' 
              ? 'border-gray-700 text-gray-300 hover:bg-gray-800' 
              : 'border-gray-300 text-gray-700 hover:bg-gray-100'
          }`}
          disabled={!filters.busqueda && !filters.estado}
        >
          <X className="mr-2 h-4 w-4" />
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
};

export default FiltrosProveedores;
