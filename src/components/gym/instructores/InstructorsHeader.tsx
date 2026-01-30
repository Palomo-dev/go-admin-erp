'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw, ArrowLeft, UserCheck, Calendar, Users, TrendingUp, Clock } from 'lucide-react';

interface InstructorsHeaderProps {
  onRefresh: () => void;
  isLoading?: boolean;
  stats?: {
    totalInstructors: number;
    activeInstructors: number;
    totalClassesThisWeek: number;
    avgAttendanceRate: number;
    totalHoursThisWeek: number;
  };
}

export function InstructorsHeader({ onRefresh, isLoading, stats }: InstructorsHeaderProps) {
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
                <UserCheck className="h-6 w-6 text-blue-600" />
              </div>
              Instructores
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Panel de instructores y asignaciones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalInstructors}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.activeInstructors}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.totalClassesThisWeek}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Clases/Semana</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-orange-600">{stats.totalHoursThisWeek}h</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Horas/Semana</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-600" />
              <div>
                <p className="text-2xl font-bold text-cyan-600">{stats.avgAttendanceRate.toFixed(0)}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Asistencia Prom.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
