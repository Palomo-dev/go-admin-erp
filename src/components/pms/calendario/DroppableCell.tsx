'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/utils/Utils';

interface DroppableCellProps {
  spaceId: string;
  date: string;
  isToday: boolean;
  isWeekend: boolean;
  isEmpty: boolean;
  isSelected?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onMouseUp?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function DroppableCell({
  spaceId,
  date,
  isToday,
  isWeekend,
  isEmpty,
  isSelected = false,
  children,
  onClick,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  className,
  style,
}: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${spaceId}-${date}`,
    data: {
      type: 'cell',
      spaceId,
      date,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 border-r border-gray-200 dark:border-gray-700 relative select-none',
        isToday && 'bg-blue-50/50 dark:bg-blue-950/30',
        isWeekend && !isToday && 'bg-gray-50 dark:bg-gray-850',
        isEmpty && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
        isOver && 'bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-400 ring-inset',
        isSelected && 'bg-green-200 dark:bg-green-800/50',
        className
      )}
      style={style}
      onClick={isEmpty ? onClick : undefined}
      onMouseDown={isEmpty ? onMouseDown : undefined}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
    >
      {children}
    </div>
  );
}
