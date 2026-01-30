'use client';

import { MessageSquareText, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface QuickRepliesHeaderProps {
  totalReplies: number;
  searchTerm: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
}

export default function QuickRepliesHeader({
  totalReplies,
  searchTerm,
  loading,
  onSearchChange,
  onRefresh,
  onCreate
}: QuickRepliesHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <MessageSquareText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                Respuestas Rápidas
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {totalReplies} plantilla{totalReplies !== 1 ? 's' : ''} configurada{totalReplies !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar..."
                className="pl-10 w-[200px] bg-white dark:bg-gray-800"
              />
            </div>
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
              Nueva Respuesta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
