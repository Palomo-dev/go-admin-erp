'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, LogIn, LogOut, Ban, Wrench } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'arrival' | 'departure' | 'block' | 'maintenance';
  spaceLabel?: string;
}

interface MiniCalendarProps {
  events: CalendarEvent[];
  isLoading?: boolean;
}

const eventTypeConfig = {
  arrival: {
    icon: LogIn,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Llegada',
  },
  departure: {
    icon: LogOut,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Salida',
  },
  block: {
    icon: Ban,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Bloqueo',
  },
  maintenance: {
    icon: Wrench,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Mantenimiento',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.getTime() === today.getTime()) {
    return 'Hoy';
  } else if (date.getTime() === tomorrow.getTime()) {
    return 'Mañana';
  }
  
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function EventItem({ event }: { event: CalendarEvent }) {
  const config = eventTypeConfig[event.type];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn('p-1.5 rounded', config.bgColor)}>
        <Icon className={cn('h-3.5 w-3.5', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {event.title}
        </p>
        {event.spaceLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {event.spaceLabel}
          </p>
        )}
      </div>
      <Badge variant="outline" className="text-xs flex-shrink-0">
        {formatDate(event.date)}
      </Badge>
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 animate-pulse">
      <div className="h-7 w-7 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="flex-1 space-y-1">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export function MiniCalendar({ events, isLoading = false }: MiniCalendarProps) {
  const groupedEvents = events.reduce((acc, event) => {
    const date = event.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const sortedDates = Object.keys(groupedEvents).sort();

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Calendar className="h-5 w-5 text-blue-600" />
          Esta Semana
          {events.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {events.length} eventos
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            <EventSkeleton />
            <EventSkeleton />
            <EventSkeleton />
            <EventSkeleton />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay eventos esta semana
            </p>
          </div>
        ) : (
          <div className="space-y-1 divide-y divide-gray-100 dark:divide-gray-700">
            {events.slice(0, 10).map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
