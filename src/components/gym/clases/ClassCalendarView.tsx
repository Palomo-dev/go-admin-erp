'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Users,
} from 'lucide-react';
import { GymClass, getClassTypeLabel, getClassStatusColor } from '@/lib/services/gymService';
import { cn } from '@/utils/Utils';
import { DraggableClassBar } from '@/components/gym/horarios/DraggableClassBar';
import { DroppableTimeSlot } from '@/components/gym/horarios/DroppableTimeSlot';

interface ClassCalendarViewProps {
  classes: GymClass[];
  onSelectClass: (gymClass: GymClass) => void;
  onNewClass: (date: Date) => void;
  onClassMove?: (classId: number, newDate: Date, newStartHour: number) => void;
  onClassResize?: (classId: number, newStartAt: Date, newEndAt: Date) => void;
  onCreateFromSelection?: (date: Date, startHour: number, endHour: number) => void;
}

interface SelectionState {
  date: Date;
  startHour: number;
  endHour: number;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6:00 - 21:00
const CELL_HEIGHT = 60;

export function ClassCalendarView({ 
  classes, 
  onSelectClass, 
  onNewClass,
  onClassMove,
  onClassResize,
  onCreateFromSelection,
}: ClassCalendarViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const newDate = new Date(today);
    newDate.setDate(diff);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  });

  const [activeClass, setActiveClass] = useState<GymClass | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      return date;
    });
  }, [currentWeekStart]);

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

  // Sensores para drag & drop
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

    if (!over || !onClassMove) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'class' && overData?.type === 'slot') {
      const gymClass = activeData.gymClass as GymClass;
      const targetDate = overData.date as string;
      const targetHour = overData.hour as number;
      const newDate = new Date(targetDate);
      onClassMove(gymClass.id, newDate, targetHour);
    }
  };

  const handleResizeEnd = (classId: number, newStartAt: Date, newEndAt: Date) => {
    onClassResize?.(classId, newStartAt, newEndAt);
  };

  // Handlers para selección de rango
  const handleSelectionStart = (date: Date, hour: number) => {
    setIsSelecting(true);
    setSelection({ date, startHour: hour, endHour: hour });
  };

  const handleSelectionMove = (date: Date, hour: number) => {
    if (!isSelecting || !selection) return;
    if (date.toDateString() === selection.date.toDateString()) {
      setSelection(prev => prev ? { ...prev, endHour: hour } : null);
    }
  };

  const handleSelectionEnd = () => {
    if (selection && isSelecting) {
      const { date, startHour, endHour } = selection;
      const [minHour, maxHour] = [startHour, endHour].sort((a, b) => a - b);
      
      if (onCreateFromSelection) {
        onCreateFromSelection(date, minHour, maxHour + 1);
      } else {
        const newDate = new Date(date);
        newDate.setHours(minHour, 0, 0, 0);
        onNewClass(newDate);
      }
    }
    setIsSelecting(false);
    setSelection(null);
  };

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

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const newDate = new Date(today);
    newDate.setDate(diff);
    newDate.setHours(0, 0, 0, 0);
    setCurrentWeekStart(newDate);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const formatMonthYear = () => {
    const firstDay = weekDays[0];
    const lastDay = weekDays[6];
    
    if (firstDay.getMonth() === lastDay.getMonth()) {
      return firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }
    
    return `${firstDay.toLocaleDateString('es-ES', { month: 'short' })} - ${lastDay.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;
  };

  const formatDayHeader = (date: Date) => {
    const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
    const dayNum = date.getDate();
    return { dayName, dayNum };
  };

  const handleSlotClick = (date: Date, hour: number) => {
    const newDate = new Date(date);
    newDate.setHours(hour, 0, 0, 0);
    onNewClass(newDate);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
        <CardContent className="p-4">
          {/* Header con navegación */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                {formatMonthYear()}
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoy
              </Button>
              <Button variant="ghost" size="icon" onClick={goToPreviousWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={goToNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Instrucciones */}
          <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            💡 Arrastra clases para moverlas • Selecciona varias horas arrastrando para crear una clase
          </div>

          {/* Calendario */}
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header de días */}
              <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 bg-white dark:bg-gray-800">
                <div 
                  className="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700"
                  style={{ width: 60 }}
                >
                  Hora
                </div>
                {weekDays.map((date, i) => {
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
                    {HOURS.map((hour) => (
                      <div 
                        key={hour} 
                        className="text-xs text-gray-500 dark:text-gray-400 flex items-start justify-center pt-1 border-b border-gray-100 dark:border-gray-700/50"
                        style={{ height: CELL_HEIGHT }}
                      >
                        {hour.toString().padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Columnas de días */}
                  {weekDays.map((date, dayIndex) => {
                    const dayClasses = getClassesForDay(date);
                    
                    return (
                      <div key={dayIndex} className="relative">
                        {/* Slots de horas */}
                        {HOURS.map((hour) => {
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
                              cellHeight={CELL_HEIGHT}
                              onMouseDown={() => isEmpty && handleSelectionStart(date, hour)}
                              onMouseEnter={() => handleSelectionMove(date, hour)}
                              onClick={() => isEmpty && !isSelecting && handleSlotClick(date, hour)}
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
                            hours={HOURS}
                            cellHeight={CELL_HEIGHT}
                            onClick={() => onSelectClass(gymClass)}
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

          {/* Leyenda */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">Estados:</span>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Programada
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                En Curso
              </Badge>
              <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                Completada
              </Badge>
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                Cancelada
              </Badge>
            </div>
          </div>
        </CardContent>
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
