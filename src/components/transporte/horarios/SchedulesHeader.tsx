'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, Plus, RefreshCw, Upload } from 'lucide-react';

interface SchedulesHeaderProps {
  onRefresh: () => void;
  onNewSchedule: () => void;
  onImport?: () => void;
  isLoading?: boolean;
}

export function SchedulesHeader({ 
  onRefresh, 
  onNewSchedule, 
  onImport,
  isLoading 
}: SchedulesHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/transporte">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            Horarios de Rutas
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Transporte / Horarios
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        {onImport && (
          <Button variant="outline" onClick={onImport}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
        )}
        <Button onClick={onNewSchedule} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Horario
        </Button>
      </div>
    </div>
  );
}
