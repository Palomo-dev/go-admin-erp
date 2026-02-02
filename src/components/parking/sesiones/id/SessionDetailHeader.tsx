'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  RefreshCw,
  Printer,
  MoreVertical,
  Car,
  Bike,
  Truck,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

interface SessionDetailHeaderProps {
  session: {
    id: string;
    vehicle_plate: string;
    vehicle_type: string;
    status: string;
    entry_at: string;
  } | null;
  isLoading: boolean;
  onRefresh: () => void;
  onPrint: () => void;
  onMarkIncident: () => void;
}

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    open: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels: Record<string, string> = {
    open: 'Activa',
    closed: 'Cerrada',
    cancelled: 'Cancelada',
  };
  return (
    <Badge className={styles[status] || styles.open}>
      {labels[status] || status}
    </Badge>
  );
};

const getVehicleIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    car: <Car className="h-5 w-5" />,
    motorcycle: <Bike className="h-5 w-5" />,
    truck: <Truck className="h-5 w-5" />,
  };
  return icons[type] || <Car className="h-5 w-5" />;
};

export function SessionDetailHeader({
  session,
  isLoading,
  onRefresh,
  onPrint,
  onMarkIncident,
}: SessionDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/parking/sesiones">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            {session ? getVehicleIcon(session.vehicle_type) : <Car className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {session?.vehicle_plate || 'Cargando...'}
              </h1>
              {session && getStatusBadge(session.status)}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {session
                ? `Sesión iniciada ${new Date(session.entry_at).toLocaleString('es-ES')}`
                : 'Cargando detalles...'}
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

          <Button variant="outline" onClick={onPrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onMarkIncident}>
                Marcar Incidente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
