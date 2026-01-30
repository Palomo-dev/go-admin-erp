'use client';

import React, { useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/utils/Utils';
import type { TapeChartReservation } from '@/lib/services/tapeChartService';

interface DraggableReservationBarProps {
  reservation: TapeChartReservation;
  dates: string[];
  startDate: string;
  cellWidth: number;
  onClick: () => void;
  onResizeStart?: (reservationId: string, edge: 'start' | 'end') => void;
  onResizeEnd?: (reservationId: string, newDate: string, edge: 'start' | 'end') => void;
}

export function DraggableReservationBar({
  reservation,
  dates,
  startDate,
  cellWidth,
  onClick,
  onResizeStart,
  onResizeEnd,
}: DraggableReservationBarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<'start' | 'end' | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `reservation-${reservation.id}`,
    data: {
      type: 'reservation',
      reservation,
    },
    disabled: isResizing,
  });

  const checkin = new Date(reservation.checkin);
  const checkout = new Date(reservation.checkout);
  const startIndex = dates.indexOf(startDate);
  
  // Calcular el span contando días desde startDate hasta checkout (o fin del rango visible)
  let span = 0;
  for (let i = startIndex; i < dates.length; i++) {
    const date = new Date(dates[i]);
    // La reserva está activa si: la fecha está entre checkin y checkout (exclusivo)
    // Para reservas que empiezan antes del rango visible, usamos el primer día visible
    const effectiveCheckin = checkin < new Date(dates[0]) ? new Date(dates[0]) : checkin;
    if (date >= effectiveCheckin && date < checkout) {
      span++;
    } else if (date >= checkout) {
      break;
    }
  }

  const style = {
    width: span * cellWidth - 8,
    backgroundColor: reservation.color,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.8 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 100 : 10,
  };

  const handleResizeMouseDown = (e: React.MouseEvent, edge: 'start' | 'end') => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeEdge(edge);
    onResizeStart?.(reservation.id, edge);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Calculate new date based on mouse position
      const rect = (e.target as HTMLElement).closest('.tape-chart-grid')?.getBoundingClientRect();
      if (!rect) return;
      
      const relativeX = moveEvent.clientX - rect.left - 160; // 160 = label width
      const dateIndex = Math.floor(relativeX / cellWidth);
      
      if (dateIndex >= 0 && dateIndex < dates.length) {
        // Preview resize
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const rect = (e.target as HTMLElement).closest('.tape-chart-grid')?.getBoundingClientRect();
      if (rect) {
        const relativeX = upEvent.clientX - rect.left - 160;
        const dateIndex = Math.floor(relativeX / cellWidth);
        
        if (dateIndex >= 0 && dateIndex < dates.length) {
          onResizeEnd?.(reservation.id, dates[dateIndex], edge);
        }
      }
      
      setIsResizing(false);
      setResizeEdge(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute top-1 left-1 h-[calc(100%-8px)] rounded-md flex items-center overflow-hidden transition-shadow',
        isDragging && 'shadow-lg ring-2 ring-blue-400',
        'group'
      )}
      style={style}
      onClick={(e) => {
        if (!isDragging && !isResizing) {
          e.stopPropagation();
          onClick();
        }
      }}
      {...attributes}
      {...listeners}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50 transition-opacity"
        onMouseDown={(e) => handleResizeMouseDown(e, 'start')}
      />
      
      {/* Content */}
      <div className="flex-1 px-2 truncate">
        <span className="text-white text-xs font-medium truncate">
          {reservation.customerName}
        </span>
      </div>
      
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50 transition-opacity"
        onMouseDown={(e) => handleResizeMouseDown(e, 'end')}
      />
    </div>
  );
}
