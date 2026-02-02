'use client';

import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ExternalLink, GripVertical } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CalendarEvent, SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from './types';

interface DraggableEventBarProps {
  event: CalendarEvent;
  hours: number[];
  cellHeight: number;
  onClick: () => void;
  onResizeEnd?: (eventId: string, newStartAt: Date, newEndAt: Date) => void;
  onResizeStart?: () => void;
  onResizeFinish?: () => void;
  canDrag?: boolean;
}

export function DraggableEventBar({
  event,
  hours,
  cellHeight,
  onClick,
  onResizeEnd,
  onResizeStart,
  onResizeFinish,
  canDrag = true,
}: DraggableEventBarProps) {
  const [isResizing, setIsResizing] = useState(false);

  const isManualEvent = event.source_type === 'calendar_event';
  const canResize = isManualEvent && onResizeEnd;
  const dragEnabled = canDrag && isManualEvent;

  const eventId = event.id || event.source_id;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `event-${eventId}`,
    data: {
      type: 'event',
      event,
    },
    disabled: isResizing || !dragEnabled,
  });

  const startAt = new Date(event.start_at);
  const endAt = event.end_at ? new Date(event.end_at) : new Date(startAt.getTime() + 3600000);
  
  const startHour = startAt.getHours();
  const startMinutes = startAt.getMinutes();
  const endHour = endAt.getHours();
  const endMinutes = endAt.getMinutes();
  
  const firstVisibleHour = hours[0];
  const topOffset = ((startHour - firstVisibleHour) * 60 + startMinutes) * (cellHeight / 60);
  
  const durationMinutes = (endHour * 60 + endMinutes) - (startHour * 60 + startMinutes);
  const height = durationMinutes * (cellHeight / 60);

  const eventColor = event.color || SOURCE_TYPE_COLORS[event.source_type] || '#3B82F6';

  const style = {
    top: topOffset,
    height: Math.max(height - 2, 24),
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : 1,
    cursor: dragEnabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
    zIndex: isDragging ? 100 : 10,
    backgroundColor: eventColor,
  };

  const handleResizeMouseDown = (e: React.MouseEvent, edge: 'top' | 'bottom') => {
    if (!canResize) return;
    
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    onResizeStart?.();

    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const deltaY = upEvent.clientY - startY;
      const deltaMinutes = Math.round(deltaY / (cellHeight / 60) / 15) * 15;
      
      if (deltaMinutes !== 0 && onResizeEnd) {
        const newStartAt = new Date(event.start_at);
        const newEndAt = event.end_at ? new Date(event.end_at) : new Date(startAt.getTime() + 3600000);
        
        if (edge === 'top') {
          newStartAt.setMinutes(newStartAt.getMinutes() + deltaMinutes);
        } else {
          newEndAt.setMinutes(newEndAt.getMinutes() + deltaMinutes);
        }
        
        if (newStartAt < newEndAt && (newEndAt.getTime() - newStartAt.getTime()) >= 15 * 60 * 1000 && eventId) {
          onResizeEnd(eventId, newStartAt, newEndAt);
        }
      }
      
      setIsResizing(false);
      onResizeFinish?.();
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
        'absolute left-1 right-1 rounded-md overflow-hidden transition-shadow group',
        isDragging && 'shadow-lg ring-2 ring-blue-400',
        isResizing && 'ring-2 ring-yellow-400',
        !dragEnabled && 'cursor-pointer'
      )}
      style={style}
      onClick={(e) => {
        if (!isDragging && !isResizing) {
          e.stopPropagation();
          onClick();
        }
      }}
      {...(dragEnabled ? { ...attributes, ...listeners } : {})}
    >
      {/* Top resize handle - solo eventos manuales */}
      {canResize && (
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50 transition-opacity z-20"
          onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
        />
      )}
      
      {/* Content */}
      <div className="p-1.5 h-full flex flex-col overflow-hidden text-white">
        <div className="flex items-start justify-between gap-1">
          <span className="text-xs font-semibold truncate drop-shadow-sm flex-1">
            {event.title}
          </span>
          {dragEnabled && (
            <GripVertical className="h-3 w-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
          )}
          {!isManualEvent && (
            <ExternalLink className="h-3 w-3 opacity-70 flex-shrink-0" />
          )}
        </div>
        
        {height > 35 && (
          <span className="text-[10px] opacity-90 truncate">
            {SOURCE_TYPE_LABELS[event.source_type]}
          </span>
        )}
        
        {height > 50 && (
          <span className="text-[10px] opacity-80">
            {format(startAt, 'HH:mm', { locale: es })}
            {event.end_at && ` - ${format(endAt, 'HH:mm', { locale: es })}`}
          </span>
        )}
        
        {height > 70 && event.location && (
          <span className="text-[10px] opacity-70 truncate">
            📍 {event.location}
          </span>
        )}
      </div>
      
      {/* Bottom resize handle - solo eventos manuales */}
      {canResize && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50 transition-opacity z-20"
          onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
        />
      )}
    </div>
  );
}
