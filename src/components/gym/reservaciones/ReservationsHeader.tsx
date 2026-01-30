'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, ArrowLeft, BookOpen, Upload, UserCheck } from 'lucide-react';

interface ReservationsHeaderProps {
  onNewReservation: () => void;
  onRefresh: () => void;
  onImport: () => void;
  onBulkCheckIn?: () => void;
  isLoading?: boolean;
  stats?: {
    total: number;
    booked: number;
    attended: number;
    cancelled: number;
    todayReservations: number;
  };
}

export function ReservationsHeader({ 
  onNewReservation, 
  onRefresh, 
  onImport,
  onBulkCheckIn,
  isLoading,
  stats 
}: ReservationsHeaderProps) {
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
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
              Reservaciones
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Gimnasio / Reservaciones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          {onBulkCheckIn && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkCheckIn}
              className="text-green-600 border-green-200 hover:bg-green-50"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Check-in Masivo
            </Button>
          )}
          <Button
            size="sm"
            onClick={onNewReservation}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Reservación
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.todayReservations}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Hoy</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-2xl font-bold text-blue-600">{stats.booked}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Reservadas</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-2xl font-bold text-green-600">{stats.attended}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Asistieron</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Canceladas</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
          </div>
        </div>
      )}
    </div>
  );
}
