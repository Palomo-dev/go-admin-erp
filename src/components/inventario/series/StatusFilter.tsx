'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { SerialStatus } from './StatusBadge';

interface StatusFilterProps {
  selectedStatus: SerialStatus | 'Todos';
  onStatusChange: (status: SerialStatus | 'Todos') => void;
}

export function StatusFilter({ selectedStatus, onStatusChange }: StatusFilterProps) {
  const statuses: (SerialStatus | 'Todos')[] = ['Todos', 'En stock', 'Vendida', 'Garantía'];

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <Button
          key={status}
          variant={selectedStatus === status ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusChange(status)}
          className={selectedStatus === status ? 'bg-blue-600 hover:bg-blue-700' : ''}
        >
          {status}
        </Button>
      ))}
    </div>
  );
}
