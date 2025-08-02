'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { X, Filter, Calendar as CalendarIcon, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TaskStatusUI, TaskType, TaskPriorityUI, TaskFilter, TaskPriority } from '@/types/task';

interface FiltrosTareasProps {
  onFiltrosChange: (filtros: TaskFilter) => void;
  filtroTextoExterno?: string; // Texto de búsqueda recibido de componente externo
  filtrosIniciales?: TaskFilter; // Filtros iniciales que pueden venir del componente padre
}

export default function FiltrosTareas({ onFiltrosChange, mostrarFiltros = false, filtroTextoExterno, filtrosIniciales }: FiltrosTareasProps & { mostrarFiltros?: boolean }) {
  const [filtros, setFiltros] = useState<TaskFilter>(filtrosIniciales || {});
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');

  // Efecto para sincronizar con filtros iniciales cuando cambian
  useEffect(() => {
    if (filtrosIniciales) {
      console.log('💡 Sincronizando filtros con valores iniciales:', filtrosIniciales);
      setFiltros(prevFiltros => ({
        ...prevFiltros,
        ...filtrosIniciales
      }));
    }
  }, [filtrosIniciales]);

  // Efecto para sincronizar con el filtro externo de texto
  useEffect(() => {
    if (filtroTextoExterno !== undefined && filtroTextoExterno !== null) {
      console.log(' Sincronizando con texto externo:', filtroTextoExterno);
      // Si el texto externo es diferente al actual, actualizamos el estado local
      if (filtroTextoExterno !== busquedaTexto) {
        setBusquedaTexto(filtroTextoExterno);
        // No es necesario llamar a onFiltroChange aquí porque ya se está manejando en el componente padre
        console.log(' Campo de búsqueda sincronizado con valor externo');
      }
    }
  }, [filtroTextoExterno, busquedaTexto]);

  // Función para actualizar filtros
  const actualizarFiltro = (campo: keyof TaskFilter, valor: any) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    setFiltros(nuevosFiltros);
    onFiltrosChange(nuevosFiltros);
  };

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({});
    onFiltrosChange({});
  };

  // Función para eliminar un filtro específico
  const eliminarFiltro = (campo: keyof TaskFilter) => {
    const nuevosFiltros = { ...filtros };
    delete nuevosFiltros[campo];
    setFiltros(nuevosFiltros);
    onFiltrosChange(nuevosFiltros);
  };

  // Función para traducir valores de prioridad de inglés a español
  const traducirPrioridad = (prioridad: string): string => {
    // Verificar si ya es un valor en español
    if (prioridad === 'baja' || prioridad === 'media' || prioridad === 'alta' || prioridad === 'urgente') {
      return prioridad;
    }
    
    // Traducir valores de la BD a español
    switch (prioridad) {
      case 'low':
        return 'Baja';
      case 'med':
        return 'Media';
      case 'high':
        return 'Alta';
      default:
        return prioridad; // Por si acaso es un valor desconocido
    }
  };

  // Función para traducir valores de estado de inglés a español
  const traducirEstado = (estado: string): string => {
    switch (estado) {
      case 'open':
        return 'Pendiente';
      case 'in_progress':
        return 'En progreso';
      case 'done':
        return 'Completada';
      case 'canceled':
        return 'Cancelada';
      default:
        return estado;
    }
  };

  return (
    <div className="mb-4">
      {/* Header de filtros con botón para limpiar */}
      <div className="flex justify-between items-center mb-2" id="filtros">
        {/* Mostrar cantidad de filtros activos */}
        {Object.keys(filtros).length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground flex items-center gap-1"
            onClick={limpiarFiltros}
          >
            Limpiar filtros
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {/* Filtros aplicados - siempre visibles si hay filtros activos */}
      {Object.keys(filtros).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {filtros.texto && (
            <Badge variant="outline" className="flex items-center gap-1">
              Texto: {filtros.texto}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => eliminarFiltro('texto')} 
              />
            </Badge>
          )}
          {filtros.status && (
            <Badge variant="outline" className="flex items-center gap-1">
              Estado: {traducirEstado(filtros.status)}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => eliminarFiltro('status')} 
              />
            </Badge>
          )}
          {filtros.type && (
            <Badge variant="outline" className="flex items-center gap-1">
              Tipo: {filtros.type}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => eliminarFiltro('type')} 
              />
            </Badge>
          )}
          {filtros.prioridad && (
            <Badge variant="outline" className="flex items-center gap-1">
              Prioridad: {traducirPrioridad(filtros.prioridad)}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => eliminarFiltro('prioridad')} 
              />
            </Badge>
          )}
          {filtros.fecha && (
            <Badge variant="outline" className="flex items-center gap-1">
              Fecha: {format(new Date(filtros.fecha), 'dd/MM/yyyy', { locale: es })}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => eliminarFiltro('fecha')} 
              />
            </Badge>
          )}
          {filtros.asignado && (
            <Badge variant="outline" className="flex items-center gap-1">
              Asignado: {filtros.asignado === 'si' ? 'Asignadas' : 'Sin asignar'}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => eliminarFiltro('asignado')} 
              />
            </Badge>
          )}
        </div>
      )}
      
      {/* Panel de filtros - mostrar solo cuando mostrarFiltros es true */}
      {mostrarFiltros && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border rounded-md bg-card">
          {/* Filtro por texto */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar en título y descripción" 
              value={filtros.texto || ''}
              onChange={(e) => actualizarFiltro('texto', e.target.value)}
              className="h-8"
              // Aseguramos que el buscador tenga la misma experiencia de usuario que el principal
              autoFocus={false}
              spellCheck={false}
            />
          </div>
          
          {/* Filtro por estado */}
          <Select 
            value={filtros.status || 'todas'}
            onValueChange={(value) => value === 'todas' ? eliminarFiltro('status') : actualizarFiltro('status', value)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              <SelectItem value="open">Pendiente</SelectItem>
              <SelectItem value="in_progress">En progreso</SelectItem>
              <SelectItem value="done">Completada</SelectItem>
              <SelectItem value="canceled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filtro por tipo de tarea */}
          <Select 
            value={filtros.type || 'todas'}
            onValueChange={(value) => {
              console.log(`🔄 Cambiando filtro de tipo a: ${value}`);
              if (value === 'todas') {
                eliminarFiltro('type');
              } else {
                actualizarFiltro('type', value);
              }
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los tipos</SelectItem>
              <SelectItem value="llamada">Llamada</SelectItem>
              <SelectItem value="reunion">Reunión</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="visita">Visita</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filtro por prioridad */}
          <Select 
            value={filtros.prioridad || 'todas'}
            onValueChange={(value) => value === 'todas' ? eliminarFiltro('prioridad') : actualizarFiltro('prioridad', value)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las prioridades</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
              <SelectItem value="med">Media</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filtro por fecha */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="h-8 justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filtros.fecha ? (
                  format(new Date(filtros.fecha), 'PPP', { locale: es })
                ) : (
                  <span>Fecha límite</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filtros.fecha ? new Date(filtros.fecha) : undefined}
                onSelect={(date) => date ? actualizarFiltro('fecha', date.toISOString()) : eliminarFiltro('fecha')}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          {/* Filtro por asignación */}
          <Select 
            value={filtros.asignado || 'todas'}
            onValueChange={(value) => value === 'todas' ? eliminarFiltro('asignado') : actualizarFiltro('asignado', value)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Asignación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="si">Asignadas</SelectItem>
              <SelectItem value="no">Sin asignar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
