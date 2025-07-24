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
    <div className="flex items-center justify-between mt-4">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">
          Mostrando {inicioRango} a {finRango} de {totalTareas} tareas
        </span>
        <Select 
          value={elementosPorPagina.toString()} 
          onValueChange={(value) => onElementosPorPaginaChange(parseInt(value))}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">por página</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPaginaChange(paginaActual - 1)}
          disabled={paginaActual === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        
        {paginasVisibles().map((pagina) => (
          <Button
            key={pagina}
            variant={pagina === paginaActual ? "default" : "outline"}
            size="sm"
            onClick={() => onPaginaChange(pagina)}
            className="min-w-[2.5rem]"
          >
            {pagina}
          </Button>
        ))}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPaginaChange(paginaActual + 1)}
          disabled={paginaActual === totalPaginas}
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default TareasPagination;
