'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { format, getHours, getMinutes, differenceInMinutes, isToday, isSameDay } from 'date-fns';
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
import { EventCard } from './EventCard';
import { DraggableEventBar } from './DraggableEventBar';
import { DroppableSlot } from './DroppableSlot';
import { cn } from '@/utils/Utils';

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onTimeSlotClick: (date: Date) => void;
  onTimeRangeSelect?: (startDate: Date, endDate: Date) => void;
  onEventMove?: (eventId: string, newDate: Date, newHour: number) => Promise<void>;
  onEventResize?: (eventId: string, newStartAt: Date, newEndAt: Date) => Promise<void>;
}

interface TimeSelection {
  startHour: number;
  endHour: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 80; // px - más alto para vista de día

export function DayView({ 
  currentDate, 
  events, 
  onEventClick, 
  onTimeSlotClick,
  onTimeRangeSelect,
  onEventMove,
  onEventResize,
}: DayViewProps) {
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [selection, setSelection] = useState<TimeSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isResizingEvent, setIsResizingEvent] = useState(false);
  
  // Ref para mantener el valor actualizado de selection (evita stale closure)
  const selectionRef = useRef<TimeSelection | null>(null);
  
  const allDayEvents = useMemo(() => events.filter((e) => e.all_day), [events]);
  const timedEvents = useMemo(() => events.filter((e) => !e.all_day), [events]);

  // Handlers para selección de rango de tiempo
  const handleSelectionStart = useCallback((hour: number) => {
    // No iniciar selección si se está redimensionando
    if (isResizingEvent) return;
    setIsSelecting(true);
    const newSelection = { startHour: hour, endHour: hour };
    setSelection(newSelection);
    selectionRef.current = newSelection;
  }, [isResizingEvent]);

  const handleSelectionMove = useCallback((hour: number) => {
    if (!isSelecting) return;
    setSelection(prev => {
      if (!prev) return null;
      const newSelection = { ...prev, endHour: hour };
      selectionRef.current = newSelection;
      return newSelection;
    });
  }, [isSelecting]);

  const handleSelectionEnd = useCallback(() => {
    // Usar selectionRef para obtener el valor más actualizado
    const currentSelection = selectionRef.current;
    if (currentSelection && isSelecting && onTimeRangeSelect) {
      const { startHour, endHour } = currentSelection;
      const minHour = Math.min(startHour, endHour);
      const maxHour = Math.max(startHour, endHour) + 1;

      const startDate = new Date(currentDate);
      startDate.setHours(minHour, 0, 0, 0);

      const endDate = new Date(currentDate);
      endDate.setHours(maxHour, 0, 0, 0);

      onTimeRangeSelect(startDate, endDate);
    }
    setIsSelecting(false);
    setSelection(null);
    selectionRef.current = null;
  }, [isSelecting, onTimeRangeSelect, currentDate]);

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

  const isHourInSelection = useCallback((hour: number): boolean => {
    if (!selection) return false;
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

  const hasEventAtSlot = (hour: number) => {
    return timedEvents.some((e) => {
      const startAt = new Date(e.start_at);
      const endAt = e.end_at ? new Date(e.end_at) : new Date(startAt.getTime() + 3600000);
      const startHour = startAt.getHours();
      const endHour = endAt.getHours() + (endAt.getMinutes() > 0 ? 1 : 0);
      return hour >= startHour && hour < endHour;
    });
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startDate = new Date(event.start_at);
    const endDate = event.end_at ? new Date(event.end_at) : new Date(startDate.getTime() + 3600000);
    
    const startMinutes = getHours(startDate) * 60 + getMinutes(startDate);
    const duration = differenceInMinutes(endDate, startDate);
    
    return {
      top: (startMinutes / 60) * HOUR_HEIGHT,
      height: Math.max((duration / 60) * HOUR_HEIGHT, 30),
    };
  };

  const isTodayDate = isToday(currentDate);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo - Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800">
          {/* Header del día */}
          <div className={cn(
            'p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0',
            isTodayDate && 'bg-blue-50 dark:bg-blue-900/20'
          )}>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-3xl font-bold',
                  isTodayDate ? 'text-blue-600' : 'text-gray-900 dark:text-white'
                )}
              >
                {format(currentDate, 'd')}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {format(currentDate, 'EEEE', { locale: es })}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {format(currentDate, "MMMM yyyy", { locale: es })}
                </div>
              </div>
            </div>
          </div>

          {/* Eventos de todo el día */}
          {allDayEvents.length > 0 && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Todo el día</div>
              <div className="space-y-1">
                {allDayEvents.map((event) => (
                  <EventCard
                    key={event.id || event.source_id}
                    event={event}
                    variant="compact"
                    onClick={onEventClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Grid de horas con drag & drop */}
          <div className="flex-1 overflow-y-auto">
            <div className="relative min-h-full">
              {/* Líneas de hora con drop zones */}
              {HOURS.map((hour) => {
                const isEmpty = !hasEventAtSlot(hour);
                const isSelected = isHourInSelection(hour);
                return (
                  <div
                    key={hour}
                    className={cn(
                      'flex border-b border-gray-100 dark:border-gray-800 select-none',
                      isSelected && 'bg-blue-100 dark:bg-blue-900/40'
                    )}
                    style={{ height: HOUR_HEIGHT }}
                  >
                    <div className="w-16 flex-shrink-0 pr-2 text-right pt-0">
                      <span className="text-xs text-gray-400 dark:text-gray-500 -mt-2 block">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                    </div>
                    <div
                      className={cn(
                        'flex-1 cursor-pointer transition-colors',
                        isEmpty && !isSelected && 'hover:bg-blue-50 dark:hover:bg-blue-900/20',
                        isSelected && 'bg-blue-200 dark:bg-blue-800/50'
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectionStart(hour);
                      }}
                      onMouseEnter={() => {
                        if (isSelecting) {
                          handleSelectionMove(hour);
                        }
                      }}
                      onMouseMove={() => {
                        if (isSelecting) {
                          handleSelectionMove(hour);
                        }
                      }}
                      onMouseUp={() => {
                        // No hacer nada si se está redimensionando
                        if (isResizingEvent) return;
                        
                        if (selection && isSelecting) {
                          handleSelectionEnd();
                        } else if (isEmpty && !isSelecting) {
                          const date = new Date(currentDate);
                          date.setHours(hour, 0, 0, 0);
                          onTimeSlotClick(date);
                        }
                      }}
                    >
                      <DroppableSlot
                        date={currentDate}
                        hour={hour}
                        isToday={isTodayDate}
                        isEmpty={isEmpty}
                        cellHeight={HOUR_HEIGHT}
                        className="w-full h-full pointer-events-none"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Eventos arrastrables */}
              <div className="absolute inset-0 left-16" style={{ pointerEvents: 'none' }}>
                {timedEvents.map((event, index) => (
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
          </div>
        </div>

        {/* Panel derecho - Lista de eventos */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden hidden lg:flex">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Eventos del día
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {events.length} evento{events.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {events.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No hay eventos</p>
                <p className="text-sm mt-1">Haz clic en una hora para crear uno</p>
              </div>
            ) : (
              events
                .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                .map((event, index) => (
                  <EventCard
                    key={`${event.id || event.source_id}-${index}`}
                    event={event}
                    variant="full"
                    onClick={onEventClick}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeEvent && (
          <div
            className="p-2 rounded-md shadow-lg opacity-90"
            style={{
              width: 160,
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
