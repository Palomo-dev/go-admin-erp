'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/utils/Utils';

interface DroppableTimeSlotProps {
  date: Date;
  hour: number;
  isToday: boolean;
  isEmpty: boolean;
  isSelected?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onMouseUp?: () => void;
  className?: string;
  style?: React.CSSProperties;
  cellHeight: number;
}

export function DroppableTimeSlot({
  date,
  hour,
  isToday,
  isEmpty,
  isSelected = false,
  children,
  onClick,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  className,
  style,
  cellHeight,
}: DroppableTimeSlotProps) {
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
        'relative border-b border-l border-gray-100 dark:border-gray-700/50 select-none',
        isToday && 'bg-blue-50/30 dark:bg-blue-900/10',
        isEmpty && 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20',
        isOver && 'bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-400 ring-inset',
        isSelected && 'bg-green-200 dark:bg-green-800/50',
        className
      )}
      style={{ ...style, height: cellHeight }}
      onClick={isEmpty ? onClick : undefined}
      onMouseDown={isEmpty ? onMouseDown : undefined}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
    >
      {children}
    </div>
  );
}
