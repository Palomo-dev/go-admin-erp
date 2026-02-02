'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportCard } from './ExportCard';
import { FileDown } from 'lucide-react';
import type { TimelineExport } from '@/lib/services/timelineExportsService';

interface ExportsListProps {
  exports: TimelineExport[];
  loading: boolean;
  onDuplicate: (id: string) => void;
  onRerun: (id: string) => void;
  onEdit: (exportItem: TimelineExport) => void;
  onDelete: (id: string) => void;
}

export function ExportsList({
  exports,
  loading,
  onDuplicate,
  onRerun,
  onEdit,
  onDelete,
}: ExportsListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (exports.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <FileDown className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay exportaciones
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
          Crea tu primera exportación para descargar datos del timeline de auditoría.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {exports.map((exportItem) => (
        <ExportCard
          key={exportItem.id}
          exportItem={exportItem}
          onDuplicate={onDuplicate}
          onRerun={onRerun}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
