'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
import { Card } from '@/components/ui/card';
import { GymClass, getClassTypeLabel, getClassStatusColor } from '@/lib/services/gymService';
import { cn } from '@/utils/Utils';
import { DraggableClassBar } from './DraggableClassBar';
import { DroppableTimeSlot } from './DroppableTimeSlot';
import { Users } from 'lucide-react';

interface WeeklyCalendarProps {
  classes: GymClass[];
  weekStart: Date;
  onClassClick: (gymClass: GymClass) => void;
  onSlotClick?: (date: Date, hour: number) => void;
  onClassMove?: (classId: number, newDate: Date, newStartHour: number) => void;
  onClassResize?: (classId: number, newStartAt: Date, newEndAt: Date) => void;
  onCreateFromSelection?: (date: Date, startHour: number, endHour: number) => void;
}

interface SelectionState {
  date: Date;
  startHour: number;
  endHour: number;
}

export function WeeklyCalendar({ 
  classes, 
  weekStart, 
  onClassClick, 
  onSlotClick,
  onClassMove,
  onClassResize,
  onCreateFromSelection,
}: WeeklyCalendarProps) {
  const cellHeight = 60; // Altura de cada celda de hora
  const labelWidth = 60;

  const [activeClass, setActiveClass] = useState<GymClass | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [weekStart]);

  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6:00 - 21:00

  // Escuchar mouseUp global para finalizar selección
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting && selection) {
        handleSelectionEnd();
      }
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isSelecting, selection]);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 10 },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'class') {
      setActiveClass(active.data.current.gymClass);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveClass(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'class' && overData?.type === 'slot') {
      const gymClass = activeData.gymClass as GymClass;
      const targetDate = overData.date as string;
      const targetHour = overData.hour as number;

      // Crear nueva fecha con la hora destino
      const newDate = new Date(targetDate);
      
      onClassMove?.(gymClass.id, newDate, targetHour);
    }
  };

  const handleResizeEnd = (classId: number, newStartAt: Date, newEndAt: Date) => {
    onClassResize?.(classId, newStartAt, newEndAt);
  };

  // Handlers para selección de rango (crear nueva clase arrastrando)
  const handleSelectionStart = (date: Date, hour: number) => {
    setIsSelecting(true);
    setSelection({ date, startHour: hour, endHour: hour });
  };

  const handleSelectionMove = (date: Date, hour: number) => {
    if (!isSelecting || !selection) return;
    // Solo actualizar si es el mismo día
    if (date.toDateString() === selection.date.toDateString()) {
      setSelection(prev => prev ? { ...prev, endHour: hour } : null);
    }
  };

  const handleSelectionEnd = () => {
    if (selection && isSelecting) {
      const { date, startHour, endHour } = selection;
      // Ordenar las horas (por si arrastró hacia arriba)
      const [minHour, maxHour] = [startHour, endHour].sort((a, b) => a - b);
      
      if (onCreateFromSelection) {
        onCreateFromSelection(date, minHour, maxHour + 1); // +1 porque la hora fin es la siguiente
      } else if (onSlotClick) {
        onSlotClick(date, minHour);
      }
    }
    setIsSelecting(false);
    setSelection(null);
  };

  // Verificar si un slot está en el rango de selección
  const isSlotInSelection = (date: Date, hour: number): boolean => {
    if (!selection || date.toDateString() !== selection.date.toDateString()) return false;
    const [minHour, maxHour] = [selection.startHour, selection.endHour].sort((a, b) => a - b);
    return hour >= minHour && hour <= maxHour;
  };

  // Obtener clases para un día específico
  const getClassesForDay = (date: Date) => {
    return classes.filter((c) => {
      const classDate = new Date(c.start_at);
      return (
        classDate.getDate() === date.getDate() &&
        classDate.getMonth() === date.getMonth() &&
        classDate.getFullYear() === date.getFullYear()
      );
    });
  };

  // Verificar si un slot tiene una clase
  const hasClassAtSlot = (date: Date, hour: number) => {
    return classes.some((c) => {
      const startAt = new Date(c.start_at);
      const endAt = new Date(c.end_at);
      if (
        startAt.getDate() !== date.getDate() ||
        startAt.getMonth() !== date.getMonth() ||
        startAt.getFullYear() !== date.getFullYear()
      ) {
        return false;
      }
      const startHour = startAt.getHours();
      const endHour = endAt.getHours() + (endAt.getMinutes() > 0 ? 1 : 0);
      return hour >= startHour && hour < endHour;
    });
  };

  const formatDayHeader = (date: Date) => {
    const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
    const dayNum = date.getDate();
    return { dayName, dayNum };
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden gym-schedule-grid">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header con días */}
            <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 bg-white dark:bg-gray-800">
              <div 
                className="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700"
                style={{ width: labelWidth }}
              >
                Hora
              </div>
              {days.map((date, i) => {
                const { dayName, dayNum } = formatDayHeader(date);
                return (
                  <div
                    key={i}
                    className={cn(
                      'p-2 text-center bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700',
                      isToday(date) && 'bg-blue-50 dark:bg-blue-900/20'
                    )}
                  >
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                      {dayName}
                    </div>
                    <div
                      className={cn(
                        'text-lg font-semibold',
                        isToday(date)
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {dayNum}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid de horas */}
            <div className="max-h-[600px] overflow-y-auto">
              <div className="grid grid-cols-8">
                {/* Columna de horas */}
                <div className="bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                  {hours.map((hour) => (
                    <div 
                      key={hour} 
                      className="text-xs text-gray-500 dark:text-gray-400 flex items-start justify-center pt-1 border-b border-gray-100 dark:border-gray-700/50"
                      style={{ height: cellHeight }}
                    >
                      {hour.toString().padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* Columnas de días */}
                {days.map((date, dayIndex) => {
                  const dayClasses = getClassesForDay(date);
                  
                  return (
                    <div key={dayIndex} className="relative">
                      {/* Slots de horas */}
                      {hours.map((hour) => {
                        const isEmpty = !hasClassAtSlot(date, hour);
                        const inSelection = isSlotInSelection(date, hour);
                        
                        return (
                          <DroppableTimeSlot
                            key={`${dayIndex}-${hour}`}
                            date={date}
                            hour={hour}
                            isToday={isToday(date)}
                            isEmpty={isEmpty}
                            isSelected={inSelection}
                            cellHeight={cellHeight}
                            onMouseDown={() => isEmpty && handleSelectionStart(date, hour)}
                            onMouseEnter={() => handleSelectionMove(date, hour)}
                            onClick={() => isEmpty && !isSelecting && onSlotClick?.(date, hour)}
                          >
                            {isEmpty && !inSelection && (
                              <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-blue-500 font-medium">+ Agregar</span>
                              </div>
                            )}
                            {inSelection && (
                              <div className="w-full h-full flex items-center justify-center bg-blue-200/50 dark:bg-blue-700/30">
                                <span className="text-[10px] text-blue-600 dark:text-blue-300 font-medium">
                                  {hour === selection?.startHour ? 'Inicio' : hour === selection?.endHour ? 'Fin' : ''}
                                </span>
                              </div>
                            )}
                          </DroppableTimeSlot>
                        );
                      })}

                      {/* Clases del día (posicionadas absolutamente) */}
                      {dayClasses.map((gymClass) => (
                        <DraggableClassBar
                          key={gymClass.id}
                          gymClass={gymClass}
                          hours={hours}
                          cellHeight={cellHeight}
                          onClick={() => onClassClick(gymClass)}
                          onResizeEnd={handleResizeEnd}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeClass && (
          <div
            className={cn(
              'p-2 rounded-md shadow-lg opacity-90',
              getClassStatusColor(activeClass.status)
            )}
            style={{ width: 120 }}
          >
            <span className="text-xs font-semibold text-white truncate block">
              {activeClass.title}
            </span>
            <span className="text-[10px] text-white/80 truncate block">
              {getClassTypeLabel(activeClass.class_type)}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
