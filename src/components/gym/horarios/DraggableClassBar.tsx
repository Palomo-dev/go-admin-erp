'use client';

import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/utils/Utils';
import { GymClass, getClassTypeLabel, getClassStatusColor } from '@/lib/services/gymService';
import { Users } from 'lucide-react';

interface DraggableClassBarProps {
  gymClass: GymClass;
  hours: number[];
  cellHeight: number;
  onClick: () => void;
  onResizeEnd?: (classId: number, newStartAt: Date, newEndAt: Date) => void;
}

export function DraggableClassBar({
  gymClass,
  hours,
  cellHeight,
  onClick,
  onResizeEnd,
}: DraggableClassBarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<'top' | 'bottom' | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `class-${gymClass.id}`,
    data: {
      type: 'class',
      gymClass,
    },
    disabled: isResizing,
  });

  const startAt = new Date(gymClass.start_at);
  const endAt = new Date(gymClass.end_at);
  
  // Calcular posición y altura basada en horas
  const startHour = startAt.getHours();
  const startMinutes = startAt.getMinutes();
  const endHour = endAt.getHours();
  const endMinutes = endAt.getMinutes();
  
  // Posición desde el inicio del primer slot visible
  const firstVisibleHour = hours[0];
  const topOffset = ((startHour - firstVisibleHour) * 60 + startMinutes) * (cellHeight / 60);
  
  // Duración en minutos
  const durationMinutes = (endHour * 60 + endMinutes) - (startHour * 60 + startMinutes);
  const height = durationMinutes * (cellHeight / 60);

  const style = {
    top: topOffset,
    height: Math.max(height - 4, 20), // Mínimo 20px
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 100 : 10,
  };

  const handleResizeMouseDown = (e: React.MouseEvent, edge: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeEdge(edge);

    const startY = e.clientY;
    const initialTop = topOffset;
    const initialHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = moveEvent.clientY - startY;
      
      // Calcular nuevos minutos basados en el movimiento
      const deltaMinutes = Math.round(deltaY / (cellHeight / 60) / 15) * 15; // Snap a 15 min
      
      if (edge === 'top') {
        // Mover el inicio (hacia arriba = más temprano)
        const newStartMinutes = (startHour - firstVisibleHour) * 60 + startMinutes + deltaMinutes;
        // Preview visual podría ir aquí
      } else {
        // Mover el fin (hacia abajo = más tarde)
        const newEndMinutes = durationMinutes + deltaMinutes;
        // Preview visual podría ir aquí
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const deltaY = upEvent.clientY - startY;
      const deltaMinutes = Math.round(deltaY / (cellHeight / 60) / 15) * 15; // Snap a 15 min
      
      if (deltaMinutes !== 0 && onResizeEnd) {
        const newStartAt = new Date(gymClass.start_at);
        const newEndAt = new Date(gymClass.end_at);
        
        if (edge === 'top') {
          newStartAt.setMinutes(newStartAt.getMinutes() + deltaMinutes);
        } else {
          newEndAt.setMinutes(newEndAt.getMinutes() + deltaMinutes);
        }
        
        // Validar que start < end y duración mínima de 15 min
        if (newStartAt < newEndAt && (newEndAt.getTime() - newStartAt.getTime()) >= 15 * 60 * 1000) {
          onResizeEnd(gymClass.id, newStartAt, newEndAt);
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

  const statusColor = getClassStatusColor(gymClass.status);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute left-1 right-1 rounded-md overflow-hidden transition-shadow group',
        statusColor,
        isDragging && 'shadow-lg ring-2 ring-blue-400',
        isResizing && 'ring-2 ring-yellow-400'
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
      {/* Top resize handle */}
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50 transition-opacity z-20"
        onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
      />
      
      {/* Content */}
      <div className="p-1 h-full flex flex-col overflow-hidden">
        <span className="text-xs font-semibold truncate text-white drop-shadow-sm">
          {gymClass.title}
        </span>
        {height > 40 && (
          <span className="text-[10px] opacity-90 truncate text-white">
            {getClassTypeLabel(gymClass.class_type)}
          </span>
        )}
        {height > 60 && (
          <div className="flex items-center gap-1 text-[10px] opacity-80 text-white">
            <Users className="h-3 w-3" />
            <span>{gymClass.capacity}</span>
          </div>
        )}
        {height > 80 && (
          <span className="text-[10px] opacity-70 text-white">
            {startAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} - 
            {endAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      
      {/* Bottom resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50 transition-opacity z-20"
        onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
      />
    </div>
  );
}
