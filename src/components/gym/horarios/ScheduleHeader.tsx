'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, Clock, Plus } from 'lucide-react';

interface ScheduleHeaderProps {
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onNewClass?: () => void;
  isLoading?: boolean;
}

export function ScheduleHeader({
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onRefresh,
  onNewClass,
  isLoading,
}: ScheduleHeaderProps) {
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
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
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              Horarios
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Gimnasio / Horarios
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrevWeek}
              className="rounded-r-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-4 text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
              {formatMonthYear(currentDate)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNextWeek}
              className="rounded-l-none"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <Button variant="outline" size="sm" onClick={onToday}>
            Hoy
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {onNewClass && (
            <Button
              size="sm"
              onClick={onNewClass}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Clase
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
