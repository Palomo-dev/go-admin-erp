'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday, getHours, getMinutes, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { CalendarEvent, SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from './types';
import { DraggableEventBar } from './DraggableEventBar';
import { DroppableSlot } from './DroppableSlot';
import { cn } from '@/utils/Utils';

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onTimeSlotClick: (date: Date) => void;
  onTimeRangeSelect?: (startDate: Date, endDate: Date) => void;
  onEventMove?: (eventId: string, newDate: Date, newHour: number) => Promise<void>;
  onEventResize?: (eventId: string, newStartAt: Date, newEndAt: Date) => Promise<void>;
}

interface TimeSelection {
  dayIndex: number;
  startHour: number;
  endHour: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // px

export function WeekView({ 
  currentDate, 
  events, 
  onEventClick, 
  onTimeSlotClick,
  onTimeRangeSelect,
  onEventMove,
  onEventResize,
}: WeekViewProps) {
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [selection, setSelection] = useState<TimeSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isResizingEvent, setIsResizingEvent] = useState(false);
  
  // Ref para mantener el valor actualizado de selection (evita stale closure)
  const selectionRef = useRef<TimeSelection | null>(null);
  
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => 
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  // Handlers para selección de rango de tiempo
  const handleSelectionStart = useCallback((dayIndex: number, hour: number) => {
    if (isResizingEvent) return;
    setIsSelecting(true);
    const newSelection = { dayIndex, startHour: hour, endHour: hour };
    setSelection(newSelection);
    selectionRef.current = newSelection;
  }, [isResizingEvent]);

  const handleSelectionMove = useCallback((dayIndex: number, hour: number) => {
    if (!isSelecting) return;
    // Solo permitir selección en el mismo día
    setSelection(prev => {
      if (!prev || prev.dayIndex !== dayIndex) return prev;
      const newSelection = { ...prev, endHour: hour };
      selectionRef.current = newSelection;
      return newSelection;
    });
  }, [isSelecting]);

  const handleSelectionEnd = useCallback(() => {
    // Usar selectionRef para obtener el valor más actualizado
    const currentSelection = selectionRef.current;
    if (currentSelection && isSelecting && onTimeRangeSelect) {
      const { dayIndex, startHour, endHour } = currentSelection;
      const minHour = Math.min(startHour, endHour);
      const maxHour = Math.max(startHour, endHour) + 1;

      const day = weekDays[dayIndex];
      const startDate = new Date(day);
      startDate.setHours(minHour, 0, 0, 0);

      const endDate = new Date(day);
      endDate.setHours(maxHour, 0, 0, 0);

      onTimeRangeSelect(startDate, endDate);
    }
    setIsSelecting(false);
    setSelection(null);
    selectionRef.current = null;
  }, [isSelecting, onTimeRangeSelect, weekDays]);

  // Listener global para mouseup
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting && selectionRef.current) {
        handleSelectionEnd();
      }
    };
    
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isSelecting, handleSelectionEnd]);

  const isSlotInSelection = useCallback((dayIndex: number, hour: number): boolean => {
    if (!selection || selection.dayIndex !== dayIndex) return false;
    const minHour = Math.min(selection.startHour, selection.endHour);
    const maxHour = Math.max(selection.startHour, selection.endHour);
    return hour >= minHour && hour <= maxHour;
  }, [selection]);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 10 },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'event') {
      setActiveEvent(active.data.current.event);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveEvent(null);

    if (!over || !onEventMove) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'event' && overData?.type === 'slot') {
      const calendarEvent = activeData.event as CalendarEvent;
      const targetDate = overData.date as string;
      const targetHour = overData.hour as number;
      const eventId = calendarEvent.id || calendarEvent.source_id;

      if (!eventId) {
        console.warn('No se pudo obtener el ID del evento:', calendarEvent);
        return;
      }

      const newDate = new Date(targetDate);
      await onEventMove(eventId, newDate, targetHour);
    }
  };

  const handleResizeEnd = async (eventId: string, newStartAt: Date, newEndAt: Date) => {
    if (onEventResize) {
      await onEventResize(eventId, newStartAt, newEndAt);
    }
  };

  const getEventsForDay = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_at);
      return isSameDay(eventDate, date);
    });
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startDate = new Date(event.start_at);
    const endDate = event.end_at ? new Date(event.end_at) : new Date(startDate.getTime() + 3600000);
    
    const startMinutes = getHours(startDate) * 60 + getMinutes(startDate);
    const duration = differenceInMinutes(endDate, startDate);
    
    return {
      top: (startMinutes / 60) * HOUR_HEIGHT,
      height: Math.max((duration / 60) * HOUR_HEIGHT, 20),
    };
  };

  const allDayEvents = events.filter((e) => e.all_day);
  const timedEvents = events.filter((e) => !e.all_day);

  const hasEventAtSlot = (date: Date, hour: number) => {
    return events.some((e) => {
      if (e.all_day) return false;
      const startAt = new Date(e.start_at);
      const endAt = e.end_at ? new Date(e.end_at) : new Date(startAt.getTime() + 3600000);
      if (!isSameDay(startAt, date)) return false;
      const startHour = startAt.getHours();
      const endHour = endAt.getHours() + (endAt.getMinutes() > 0 ? 1 : 0);
      return hour >= startHour && hour < endHour;
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header con días */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="w-16 flex-shrink-0" />
          {weekDays.map((day, i) => {
            const isTodayDate = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 py-2 px-1 text-center border-r border-gray-200 dark:border-gray-800 last:border-r-0',
                  (i >= 5) && 'bg-gray-50 dark:bg-gray-900/50'
                )}
              >
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                  {format(day, 'EEE', { locale: es })}
                </div>
                <div
                  className={cn(
                    'text-xl font-semibold mt-1',
                    isTodayDate ? 'text-blue-600' : 'text-gray-900 dark:text-white'
                  )}
                >
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Eventos de todo el día */}
        {allDayEvents.length > 0 && (
          <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="w-16 flex-shrink-0 px-2 py-1 text-xs text-gray-500">
              Todo el día
            </div>
            {weekDays.map((day) => {
              const dayAllDayEvents = allDayEvents.filter((e) => isSameDay(new Date(e.start_at), day));
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 p-1 border-r border-gray-200 dark:border-gray-800 last:border-r-0 space-y-1"
                >
                  {dayAllDayEvents.map((event, index) => (
                    <button
                      key={`${event.id || event.source_id}-${index}`}
                      onClick={() => onEventClick(event)}
                      className="w-full text-left px-2 py-1 rounded text-xs truncate"
                      style={{
                        backgroundColor: `${event.color || SOURCE_TYPE_COLORS[event.source_type]}20`,
                        color: event.color || SOURCE_TYPE_COLORS[event.source_type],
                      }}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Grid de horas */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex min-h-full">
            {/* Columna de horas */}
            <div className="w-16 flex-shrink-0">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-[60px] border-b border-gray-100 dark:border-gray-800 pr-2 text-right"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500 -mt-2 block">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Columnas de días */}
            {weekDays.map((day, i) => {
              const dayEvents = getEventsForDay(day).filter((e) => !e.all_day);
              const isWeekend = i >= 5;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'flex-1 relative border-r border-gray-200 dark:border-gray-800 last:border-r-0',
                    isWeekend && 'bg-gray-50/50 dark:bg-gray-900/30'
                  )}
                >
                  {/* Slots de hora con drop zone */}
                  {HOURS.map((hour) => {
                    const isEmpty = !hasEventAtSlot(day, hour);
                    const isSelected = isSlotInSelection(i, hour);
                    return (
                      <div
                        key={hour}
                        className={cn(
                          'h-[60px] border-b border-gray-100 dark:border-gray-800 select-none cursor-pointer transition-colors',
                          isEmpty && !isSelected && 'hover:bg-blue-50 dark:hover:bg-blue-900/20',
                          isSelected && 'bg-blue-200 dark:bg-blue-800/50'
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectionStart(i, hour);
                        }}
                        onMouseEnter={() => {
                          if (isSelecting) handleSelectionMove(i, hour);
                        }}
                        onMouseMove={() => {
                          if (isSelecting) handleSelectionMove(i, hour);
                        }}
                        onMouseUp={() => {
                          // No hacer nada si se está redimensionando
                          if (isResizingEvent) return;
                          
                          if (selection && isSelecting) {
                            handleSelectionEnd();
                          } else if (isEmpty && !isSelecting) {
                            const date = new Date(day);
                            date.setHours(hour, 0, 0, 0);
                            onTimeSlotClick(date);
                          }
                        }}
                      >
                        <DroppableSlot
                          date={day}
                          hour={hour}
                          isToday={isToday(day)}
                          isEmpty={isEmpty}
                          cellHeight={HOUR_HEIGHT}
                          className="w-full h-full pointer-events-none"
                        />
                      </div>
                    );
                  })}

                  {/* Eventos arrastrables */}
                  <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    {dayEvents.map((event, index) => (
                      <div key={`${event.id || event.source_id}-${index}`} style={{ pointerEvents: 'auto' }}>
                        <DraggableEventBar
                          event={event}
                          hours={HOURS}
                          cellHeight={HOUR_HEIGHT}
                          onClick={() => onEventClick(event)}
                          onResizeEnd={handleResizeEnd}
                          onResizeStart={() => setIsResizingEvent(true)}
                          onResizeFinish={() => setTimeout(() => setIsResizingEvent(false), 100)}
                          canDrag={event.source_type === 'calendar_event'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeEvent && (
          <div
            className="p-2 rounded-md shadow-lg opacity-90"
            style={{
              width: 140,
              backgroundColor: activeEvent.color || SOURCE_TYPE_COLORS[activeEvent.source_type],
              color: 'white',
            }}
          >
            <span className="text-xs font-semibold truncate block">
              {activeEvent.title}
            </span>
            <span className="text-[10px] opacity-80 truncate block">
              {SOURCE_TYPE_LABELS[activeEvent.source_type]}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
