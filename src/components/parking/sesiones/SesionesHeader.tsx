'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Download, History } from 'lucide-react';
import Link from 'next/link';

interface SesionesHeaderProps {
  onRefresh: () => void;
  onExport: () => void;
  isLoading?: boolean;
  totalSessions?: number;
}

export function SesionesHeader({ 
  onRefresh, 
  onExport, 
  isLoading = false,
  totalSessions = 0
}: SesionesHeaderProps) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/parking">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <History className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Historial de Sesiones
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {today} • {totalSessions} registros
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          <Button
            variant="outline"
            onClick={onExport}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>

          <Link href="/app/parking/operacion">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              Ir a Operación
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
