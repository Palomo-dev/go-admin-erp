'use client';

import { Key, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApiKeysHeaderProps {
  totalKeys: number;
  activeKeys: number;
  loading: boolean;
  onRefresh: () => void;
  onCreate: () => void;
}

export default function ApiKeysHeader({
  totalKeys,
  activeKeys,
  loading,
  onRefresh,
  onCreate
}: ApiKeysHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Key className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                Llaves de API
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {activeKeys} de {totalKeys} llave{totalKeys !== 1 ? 's' : ''} activa{activeKeys !== 1 ? 's' : ''}
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
              onClick={onCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              Nueva Llave
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
