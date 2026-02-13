'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, MapPin, User, ExternalLink } from 'lucide-react';
import { CalendarEvent, SOURCE_TYPE_LABELS, SOURCE_TYPE_COLORS } from './types';
import { cn } from '@/utils/Utils';

interface EventCardProps {
  event: CalendarEvent;
  variant?: 'compact' | 'full';
  onClick?: (event: CalendarEvent) => void;
}

export function EventCard({ event, variant = 'compact', onClick }: EventCardProps) {
  const eventColor = event.color || SOURCE_TYPE_COLORS[event.source_type] || '#3B82F6';
  const isManual = event.source_type === 'calendar_event';

  if (variant === 'compact') {
    return (
      <button
        onClick={() => onClick?.(event)}
        className={cn(
          'w-full text-left px-2 py-1 rounded text-xs truncate transition-opacity hover:opacity-80',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'
        )}
        style={{ 
          backgroundColor: `${eventColor}20`,
          borderLeft: `3px solid ${eventColor}`,
          color: eventColor,
        }}
        title={event.title}
      >
        {!event.all_day && (
          <span className="font-medium mr-1">
            {format(new Date(event.start_at), 'HH:mm')}
          </span>
        )}
        {event.title}
      </button>
    );
  }

  return (
    <div
      onClick={() => onClick?.(event)}
      className={cn(
        'p-3 rounded-lg cursor-pointer transition-all hover:shadow-md',
        'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
      )}
      style={{ borderLeftColor: eventColor, borderLeftWidth: '4px' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white truncate">
            {event.title}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {SOURCE_TYPE_LABELS[event.source_type]}
          </p>
        </div>
        {!isManual && (
          <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
        )}
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          {event.all_day ? (
            'Todo el día'
          ) : (
            <>
              {format(new Date(event.start_at), 'HH:mm', { locale: es })}
              {event.end_at && ` - ${format(new Date(event.end_at), 'HH:mm', { locale: es })}`}
            </>
          )}
        </div>

        {event.location && (
          <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
            <MapPin className="h-3.5 w-3.5 mr-1.5" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {event.assigned_to && (
          <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
            <User className="h-3.5 w-3.5 mr-1.5" />
            <span className="truncate">Asignado</span>
          </div>
        )}
      </div>

      {event.status && event.status !== 'confirmed' && (
        <div className="mt-2">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
              event.status === 'cancelled' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              event.status === 'tentative' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
              event.status === 'pending' && 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
              event.status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            )}
          >
            {event.status === 'cancelled' && 'Cancelado'}
            {event.status === 'tentative' && 'Tentativo'}
            {event.status === 'pending' && 'Pendiente'}
            {event.status === 'completed' && 'Completado'}
          </span>
        </div>
      )}
    </div>
  );
}
