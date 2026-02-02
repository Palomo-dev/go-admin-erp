'use client';

import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Clock,
  Repeat,
  AlertCircle,
  MapPin,
  User,
  Building2,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
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
import { cn } from '@/utils/Utils';
import { RecurringEvent } from './useRecurringEvents';

interface RecurringEventCardProps {
  event: RecurringEvent;
  onView: (event: RecurringEvent) => void;
  onEdit: (event: RecurringEvent) => void;
  onDelete: (event: RecurringEvent) => void;
  onManageExceptions: (event: RecurringEvent) => void;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  tentative: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  tentative: 'Tentativo',
  cancelled: 'Cancelado',
  pending: 'Pendiente',
};

function parseRecurrenceRule(rrule: string): string {
  if (!rrule) return 'Sin recurrencia';

  const parts = rrule.split(';').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const freq = parts['FREQ'];
  const interval = parseInt(parts['INTERVAL'] || '1');
  const byDay = parts['BYDAY'];

  let text = '';

  switch (freq) {
    case 'DAILY':
      text = interval === 1 ? 'Diario' : `Cada ${interval} días`;
      break;
    case 'WEEKLY':
      text = interval === 1 ? 'Semanal' : `Cada ${interval} semanas`;
      if (byDay) {
        const days: Record<string, string> = {
          MO: 'Lun', TU: 'Mar', WE: 'Mié', TH: 'Jue', FR: 'Vie', SA: 'Sáb', SU: 'Dom'
        };
        const selectedDays = byDay.split(',').map(d => days[d] || d).join(', ');
        text += ` (${selectedDays})`;
      }
      break;
    case 'MONTHLY':
      text = interval === 1 ? 'Mensual' : `Cada ${interval} meses`;
      break;
    case 'YEARLY':
      text = interval === 1 ? 'Anual' : `Cada ${interval} años`;
      break;
    default:
      text = 'Recurrente';
  }

  if (parts['COUNT']) {
    text += ` (${parts['COUNT']} veces)`;
  } else if (parts['UNTIL']) {
    const untilDate = parts['UNTIL'].substring(0, 8);
    const year = untilDate.substring(0, 4);
    const month = untilDate.substring(4, 6);
    const day = untilDate.substring(6, 8);
    text += ` hasta ${day}/${month}/${year}`;
  }

  return text;
}

export function RecurringEventCard({
  event,
  onView,
  onEdit,
  onDelete,
  onManageExceptions,
}: RecurringEventCardProps) {
  const eventColor = event.color || '#3B82F6';
  const startDate = parseISO(event.start_at);
  const endDate = parseISO(event.end_at);

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700',
        'hover:shadow-md transition-shadow p-4'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Indicador de color */}
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0"
          style={{ backgroundColor: eventColor }}
        />

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white truncate">
                {event.title}
              </h3>
              {event.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                  {event.description}
                </p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onView(event)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver detalles
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(event)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar serie
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onManageExceptions(event)}>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Gestionar excepciones
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(event)}
                  className="text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar serie
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Información del evento */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {/* Fecha y hora */}
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <CalendarIcon className="h-4 w-4 text-blue-500" />
              <span>{format(startDate, "d MMM yyyy", { locale: es })}</span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4 text-blue-500" />
              <span>
                {event.all_day
                  ? 'Todo el día'
                  : `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`}
              </span>
            </div>

            {/* Recurrencia */}
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Repeat className="h-4 w-4 text-purple-500" />
              <span className="truncate">
                {parseRecurrenceRule(event.recurrence_rule)}
              </span>
            </div>

            {/* Excepciones */}
            <div className="flex items-center gap-1.5">
              <AlertCircle className={cn(
                'h-4 w-4',
                (event.exceptions_count || 0) > 0 ? 'text-orange-500' : 'text-gray-400'
              )} />
              <span className={cn(
                (event.exceptions_count || 0) > 0
                  ? 'text-orange-600 dark:text-orange-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400'
              )}>
                {event.exceptions_count || 0} {(event.exceptions_count || 0) === 1 ? 'excepción' : 'excepciones'}
              </span>
            </div>
          </div>

          {/* Tags adicionales */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Estado */}
            {event.status && (
              <Badge className={cn('text-xs', STATUS_COLORS[event.status] || STATUS_COLORS.pending)}>
                {STATUS_LABELS[event.status] || event.status}
              </Badge>
            )}

            {/* Ubicación */}
            {event.location && (
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[120px]">{event.location}</span>
              </div>
            )}

            {/* Usuario asignado */}
            {event.assigned_user && (
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <User className="h-3 w-3" />
                <span>
                  {event.assigned_user.first_name} {event.assigned_user.last_name}
                </span>
              </div>
            )}

            {/* Sucursal */}
            {event.branch && (
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Building2 className="h-3 w-3" />
                <span>{event.branch.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
