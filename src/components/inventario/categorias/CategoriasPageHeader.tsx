"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, PlusCircle } from "lucide-react";

interface CategoriasPageHeaderProps {
  onSearch: (term: string) => void;
  onCrear: () => void;
}

/**
 * Componente de encabezado para la página de categorías
 * 
 * Incluye un buscador y botón para crear nueva categoría
 */
const CategoriasPageHeader: React.FC<CategoriasPageHeaderProps> = ({
  onSearch,
  onCrear
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Manejar cambios en el input de búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearch(value);
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="flex-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">Categorías y Familias</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestiona la estructura jerárquica de tus categorías de productos
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
        <div className="relative w-full sm:w-48 md:w-64">
          <Search className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400" />
          <Input
            type="search"
            placeholder="Buscar..."
            className="pl-7 sm:pl-8 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        
        <Button 
          onClick={onCrear}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-sm"
        >
          <PlusCircle className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Nueva categoría</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>
    </div>
  );
};

export default CategoriasPageHeader;
