'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Car } from 'lucide-react';
import Link from 'next/link';

interface ParkingHeaderProps {
  onRefresh: () => void;
  onExport: () => void;
  isLoading?: boolean;
}

export function ParkingHeader({ onRefresh, onExport, isLoading }: ParkingHeaderProps) {
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
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Car className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard Parking
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              Control en tiempo real del estacionamiento
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
            Exportar
          </Button>

          <Link href="/app/parking/operacion">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Car className="h-4 w-4 mr-2" />
              Ir a Operación
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
