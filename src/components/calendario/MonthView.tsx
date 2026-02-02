'use client';

import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarEvent } from './types';
import { EventCard } from './EventCard';
import { cn } from '@/utils/Utils';

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

export function MonthView({ currentDate, events, onEventClick, onDateClick }: MonthViewProps) {
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const weeksArray: Date[][] = [];
    let currentWeek: Date[] = [];
    let day = calendarStart;

    while (day <= calendarEnd) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeksArray.push(currentWeek);
        currentWeek = [];
      }
      day = addDays(day, 1);
    }

    return weeksArray;
  }, [currentDate]);

  const getEventsForDay = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_at);
      return isSameDay(eventDate, date);
    });
  };

  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header con días de la semana */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              'py-2 px-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase',
              (i === 5 || i === 6) && 'bg-gray-50 dark:bg-gray-900/50'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="flex-1 grid grid-rows-6 overflow-hidden">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800 min-h-0">
            {week.map((day, dayIndex) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isWeekend = dayIndex >= 5;
              const isTodayDate = isToday(day);
              const maxVisibleEvents = 3;
              const hasMore = dayEvents.length > maxVisibleEvents;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => onDateClick(day)}
                  className={cn(
                    'flex flex-col border-r border-gray-200 dark:border-gray-800 last:border-r-0 cursor-pointer overflow-hidden transition-colors',
                    !isCurrentMonth && 'bg-gray-50 dark:bg-gray-900/50',
                    isWeekend && 'bg-gray-50/50 dark:bg-gray-900/30',
                    'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  )}
                >
                  {/* Número del día */}
                  <div className="p-1 flex-shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-7 h-7 text-sm rounded-full',
                        isTodayDate && 'bg-blue-600 text-white font-semibold',
                        !isTodayDate && isCurrentMonth && 'text-gray-900 dark:text-white',
                        !isTodayDate && !isCurrentMonth && 'text-gray-400 dark:text-gray-600'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Eventos del día */}
                  <div className="flex-1 px-1 pb-1 space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, maxVisibleEvents).map((event, eventIndex) => (
                      <EventCard
                        key={`${event.id}-${eventIndex}`}
                        event={event}
                        variant="compact"
                        onClick={(e) => {
                          e.stopPropagation?.();
                          onEventClick(event);
                        }}
                      />
                    ))}
                    {hasMore && (
                      <button
                        key={`more-${day.toISOString()}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDateClick(day);
                        }}
                        className="w-full text-left px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        +{dayEvents.length - maxVisibleEvents} más
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
