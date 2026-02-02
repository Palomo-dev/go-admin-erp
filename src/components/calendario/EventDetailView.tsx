'use client';

import { useState, useEffect, useMemo } from 'react';
import { format, addDays, addWeeks, addMonths, addYears, isBefore, isAfter, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Building2,
  Users,
  Repeat,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  XCircle,
  Edit3,
  Copy,
  Trash2,
  Ban,
  MoveHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalendarEvent, SOURCE_TYPE_LABELS, EventStatus } from './types';
import { rruleToRecurrence, RecurrenceRule } from './RecurrenceSelector';
import { ExceptionsPanel, CalendarException } from './ExceptionsPanel';
import { cn } from '@/utils/Utils';

interface EventDetailViewProps {
  event: CalendarEvent;
  exceptions?: CalendarException[];
  assignedUser?: { first_name: string; last_name: string } | null;
  customer?: { name: string } | null;
  branch?: { name: string } | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onCancelOccurrence?: (date: Date) => void;
  onMoveOccurrence?: (date: Date) => void;
  onExceptionsChange?: (exceptions: CalendarException[]) => void;
}

const STATUS_COLORS: Record<EventStatus, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  tentative: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const STATUS_LABELS: Record<EventStatus, string> = {
  confirmed: 'Confirmado',
  tentative: 'Tentativo',
  cancelled: 'Cancelado',
  pending: 'Pendiente',
  completed: 'Completado',
};

function generateOccurrences(event: CalendarEvent, recurrence: RecurrenceRule, count: number = 5): Date[] {
  if (!recurrence.enabled) return [];

  const occurrences: Date[] = [];
  const startDate = new Date(event.start_at);
  let currentDate = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Avanzar hasta hoy si la fecha de inicio es anterior
  while (isBefore(currentDate, today) && occurrences.length === 0) {
    currentDate = getNextOccurrence(currentDate, recurrence);
  }

  // Generar las próximas N ocurrencias
  while (occurrences.length < count) {
    if (recurrence.endType === 'until' && recurrence.until) {
      const untilDate = parseISO(recurrence.until);
      if (isAfter(currentDate, untilDate)) break;
    }

    if (recurrence.endType === 'count' && recurrence.count) {
      // Simplificación: no contamos ocurrencias pasadas
      if (occurrences.length >= recurrence.count) break;
    }

    occurrences.push(new Date(currentDate));
    currentDate = getNextOccurrence(currentDate, recurrence);
  }

  return occurrences;
}

function getNextOccurrence(date: Date, recurrence: RecurrenceRule): Date {
  const interval = recurrence.interval || 1;

  switch (recurrence.frequency) {
    case 'daily':
      return addDays(date, interval);
    case 'weekly':
      // Para semanal con días específicos, avanzar al siguiente día de la semana
      if (recurrence.weekDays && recurrence.weekDays.length > 0) {
        let nextDate = addDays(date, 1);
        let weeksPassed = 0;
        while (true) {
          if (recurrence.weekDays.includes(nextDate.getDay())) {
            // Verificar si hemos pasado suficientes semanas
            const weeksDiff = Math.floor((nextDate.getTime() - date.getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weeksDiff >= interval - 1 || weeksPassed >= interval - 1) {
              return nextDate;
            }
          }
          nextDate = addDays(nextDate, 1);
          if (nextDate.getDay() === 1) weeksPassed++; // Lunes = inicio de semana
        }
      }
      return addWeeks(date, interval);
    case 'monthly':
      return addMonths(date, interval);
    case 'yearly':
      return addYears(date, interval);
    default:
      return addDays(date, 1);
  }
}

export function EventDetailView({
  event,
  exceptions = [],
  assignedUser,
  customer,
  branch,
  onEdit,
  onDuplicate,
  onCancel,
  onDelete,
  onCancelOccurrence,
  onMoveOccurrence,
  onExceptionsChange,
}: EventDetailViewProps) {
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [exceptionsPanelOpen, setExceptionsPanelOpen] = useState(false);
  const [cancelOccurrenceDate, setCancelOccurrenceDate] = useState<Date | null>(null);
  const [moveOccurrenceDate, setMoveOccurrenceDate] = useState<Date | null>(null);

  const isManualEvent = event.source_type === 'calendar_event';
  const eventColor = event.color || '#3B82F6';
  const rrule = (event.metadata as Record<string, unknown>)?.rrule as string | null;
  const recurrence = rrule ? rruleToRecurrence(rrule) : null;
  const hasRecurrence = recurrence?.enabled;

  const upcomingOccurrences = useMemo(() => {
    if (!hasRecurrence || !recurrence) return [];
    return generateOccurrences(event, recurrence, 5);
  }, [event, recurrence, hasRecurrence]);

  const activeExceptions = exceptions.filter((e) => e.exception_type === 'cancelled' || e.exception_type === 'modified');
  const cancelledDates = exceptions
    .filter((e) => e.exception_type === 'cancelled')
    .map((e) => e.original_date);

  const handleCancelOccurrence = () => {
    if (cancelOccurrenceDate && onCancelOccurrence) {
      onCancelOccurrence(cancelOccurrenceDate);
      setCancelOccurrenceDate(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header con título y estado */}
      <div className="flex items-start gap-4 pb-4 border-b dark:border-gray-700">
        <div
          className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
          style={{ backgroundColor: eventColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {event.title}
            </h3>
            {event.status && (
              <Badge className={cn('text-xs', STATUS_COLORS[event.status])}>
                {STATUS_LABELS[event.status]}
              </Badge>
            )}
            {!isManualEvent && (
              <Badge variant="secondary" className="text-xs">
                {SOURCE_TYPE_LABELS[event.source_type]}
              </Badge>
            )}
          </div>
          {event.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm leading-relaxed">
              {event.description}
            </p>
          )}
        </div>
      </div>

      {/* Grid de información */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
        {/* Columna izquierda - Fecha y hora */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-blue-600" />
            Fecha y Hora
          </h4>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Fecha</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {format(new Date(event.start_at), "EEE, d MMM yyyy", { locale: es })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Hora</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {event.all_day
                  ? 'Todo el día'
                  : `${format(new Date(event.start_at), 'HH:mm')}${event.end_at ? ` - ${format(new Date(event.end_at), 'HH:mm')}` : ''}`}
              </span>
            </div>
            {event.end_at && !event.all_day && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Duración</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {(() => {
                    const start = new Date(event.start_at);
                    const end = new Date(event.end_at as string);
                    const diff = (end.getTime() - start.getTime()) / (1000 * 60);
                    if (diff < 60) return `${diff} min`;
                    const hours = Math.floor(diff / 60);
                    const mins = diff % 60;
                    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
                  })()}
                </span>
              </div>
            )}
            {event.location && (
              <div className="flex justify-between text-sm pt-2 border-t dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Ubicación
                </span>
                <span className="text-gray-900 dark:text-white font-medium text-right max-w-[60%] truncate">
                  {event.location}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha - Asignación */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <User className="h-4 w-4 text-green-600" />
            Asignación
          </h4>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
            {assignedUser ? (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Responsable</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {assignedUser.first_name} {assignedUser.last_name}
                </span>
              </div>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Responsable</span>
                <span className="text-gray-400 dark:text-gray-500 italic">Sin asignar</span>
              </div>
            )}
            {customer ? (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Cliente
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {customer.name}
                </span>
              </div>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Cliente
                </span>
                <span className="text-gray-400 dark:text-gray-500 italic">Sin cliente</span>
              </div>
            )}
            {branch ? (
              <div className="flex justify-between text-sm pt-2 border-t dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Sucursal
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {branch.name}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Metadatos adicionales */}
      {((event.metadata as Record<string, unknown>)?.event_type || (event.metadata as Record<string, unknown>)?.visibility) && (
        <div className="flex flex-wrap gap-2 py-2">
          {(event.metadata as Record<string, unknown>)?.event_type && (
            <Badge variant="outline" className="text-xs">
              {`Tipo: ${String((event.metadata as Record<string, unknown>)?.event_type || '').charAt(0).toUpperCase()}${String((event.metadata as Record<string, unknown>)?.event_type || '').slice(1)}`}
            </Badge>
          )}
          {(event.metadata as Record<string, unknown>)?.visibility && (
            <Badge variant="outline" className="text-xs">
              {String((event.metadata as Record<string, unknown>)?.visibility) === 'public' ? '🌐 Público' : String((event.metadata as Record<string, unknown>)?.visibility) === 'private' ? '🔒 Privado' : '🏢 Organización'}
            </Badge>
          )}
        </div>
      )}

      {/* Sección Recurrencia */}
      {hasRecurrence && (
        <div className="border rounded-lg dark:border-gray-700">
          <Button
            variant="ghost"
            className="w-full justify-between p-2 h-auto"
            onClick={() => setRecurrenceOpen(!recurrenceOpen)}
          >
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Recurrencia</span>
              <Badge variant="secondary" className="text-xs">
                {upcomingOccurrences.length} próximas
              </Badge>
            </div>
            {recurrenceOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {recurrenceOpen && (
            <div className="p-2 pt-0">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Próximas ocurrencias:
                </p>
                {upcomingOccurrences.map((date, index) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isCancelled = cancelledDates.includes(dateStr);

                  return (
                    <div
                      key={index}
                      className={cn(
                        'flex items-center justify-between py-1.5 px-2 rounded text-sm',
                        isCancelled && 'bg-red-50 dark:bg-red-900/20 line-through opacity-60'
                      )}
                    >
                      <span className="text-gray-700 dark:text-gray-300">
                        {format(date, "EEE d MMM yyyy", { locale: es })}
                      </span>
                      {isManualEvent && !isCancelled && onCancelOccurrence && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                            onClick={() => setCancelOccurrenceDate(date)}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Cancelar
                          </Button>
                          {onMoveOccurrence && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                              onClick={() => setMoveOccurrenceDate(date)}
                            >
                              <MoveHorizontal className="h-3 w-3 mr-1" />
                              Mover
                            </Button>
                          )}
                        </div>
                      )}
                      {isCancelled && (
                        <Badge variant="destructive" className="text-xs">
                          Cancelada
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sección Excepciones */}
      {activeExceptions.length > 0 && (
        <div className="border rounded-lg dark:border-gray-700">
          <Button
            variant="ghost"
            className="w-full justify-between p-2 h-auto"
            onClick={() => setExceptionsOpen(!exceptionsOpen)}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">Excepciones</span>
              <Badge variant="secondary" className="text-xs">
                {activeExceptions.length}
              </Badge>
            </div>
            {exceptionsOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {exceptionsOpen && (
            <div className="p-2 pt-0">
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 space-y-2">
                {activeExceptions.slice(0, 3).map((exception) => (
                  <div
                    key={exception.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {exception.exception_type === 'cancelled' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Edit3 className="h-4 w-4 text-blue-500" />
                      )}
                      <span className="text-gray-700 dark:text-gray-300">
                        {format(parseISO(exception.original_date), "d MMM yyyy", { locale: es })}
                      </span>
                    </div>
                    <Badge
                      variant={exception.exception_type === 'cancelled' ? 'destructive' : 'default'}
                      className="text-xs"
                    >
                      {exception.exception_type === 'cancelled' ? 'Cancelada' : 'Modificada'}
                    </Badge>
                  </div>
                ))}
                {activeExceptions.length > 3 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    y {activeExceptions.length - 3} más...
                  </p>
                )}
                {isManualEvent && onExceptionsChange && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setExceptionsPanelOpen(true)}
                  >
                    <Edit3 className="h-3 w-3 mr-1" />
                    Gestionar excepciones
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Acciones para eventos manuales */}
      {isManualEvent && (
        <div className="flex flex-wrap gap-2 pt-2 border-t dark:border-gray-800">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit3 className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button variant="outline" size="sm" onClick={onDuplicate}>
            <Copy className="h-4 w-4 mr-1" />
            Duplicar
          </Button>
          {event.status !== 'cancelled' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-orange-600 hover:text-orange-700"
            >
              <Ban className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Eliminar
          </Button>
        </div>
      )}

      {/* Dialog para cancelar ocurrencia */}
      <AlertDialog open={!!cancelOccurrenceDate} onOpenChange={() => setCancelOccurrenceDate(null)}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta ocurrencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se cancelará la ocurrencia del{' '}
              {cancelOccurrenceDate && format(cancelOccurrenceDate, "d 'de' MMMM yyyy", { locale: es })}.
              Las demás ocurrencias del evento recurrente no se verán afectadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelOccurrence} className="bg-red-600 hover:bg-red-700">
              Cancelar ocurrencia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Panel de excepciones */}
      {isManualEvent && onExceptionsChange && (
        <ExceptionsPanel
          eventId={event.id || event.source_id}
          eventTitle={event.title}
          exceptions={exceptions}
          isOpen={exceptionsPanelOpen}
          onClose={() => setExceptionsPanelOpen(false)}
          onExceptionsChange={onExceptionsChange}
        />
      )}
    </div>
  );
}
