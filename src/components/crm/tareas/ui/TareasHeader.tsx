'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskFilter, TaskViewMode } from '@/types/task';
import FiltrosTiempo from './FiltrosTiempo';
import { TipoVista } from '../core/types';
import { Filter, Search, List, Columns, TreePine } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface TareasHeaderProps {
  vista: TipoVista;
  modoVista?: TaskViewMode;
  filtroTemporalActivo: 'todos' | 'hoy' | 'semana' | 'mes' | null;
  busquedaLocal: string;
  timeoutBusqueda: NodeJS.Timeout | null;
  onCambiarVista: (vista: TipoVista) => void;
  onCambiarModoVista?: (modo: TaskViewMode) => void;
  onFiltroTiempo: (filtro: TaskFilter) => void;
  onToggleFiltros: () => void;
  onBusquedaChange: (value: string) => void;
  setTimeoutBusqueda: (timeout: NodeJS.Timeout | null) => void;
  onFiltroChange?: (filtro: TaskFilter) => void;
}

const TareasHeader: React.FC<TareasHeaderProps> = ({
  vista,
  modoVista,
  filtroTemporalActivo,
  busquedaLocal,
  timeoutBusqueda,
  onCambiarVista,
  onCambiarModoVista,
  onFiltroTiempo,
  onToggleFiltros,
  onBusquedaChange,
  setTimeoutBusqueda,
  onFiltroChange
}) => {
  const handleBusquedaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onBusquedaChange(value);
    
    // Aplicar filtro de texto con debounce
    if (timeoutBusqueda) {
      clearTimeout(timeoutBusqueda);
    }
    
    const nuevoTimeout = setTimeout(() => {
      if (onFiltroChange) {
        onFiltroChange({ texto: value });
      }
    }, 300);
    
    setTimeoutBusqueda(nuevoTimeout);
  };

  return (
    <>
      {/* Cabecera con filtros y selector de vistas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
        {/* Filtros de tiempo */}
        <div className="flex items-center gap-1 sm:gap-2 w-full md:w-auto overflow-x-auto">
          <FiltrosTiempo 
            onChange={onFiltroTiempo}
            filtroActivo={filtroTemporalActivo}
          />
          
          {/* Botón para mostrar/ocultar filtros - alineado con los botones de tiempo */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={onToggleFiltros}
            className="rounded-md flex items-center gap-1 min-h-[36px] text-xs sm:text-sm text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtros</span>
          </Button>
        </div>
        
        {/* Selector de vistas */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center space-x-1 rounded-md bg-gray-100 dark:bg-gray-800 p-1 flex-1 md:flex-none">
            <Button
              variant={vista === 'lista' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onCambiarVista('lista')}
              className={cn(
                "h-9 px-3 text-xs sm:text-sm flex-1 md:flex-none",
                vista === 'lista' 
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
              )}
            >
              <List className="h-4 w-4 mr-1" />
              <span>Lista</span>
            </Button>
            <Button
              variant={vista === 'tablero' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onCambiarVista('tablero')}
              className={cn(
                "h-9 px-3 text-xs sm:text-sm flex-1 md:flex-none",
                vista === 'tablero' 
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
              )}
            >
              <Columns className="h-4 w-4 mr-1" />
              <span>Tablero</span>
            </Button>
          </div>
          
          {/* Selector de modo jerárquico (solo en vista lista) */}
          {vista === 'lista' && modoVista && onCambiarModoVista && (
            <div className="flex items-center space-x-1 rounded-md bg-gray-100 dark:bg-gray-800 p-1">
              <Button
                variant={modoVista === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onCambiarModoVista('list')}
                className={cn(
                  "h-9 px-3",
                  modoVista === 'list' 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
                )}
                title="Vista plana"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={modoVista === 'hierarchy' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onCambiarModoVista('hierarchy')}
                className={cn(
                  "h-9 px-3",
                  modoVista === 'hierarchy' 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
                )}
                title="Vista jerárquica"
              >
                <TreePine className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Barra de búsqueda */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 h-4 w-4 sm:h-5 sm:w-5" />
          <Input
            placeholder="Buscar tareas..."
            value={busquedaLocal}
            onChange={handleBusquedaChange}
            className="pl-9 sm:pl-10 h-11 sm:h-12 text-sm sm:text-base bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
      </div>
    </>
  );
};

export default TareasHeader;
