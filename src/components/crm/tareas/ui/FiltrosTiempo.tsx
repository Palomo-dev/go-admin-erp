'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { CalendarDays, Calendar, Clock } from 'lucide-react';
import { TaskFilter } from '@/types/task';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface FiltrosTiempoProps {
  onChange: (filtro: TaskFilter) => void;
  filtroActivo?: 'todos' | 'hoy' | 'semana' | 'mes' | null;
}

/**
 * Componente para filtrar tareas por períodos de tiempo
 * Permite filtrar por hoy, esta semana, o este mes
 */
export function FiltrosTiempo({ onChange, filtroActivo = null }: FiltrosTiempoProps) {
  // Función que aplica un filtro de tiempo y genera un objeto filtro apropiado
  const aplicarFiltroTiempo = (tipo: 'todos' | 'hoy' | 'semana' | 'mes' | null) => {
    console.log(`🕰️ Aplicando filtro de tiempo: ${tipo}, filtro activo actual: ${filtroActivo}`);
    
    // Si hacemos clic en el filtro activo, volvemos a "todos"
    if (tipo === filtroActivo && tipo !== 'todos') {
      console.log('🔄 Desactivando filtro, volviendo a "todos"');
      onChange({ timeframe: 'todos' });
      return;
    }

    const ahora = new Date();
    let desde: Date;
    let hasta: Date;

    switch (tipo) {
      case 'todos':
        // Para el filtro "todos", no aplicamos ningún filtro temporal
        console.log('📊 Mostrando todas las tareas');
        onChange({ timeframe: 'todos' });
        return;
      case 'hoy':
        desde = startOfDay(ahora);
        hasta = endOfDay(ahora);
        break;
      case 'semana':
        desde = startOfWeek(ahora, { locale: es });
        hasta = endOfWeek(ahora, { locale: es });
        break;
      case 'mes':
        desde = startOfMonth(ahora);
        hasta = endOfMonth(ahora);
        break;
      default:
        onChange({});
        return;
    }

    // IMPORTANTE: Ya no establecemos el campo fecha, solo el timeframe
    // para evitar conflictos con FiltrosTareas.tsx
    onChange({
      timeframe: tipo
      // Eliminada la manipulación del campo fecha
    });
  };

  // Función para mostrar la fecha en formato legible según el filtro
  const formatoFecha = () => {
    const ahora = new Date();
    switch (filtroActivo) {
      case 'hoy':
        return `Hoy, ${format(ahora, 'd MMMM', { locale: es })}`;
      case 'semana':
        const inicioSemana = startOfWeek(ahora, { locale: es });
        const finSemana = endOfWeek(ahora, { locale: es });
        return `Semana ${format(inicioSemana, 'd')} - ${format(finSemana, 'd MMM', { locale: es })}`;
      case 'mes':
        return `${format(ahora, 'MMMM yyyy', { locale: es })}`;
      default:
        return '';
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={filtroActivo === 'todos' || filtroActivo === null ? "default" : "outline"}
        size="sm"
        className={cn(
          "rounded-md flex items-center gap-1",
          filtroActivo === 'todos' || filtroActivo === null ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        )}
        onClick={() => aplicarFiltroTiempo('todos')}
      >
        <Clock className="h-3.5 w-3.5" />
        Todos
      </Button>
      
      <Button
        variant={filtroActivo === 'hoy' ? "default" : "outline"}
        size="sm"
        className={cn(
          "rounded-md flex items-center gap-1",
          filtroActivo === 'hoy' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        )}
        onClick={() => aplicarFiltroTiempo('hoy')}
      >
        <Clock className="h-3.5 w-3.5" />
        Hoy
      </Button>

      <Button
        variant={filtroActivo === 'semana' ? "default" : "outline"}
        size="sm"
        className={cn(
          "rounded-md flex items-center gap-1",
          filtroActivo === 'semana' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        )}
        onClick={() => aplicarFiltroTiempo('semana')}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Esta semana
      </Button>

      <Button
        variant={filtroActivo === 'mes' ? "default" : "outline"}
        size="sm"
        className={cn(
          "rounded-md flex items-center gap-1",
          filtroActivo === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        )}
        onClick={() => aplicarFiltroTiempo('mes')}
      >
        <Calendar className="h-3.5 w-3.5" />
        Este mes
      </Button>
      
      {filtroActivo && (
        <span className="text-xs text-muted-foreground ml-2">
          {formatoFecha()}
        </span>
      )}
    </div>
  );
}

export default FiltrosTiempo;
