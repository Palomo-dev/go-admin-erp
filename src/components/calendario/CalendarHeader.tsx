'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalendarViewType } from './types';
import { cn } from '@/utils/Utils';

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarViewType;
  isLoading?: boolean;
  onViewChange: (view: CalendarViewType) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onNewEvent: () => void;
}

export function CalendarHeader({
  currentDate,
  view,
  isLoading = false,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
  onRefresh,
  onNewEvent,
}: CalendarHeaderProps) {
  const getTitle = () => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: es });
      case 'week':
        return `Semana del ${format(currentDate, "d 'de' MMMM", { locale: es })}`;
      case 'day':
        return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: es });
      case 'agenda':
        return 'Agenda';
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <CalendarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white capitalize">
            {getTitle()}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Calendario unificado de eventos
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Navegación */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToday}
            className="h-8 px-3 text-sm"
          >
            Hoy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Selector de vista */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(['month', 'week', 'day', 'agenda'] as CalendarViewType[]).map((v) => (
            <Button
              key={v}
              variant="ghost"
              size="sm"
              onClick={() => onViewChange(v)}
              className={cn(
                'h-8 px-3 text-sm capitalize',
                view === v && 'bg-white dark:bg-gray-700 shadow-sm'
              )}
            >
              {v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : v === 'day' ? 'Día' : 'Agenda'}
            </Button>
          ))}
        </div>

        {/* Acciones */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-8"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Actualizar
        </Button>
        <Button
          size="sm"
          onClick={onNewEvent}
          className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Evento
        </Button>
      </div>
    </div>
  );
}
