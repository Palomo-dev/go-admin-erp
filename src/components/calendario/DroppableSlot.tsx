'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/utils/Utils';

interface DroppableSlotProps {
  date: Date;
  hour: number;
  isToday: boolean;
  isEmpty: boolean;
  isSelected?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  className?: string;
  cellHeight: number;
}

export function DroppableSlot({
  date,
  hour,
  isToday,
  isEmpty,
  isSelected = false,
  children,
  onClick,
  onMouseDown,
  onMouseEnter,
  className,
  cellHeight,
}: DroppableSlotProps) {
  const dateStr = date.toISOString().split('T')[0];
  const slotId = `slot-${dateStr}-${hour}`;

  const { isOver, setNodeRef } = useDroppable({
    id: slotId,
    data: {
      type: 'slot',
      date: dateStr,
      hour,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative border-b border-gray-100 dark:border-gray-800 select-none transition-colors',
        isToday && 'bg-blue-50/30 dark:bg-blue-900/10',
        isEmpty && 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20',
        isOver && 'bg-blue-100 dark:bg-blue-800/50 ring-2 ring-blue-400 ring-inset',
        isSelected && 'bg-green-100 dark:bg-green-800/30',
        className
      )}
      style={{ height: cellHeight }}
      onClick={isEmpty ? onClick : undefined}
      onMouseDown={isEmpty ? onMouseDown : undefined}
      onMouseEnter={onMouseEnter}
    >
      {children}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-white/80 dark:bg-gray-900/80 px-2 py-0.5 rounded">
            Soltar aquí
          </span>
        </div>
      )}
    </div>
  );
}
