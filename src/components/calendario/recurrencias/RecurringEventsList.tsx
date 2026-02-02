'use client';

import { useState } from 'react';
import { Search, Filter, Plus, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { RecurringEvent } from './useRecurringEvents';
import { RecurringEventCard } from './RecurringEventCard';

interface RecurringEventsListProps {
  events: RecurringEvent[];
  isLoading: boolean;
  onView: (event: RecurringEvent) => void;
  onEdit: (event: RecurringEvent) => void;
  onDelete: (event: RecurringEvent) => void;
  onManageExceptions: (event: RecurringEvent) => void;
  onRefresh: () => void;
  onNewEvent: () => void;
}

export function RecurringEventsList({
  events,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onManageExceptions,
  onRefresh,
  onNewEvent,
}: RecurringEventsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('start_at');

  // Filtrar eventos
  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      searchQuery === '' ||
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || event.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Ordenar eventos
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    switch (sortBy) {
      case 'start_at':
        return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
      case 'title':
        return a.title.localeCompare(b.title);
      case 'exceptions':
        return (b.exceptions_count || 0) - (a.exceptions_count || 0);
      default:
        return 0;
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          {/* Búsqueda */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar eventos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filtro de estado */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="tentative">Tentativo</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
            </SelectContent>
          </Select>

          {/* Ordenar por */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[150px] hidden sm:flex">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start_at">Fecha inicio</SelectItem>
              <SelectItem value="title">Título</SelectItem>
              <SelectItem value="exceptions">Excepciones</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Actualizar
          </Button>
          <Button size="sm" onClick={onNewEvent} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo evento
          </Button>
        </div>
      </div>

      {/* Lista de eventos */}
      {sortedEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            No hay eventos recurrentes
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {searchQuery || statusFilter !== 'all'
              ? 'No se encontraron eventos con los filtros aplicados'
              : 'Crea tu primer evento recurrente para comenzar'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Button onClick={onNewEvent} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-1" />
              Crear evento recurrente
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sortedEvents.length} {sortedEvents.length === 1 ? 'evento recurrente' : 'eventos recurrentes'}
          </p>
          {sortedEvents.map((event) => (
            <RecurringEventCard
              key={event.id}
              event={event}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onManageExceptions={onManageExceptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
