'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  RefreshCw, 
  ArrowLeft, 
  Calendar, 
  Upload, 
  List, 
  LayoutGrid 
} from 'lucide-react';
import { cn } from '@/utils/Utils';

export type ViewMode = 'list' | 'calendar';

interface ClassesHeaderProps {
  onNewClass: () => void;
  onRefresh: () => void;
  onImport: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isLoading?: boolean;
}

export function ClassesHeader({ 
  onNewClass, 
  onRefresh, 
  onImport,
  viewMode,
  onViewModeChange,
  isLoading 
}: ClassesHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/gym">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            Clases
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gimnasio / Clases
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        {/* Toggle de vista */}
        <div className="flex items-center border rounded-lg p-1 bg-gray-100 dark:bg-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewModeChange('list')}
            className={cn(
              "h-8 px-3",
              viewMode === 'list' 
                ? "bg-white dark:bg-gray-700 shadow-sm" 
                : "hover:bg-gray-200 dark:hover:bg-gray-700"
            )}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Lista
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewModeChange('calendar')}
            className={cn(
              "h-8 px-3",
              viewMode === 'calendar' 
                ? "bg-white dark:bg-gray-700 shadow-sm" 
                : "hover:bg-gray-200 dark:hover:bg-gray-700"
            )}
          >
            <Calendar className="h-4 w-4 mr-1" />
            Calendario
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onImport}
        >
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>
        
        <Button
          size="sm"
          onClick={onNewClass}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Clase
        </Button>
      </div>
    </div>
  );
}
