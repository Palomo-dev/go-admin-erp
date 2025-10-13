'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TareasPaginationProps {
  totalTareas: number;
  paginaActual: number;
  elementosPorPagina: number;
  onPaginaChange: (pagina: number) => void;
  onElementosPorPaginaChange: (elementos: number) => void;
}

const TareasPagination: React.FC<TareasPaginationProps> = ({
  totalTareas,
  paginaActual,
  elementosPorPagina,
  onPaginaChange,
  onElementosPorPaginaChange
}) => {
  const totalPaginas = Math.ceil(totalTareas / elementosPorPagina);
  const inicioRango = (paginaActual - 1) * elementosPorPagina + 1;
  const finRango = Math.min(paginaActual * elementosPorPagina, totalTareas);

  const paginasVisibles = () => {
    const paginas = [];
    const maxPaginas = 5;
    
    let inicio = Math.max(1, paginaActual - Math.floor(maxPaginas / 2));
    let fin = Math.min(totalPaginas, inicio + maxPaginas - 1);
    
    if (fin - inicio + 1 < maxPaginas) {
      inicio = Math.max(1, fin - maxPaginas + 1);
    }
    
    for (let i = inicio; i <= fin; i++) {
      paginas.push(i);
    }
    
    return paginas;
  };

  if (totalTareas === 0) {
    return null;
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mt-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:space-x-2 w-full sm:w-auto">
        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          Mostrando {inicioRango} a {finRango} de {totalTareas} tareas
        </span>
        <div className="flex items-center gap-2">
          <Select 
            value={elementosPorPagina.toString()} 
            onValueChange={(value) => onElementosPorPaginaChange(parseInt(value))}
          >
            <SelectTrigger className="w-20 h-9 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="10" className="text-gray-900 dark:text-gray-100">10</SelectItem>
              <SelectItem value="25" className="text-gray-900 dark:text-gray-100">25</SelectItem>
              <SelectItem value="50" className="text-gray-900 dark:text-gray-100">50</SelectItem>
              <SelectItem value="100" className="text-gray-900 dark:text-gray-100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">por página</span>
        </div>
      </div>
      
      <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPaginaChange(paginaActual - 1)}
          disabled={paginaActual === 1}
          className="min-h-[36px] px-2 sm:px-3 text-xs sm:text-sm border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Anterior</span>
        </Button>
        
        {paginasVisibles().map((pagina) => (
          <Button
            key={pagina}
            variant={pagina === paginaActual ? "default" : "outline"}
            size="sm"
            onClick={() => onPaginaChange(pagina)}
            className={`min-w-[2.5rem] min-h-[36px] text-xs sm:text-sm ${
              pagina === paginaActual 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {pagina}
          </Button>
        ))}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPaginaChange(paginaActual + 1)}
          disabled={paginaActual === totalPaginas}
          className="min-h-[36px] px-2 sm:px-3 text-xs sm:text-sm border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <span className="hidden sm:inline mr-1">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default TareasPagination;
