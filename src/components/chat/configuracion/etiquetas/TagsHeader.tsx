'use client';

import { Tags, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TagsHeaderProps {
  totalTags: number;
  loading: boolean;
  onRefresh: () => void;
  onCreateTag: () => void;
}

export default function TagsHeader({
  totalTags,
  loading,
  onRefresh,
  onCreateTag
}: TagsHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Tags className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                Etiquetas de Conversación
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {totalTags} etiqueta{totalTags !== 1 ? 's' : ''} configurada{totalTags !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              onClick={onCreateTag}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              Nueva Etiqueta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
