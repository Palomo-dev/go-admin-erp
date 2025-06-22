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
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categorías y Familias</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona la estructura jerárquica de tus categorías de productos
        </p>
      </div>
      
      <div className="flex items-center space-x-2 w-full md:w-auto">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            type="search"
            placeholder="Buscar categorías..."
            className="pl-8"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        
        <Button onClick={onCrear}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Nueva categoría
        </Button>
      </div>
    </div>
  );
};

export default CategoriasPageHeader;
