'use client';

import { useState, useMemo, useCallback } from 'react';
import { format, isToday, isTomorrow, isThisWeek, startOfDay, differenceInMinutes, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Building2,
  ExternalLink,
  MoreHorizontal,
  Copy,
  Pencil,
  XCircle,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CalendarEvent,
  EventStatus,
  AgendaQuickFilter,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_COLORS,
} from './types';
import { cn } from '@/utils/Utils';

interface AgendaViewProps {
  events: CalendarEvent[];
  currentUserId?: string;
  onEventClick: (event: CalendarEvent) => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onDuplicateEvent?: (event: CalendarEvent) => void;
  onCancelEvent?: (eventId: string) => Promise<void>;
  onUpdateStatus?: (eventId: string, status: EventStatus) => Promise<void>;
  onNavigateToSource?: (event: CalendarEvent) => void;
}

interface GroupedEvents {
  date: Date;
  dateLabel: string;
  events: CalendarEvent[];
}

const STATUS_LABELS: Record<EventStatus, string> = {
  confirmed: 'Confirmado',
  tentative: 'Tentativo',
  cancelled: 'Cancelado',
  pending: 'Pendiente',
  completed: 'Completado',
};

const STATUS_COLORS: Record<EventStatus, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  tentative: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export function AgendaView({
  events,
  currentUserId,
  onEventClick,
  onEditEvent,
  onDuplicateEvent,
  onCancelEvent,
  onUpdateStatus,
  onNavigateToSource,
}: AgendaViewProps) {
  const [quickFilter, setQuickFilter] = useState<AgendaQuickFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    switch (quickFilter) {
      case 'mine':
        filtered = filtered.filter((e) => e.assigned_to === currentUserId);
        break;
      case 'today':
        filtered = filtered.filter((e) => isToday(new Date(e.start_at)));
        break;
      case 'week':
        filtered = filtered.filter((e) => isThisWeek(new Date(e.start_at), { weekStartsOn: 1 }));
        break;
      case 'pending':
        filtered = filtered.filter((e) => e.status === 'pending' || e.status === 'tentative');
        break;
      case 'cancelled':
        filtered = filtered.filter((e) => e.status === 'cancelled');
        break;
    }

    return filtered.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, quickFilter, currentUserId]);

  const groupedEvents = useMemo((): GroupedEvents[] => {
    const groups: Map<string, GroupedEvents> = new Map();

    filteredEvents.forEach((event) => {
      const eventDate = startOfDay(new Date(event.start_at));
      const dateKey = format(eventDate, 'yyyy-MM-dd');

      if (!groups.has(dateKey)) {
        let dateLabel = format(eventDate, "EEEE, d 'de' MMMM", { locale: es });
        if (isToday(eventDate)) {
          dateLabel = `Hoy - ${dateLabel}`;
        } else if (isTomorrow(eventDate)) {
          dateLabel = `Mañana - ${dateLabel}`;
        }

        groups.set(dateKey, {
          date: eventDate,
          dateLabel,
          events: [],
        });
      }

      groups.get(dateKey)!.events.push(event);
    });

    return Array.from(groups.values());
  }, [filteredEvents]);

  const toggleGroup = useCallback((dateKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  const getDuration = (event: CalendarEvent) => {
    if (event.all_day) return 'Todo el día';
    if (!event.end_at) return '';
    const minutes = differenceInMinutes(new Date(event.end_at), new Date(event.start_at));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  };

  const isManualEvent = (event: CalendarEvent) => event.source_type === 'calendar_event';

  const quickFilters: { key: AgendaQuickFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'mine', label: 'Solo los míos' },
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Esta semana' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'cancelled', label: 'Cancelados' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filtros rápidos */}
      <div className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((filter) => (
            <Button
              key={filter.key}
              variant={quickFilter === filter.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setQuickFilter(filter.key)}
              className={cn(
                'h-8',
                quickFilter === filter.key && 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {filteredEvents.length} evento{filteredEvents.length !== 1 ? 's' : ''} encontrado{filteredEvents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Lista de eventos agrupados */}
      <div className="flex-1 overflow-y-auto">
        {groupedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <Calendar className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No hay eventos</p>
            <p className="text-sm">Ajusta los filtros o crea un nuevo evento</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {groupedEvents.map((group) => {
              const dateKey = format(group.date, 'yyyy-MM-dd');
              const isExpanded = !expandedGroups.has(dateKey);
              const isTodayGroup = isToday(group.date);

              return (
                <div key={dateKey} className="bg-white dark:bg-gray-900">
                  {/* Header del grupo */}
                  <button
                    onClick={() => toggleGroup(dateKey)}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                      isTodayGroup && 'bg-blue-50 dark:bg-blue-900/20'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                      <span className={cn(
                        'font-semibold capitalize',
                        isTodayGroup ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'
                      )}>
                        {group.dateLabel}
                      </span>
                    </div>
                    <Badge variant="secondary" className="ml-2">
                      {group.events.length}
                    </Badge>
                  </button>

                  {/* Eventos del grupo */}
                  {isExpanded && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {group.events.map((event, index) => (
                        <div
                          key={`${event.id || event.source_id}-${index}`}
                          className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            {/* Hora */}
                            <div className="flex-shrink-0 w-16 text-center">
                              {event.all_day ? (
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                  Todo el día
                                </span>
                              ) : (
                                <>
                                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {format(new Date(event.start_at), 'HH:mm')}
                                  </div>
                                  {event.end_at && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {format(new Date(event.end_at), 'HH:mm')}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Barra de color */}
                            <div
                              className="flex-shrink-0 w-1 self-stretch rounded-full"
                              style={{ backgroundColor: event.color || SOURCE_TYPE_COLORS[event.source_type] }}
                            />

                            {/* Contenido */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() => onEventClick(event)}
                                    className="text-left"
                                  >
                                    <h4 className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate">
                                      {event.title}
                                    </h4>
                                  </button>

                                  {/* Badges */}
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                      style={{
                                        borderColor: event.color || SOURCE_TYPE_COLORS[event.source_type],
                                        color: event.color || SOURCE_TYPE_COLORS[event.source_type],
                                      }}
                                    >
                                      {SOURCE_TYPE_LABELS[event.source_type]}
                                    </Badge>

                                    {event.status && (
                                      <Badge className={cn('text-xs', STATUS_COLORS[event.status])}>
                                        {STATUS_LABELS[event.status]}
                                      </Badge>
                                    )}

                                    {getDuration(event) && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {getDuration(event)}
                                      </span>
                                    )}
                                  </div>

                                  {/* Detalles adicionales */}
                                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    {event.location && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {event.location}
                                      </span>
                                    )}
                                    {event.assigned_to && (
                                      <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        Asignado
                                      </span>
                                    )}
                                    {event.branch_id && (
                                      <span className="flex items-center gap-1">
                                        <Building2 className="h-3 w-3" />
                                        Sucursal
                                      </span>
                                    )}
                                    {event.customer_id && (
                                      <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        Cliente
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Acciones */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => onEventClick(event)}>
                                      <Calendar className="h-4 w-4 mr-2" />
                                      Ver detalle
                                    </DropdownMenuItem>

                                    {!isManualEvent(event) && onNavigateToSource && (
                                      <DropdownMenuItem onClick={() => onNavigateToSource(event)}>
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        Ver en módulo origen
                                      </DropdownMenuItem>
                                    )}

                                    {isManualEvent(event) && (
                                      <>
                                        <DropdownMenuSeparator />
                                        
                                        {onEditEvent && (
                                          <DropdownMenuItem onClick={() => onEditEvent(event)}>
                                            <Pencil className="h-4 w-4 mr-2" />
                                            Editar
                                          </DropdownMenuItem>
                                        )}

                                        {onDuplicateEvent && (
                                          <DropdownMenuItem onClick={() => onDuplicateEvent(event)}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Duplicar
                                          </DropdownMenuItem>
                                        )}

                                        <DropdownMenuSeparator />

                                        {onUpdateStatus && (
                                          <>
                                            <DropdownMenuItem onClick={() => onUpdateStatus(event.id || event.source_id, 'confirmed')}>
                                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                              Marcar confirmado
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onUpdateStatus(event.id || event.source_id, 'tentative')}>
                                              <HelpCircle className="h-4 w-4 mr-2 text-yellow-600" />
                                              Marcar tentativo
                                            </DropdownMenuItem>
                                          </>
                                        )}

                                        {onCancelEvent && event.status !== 'cancelled' && (
                                          <DropdownMenuItem
                                            onClick={() => onCancelEvent(event.id || event.source_id)}
                                            className="text-red-600 dark:text-red-400"
                                          >
                                            <XCircle className="h-4 w-4 mr-2" />
                                            Cancelar evento
                                          </DropdownMenuItem>
                                        )}
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
