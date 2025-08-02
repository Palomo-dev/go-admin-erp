'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskFilter, TaskViewMode } from '@/types/task';
import FiltrosTiempo from './FiltrosTiempo';
import { TipoVista } from '../core/types';
import { Filter, Search, List, Columns, TreePine } from 'lucide-react';

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
      <div className="flex justify-between items-center mb-4">
        {/* Filtros de tiempo */}
        <div className="flex items-center gap-1">
          <FiltrosTiempo 
            onChange={onFiltroTiempo}
            filtroActivo={filtroTemporalActivo}
          />
          
          {/* Botón para mostrar/ocultar filtros - alineado con los botones de tiempo */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={onToggleFiltros}
            className="rounded-md flex items-center gap-1 text-muted-foreground"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </Button>
        </div>
        
        {/* Selector de vistas */}
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-1 rounded-md bg-muted p-1">
            <Button
              variant={vista === 'lista' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onCambiarVista('lista')}
              className="h-8 px-3"
            >
              <List className="h-4 w-4 mr-1" />
              Lista
            </Button>
            <Button
              variant={vista === 'tablero' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onCambiarVista('tablero')}
              className="h-8 px-3"
            >
              <Columns className="h-4 w-4 mr-1" />
              Tablero
            </Button>
          </div>
          
          {/* Selector de modo jerárquico (solo en vista lista) */}
          {vista === 'lista' && modoVista && onCambiarModoVista && (
            <div className="flex items-center space-x-1 rounded-md bg-muted p-1">
              <Button
                variant={modoVista === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onCambiarModoVista('list')}
                className="h-8 px-3"
                title="Vista plana"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={modoVista === 'hierarchy' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onCambiarModoVista('hierarchy')}
                className="h-8 px-3"
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar tareas..."
            value={busquedaLocal}
            onChange={handleBusquedaChange}
            className="pl-10"
          />
        </div>
      </div>
    </>
  );
};

export default TareasHeader;
