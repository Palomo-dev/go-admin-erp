'use client';

import React, { useMemo } from 'react';
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
import { cn } from '@/utils/Utils';
import { format, isToday, isWeekend } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TapeChartSpace, TapeChartReservation, TapeChartBlock } from '@/lib/services/tapeChartService';
import { DraggableReservationBar } from './DraggableReservationBar';
import { DroppableCell } from './DroppableCell';

interface TapeChartGridProps {
  spaces: TapeChartSpace[];
  reservations: TapeChartReservation[];
  blocks: TapeChartBlock[];
  dates: string[];
  onCellClick?: (spaceId: string, date: string) => void;
  onReservationClick?: (reservationId: string) => void;
  onBlockClick?: (blockId: string) => void;
  onReservationMove?: (reservationId: string, newSpaceId: string, newCheckin: string, newCheckout: string) => void;
  onReservationResize?: (reservationId: string, newCheckin: string, newCheckout: string) => void;
  onCreateReservation?: (spaceId: string, checkin: string, checkout: string) => void;
  isLoading?: boolean;
}

interface SelectionState {
  spaceId: string;
  startDate: string;
  endDate: string;
}

interface CellData {
  type: 'empty' | 'reservation' | 'block';
  data?: TapeChartReservation | TapeChartBlock;
  isStart?: boolean;
  isEnd?: boolean;
  span?: number;
}

export function TapeChartGrid({
  spaces,
  reservations,
  blocks,
  dates,
  onCellClick,
  onReservationClick,
  onBlockClick,
  onReservationMove,
  onReservationResize,
  onCreateReservation,
  isLoading = false,
}: TapeChartGridProps) {
  const cellWidth = 80;
  const rowHeight = 48;
  const labelWidth = 160;

  const [activeReservation, setActiveReservation] = React.useState<TapeChartReservation | null>(null);
  const [selection, setSelection] = React.useState<SelectionState | null>(null);
  const [isSelecting, setIsSelecting] = React.useState(false);

  // Escuchar mouseUp global para cancelar selección si se suelta fuera del grid
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        handleSelectionEnd();
      }
    };
    
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isSelecting, selection]);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'reservation') {
      setActiveReservation(active.data.current.reservation);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveReservation(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'reservation' && overData?.type === 'cell') {
      const reservation = activeData.reservation as TapeChartReservation;
      const targetSpaceId = overData.spaceId as string;
      const targetDate = overData.date as string;

      // Calculate the number of nights
      const checkin = new Date(reservation.checkin);
      const checkout = new Date(reservation.checkout);
      const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

      // Calculate new checkout based on target date
      const newCheckin = targetDate;
      const newCheckoutDate = new Date(targetDate);
      newCheckoutDate.setDate(newCheckoutDate.getDate() + nights);
      const newCheckout = newCheckoutDate.toISOString().split('T')[0];

      onReservationMove?.(reservation.id, targetSpaceId, newCheckin, newCheckout);
    }
  };

  const handleResizeEnd = (reservationId: string, newDate: string, edge: 'start' | 'end') => {
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    if (edge === 'start') {
      onReservationResize?.(reservationId, newDate, reservation.checkout);
    } else {
      // Add one day to the end date since checkout is the day after the last night
      const checkoutDate = new Date(newDate);
      checkoutDate.setDate(checkoutDate.getDate() + 1);
      onReservationResize?.(reservationId, reservation.checkin, checkoutDate.toISOString().split('T')[0]);
    }
  };

  // Handlers para selección de rango (crear nueva reserva arrastrando)
  const handleSelectionStart = (spaceId: string, date: string) => {
    setIsSelecting(true);
    setSelection({ spaceId, startDate: date, endDate: date });
  };

  const handleSelectionMove = (spaceId: string, date: string) => {
    if (!isSelecting || !selection) return;
    // Solo actualizar si es el mismo espacio
    if (selection.spaceId === spaceId) {
      setSelection(prev => prev ? { ...prev, endDate: date } : null);
    }
  };

  const handleSelectionEnd = () => {
    if (selection && isSelecting) {
      const { spaceId, startDate, endDate } = selection;
      // Ordenar las fechas (por si arrastró hacia atrás)
      const dates1 = [startDate, endDate].sort();
      const checkin = dates1[0];
      // El checkout es el día después del último día seleccionado
      const checkoutDate = new Date(dates1[1]);
      checkoutDate.setDate(checkoutDate.getDate() + 1);
      const checkout = checkoutDate.toISOString().split('T')[0];
      
      onCreateReservation?.(spaceId, checkin, checkout);
    }
    setIsSelecting(false);
    setSelection(null);
  };

  // Verificar si una celda está en el rango de selección
  const isCellInSelection = (spaceId: string, date: string): boolean => {
    if (!selection || selection.spaceId !== spaceId) return false;
    const dates1 = [selection.startDate, selection.endDate].sort();
    return date >= dates1[0] && date <= dates1[1];
  };

  const gridData = useMemo(() => {
    const data: Record<string, Record<string, CellData>> = {};

    // Initialize empty grid
    spaces.forEach((space) => {
      data[space.id] = {};
      dates.forEach((date) => {
        data[space.id][date] = { type: 'empty' };
      });
    });

    // Place reservations
    reservations.forEach((reservation) => {
      const checkin = new Date(reservation.checkin);
      const checkout = new Date(reservation.checkout);
      
      dates.forEach((dateStr, index) => {
        const date = new Date(dateStr);
        const inRange = date >= checkin && date < checkout;
        if (inRange) {
          // isStart: true si es el checkin real O si es el primer día visible de la reserva
          const isStart = dateStr === reservation.checkin || 
                          (index === 0 && checkin < date);
          const isEnd = dates[index + 1] === reservation.checkout || 
                        (index === dates.length - 1 && date < checkout);
          
          if (data[reservation.spaceId]) {
            data[reservation.spaceId][dateStr] = {
              type: 'reservation',
              data: reservation,
              isStart,
              isEnd,
            };
          }
        }
      });
    });

    // Place blocks
    blocks.forEach((block) => {
      const from = new Date(block.dateFrom);
      const to = new Date(block.dateTo);
      
      dates.forEach((dateStr, index) => {
        const date = new Date(dateStr);
        if (date >= from && date <= to) {
          const isStart = dateStr === block.dateFrom;
          const isEnd = dates[index + 1] === block.dateTo || 
                        (index === dates.length - 1 && date <= to);
          
          if (data[block.spaceId] && data[block.spaceId][dateStr].type === 'empty') {
            data[block.spaceId][dateStr] = {
              type: 'block',
              data: block,
              isStart,
              isEnd,
            };
          }
        }
      });
    });

    return data;
  }, [spaces, reservations, blocks, dates]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-white dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando calendario...</p>
        </div>
      </div>
    );
  }

  if (spaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-white dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No hay espacios configurados</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-auto bg-white dark:bg-gray-800 tape-chart-grid">
        <div style={{ minWidth: labelWidth + dates.length * cellWidth }}>
          {/* Header */}
          <div className="flex sticky top-0 z-20 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div 
              className="flex-shrink-0 sticky left-0 z-30 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex items-center px-3 font-medium text-sm text-gray-700 dark:text-gray-300"
              style={{ width: labelWidth, height: rowHeight }}
            >
              Espacio
            </div>
            {dates.map((dateStr) => {
              const date = new Date(dateStr + 'T00:00:00');
              const todayCheck = isToday(date);
              const weekend = isWeekend(date);
              
              return (
                <div
                  key={dateStr}
                  className={cn(
                    'flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-200 dark:border-gray-700 text-xs',
                    todayCheck && 'bg-blue-50 dark:bg-blue-950',
                    weekend && !todayCheck && 'bg-gray-100 dark:bg-gray-800'
                  )}
                  style={{ width: cellWidth, height: rowHeight }}
                >
                  <span className={cn(
                    'font-medium',
                    todayCheck ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                  )}>
                    {format(date, 'EEE', { locale: es })}
                  </span>
                  <span className={cn(
                    todayCheck ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  )}>
                    {format(date, 'd MMM', { locale: es })}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {spaces.map((space) => (
            <div 
              key={space.id}
              className="flex border-b border-gray-200 dark:border-gray-700"
            >
              {/* Space label */}
              <div 
                className="flex-shrink-0 sticky left-0 z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex items-center px-3"
                style={{ width: labelWidth, height: rowHeight }}
              >
                <div className="truncate">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {space.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {space.spaceTypeName}
                  </p>
                </div>
              </div>

              {/* Cells */}
              {dates.map((dateStr) => {
                const cellData = gridData[space.id]?.[dateStr] || { type: 'empty' };
                const date = new Date(dateStr + 'T00:00:00');
                const todayCheck = isToday(date);
                const weekend = isWeekend(date);

                return (
                  <DroppableCell
                    key={dateStr}
                    spaceId={space.id}
                    date={dateStr}
                    isToday={todayCheck}
                    isWeekend={weekend}
                    isEmpty={cellData.type === 'empty'}
                    isSelected={isCellInSelection(space.id, dateStr)}
                    onClick={() => onCellClick?.(space.id, dateStr)}
                    onMouseDown={() => cellData.type === 'empty' && handleSelectionStart(space.id, dateStr)}
                    onMouseEnter={() => handleSelectionMove(space.id, dateStr)}
                    onMouseUp={handleSelectionEnd}
                    style={{ width: cellWidth, height: rowHeight }}
                  >
                    {cellData.type === 'reservation' && cellData.isStart && (
                      <DraggableReservationBar 
                        reservation={cellData.data as TapeChartReservation}
                        dates={dates}
                        startDate={dateStr}
                        cellWidth={cellWidth}
                        onClick={() => onReservationClick?.((cellData.data as TapeChartReservation).id)}
                        onResizeEnd={handleResizeEnd}
                      />
                    )}
                    {cellData.type === 'block' && cellData.isStart && (
                      <BlockBar 
                        block={cellData.data as TapeChartBlock}
                        dates={dates}
                        startDate={dateStr}
                        cellWidth={cellWidth}
                        onClick={() => onBlockClick?.((cellData.data as TapeChartBlock).id)}
                      />
                    )}
                  </DroppableCell>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeReservation && (
          <div
            className="rounded-md flex items-center px-2 opacity-90 shadow-lg"
            style={{
              width: 150,
              height: rowHeight - 8,
              backgroundColor: activeReservation.color,
            }}
          >
            <span className="text-white text-xs font-medium truncate">
              {activeReservation.customerName}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function ReservationBar({ 
  reservation, 
  dates, 
  startDate,
  cellWidth 
}: { 
  reservation: TapeChartReservation; 
  dates: string[]; 
  startDate: string;
  cellWidth: number;
}) {
  const checkin = new Date(reservation.checkin);
  const checkout = new Date(reservation.checkout);
  const startIndex = dates.indexOf(startDate);
  
  let span = 0;
  for (let i = startIndex; i < dates.length; i++) {
    const date = new Date(dates[i]);
    if (date >= checkin && date < checkout) {
      span++;
    } else {
      break;
    }
  }

  return (
    <div
      className="absolute top-1 left-1 h-[calc(100%-8px)] rounded-md flex items-center px-2 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10"
      style={{ 
        width: span * cellWidth - 8,
        backgroundColor: reservation.color,
      }}
      title={`${reservation.code} - ${reservation.customerName}`}
    >
      <span className="text-white text-xs font-medium truncate">
        {reservation.customerName}
      </span>
    </div>
  );
}

function BlockBar({ 
  block, 
  dates, 
  startDate,
  cellWidth,
  onClick,
}: { 
  block: TapeChartBlock; 
  dates: string[]; 
  startDate: string;
  cellWidth: number;
  onClick?: () => void;
}) {
  const from = new Date(block.dateFrom);
  const to = new Date(block.dateTo);
  const startIndex = dates.indexOf(startDate);
  
  let span = 0;
  for (let i = startIndex; i < dates.length; i++) {
    const date = new Date(dates[i]);
    if (date >= from && date <= to) {
      span++;
    } else {
      break;
    }
  }

  return (
    <div
      className="absolute top-1 left-1 h-[calc(100%-8px)] rounded-md flex items-center px-2 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 opacity-70"
      style={{ 
        width: span * cellWidth - 8,
        backgroundColor: block.color,
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)',
      }}
      title={block.reason || block.blockType}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <span className="text-white text-xs font-medium truncate">
        {block.reason || block.blockType}
      </span>
    </div>
  );
}
