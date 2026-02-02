'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Eye, 
  Edit, 
  Printer, 
  Car, 
  Bike, 
  Truck,
  Clock,
  CreditCard,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

export interface ParkingSession {
  id: string;
  branch_id: number;
  parking_space_id: string | null;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  exit_at: string | null;
  duration_min: number | null;
  rate_id: string | null;
  amount: number | null;
  status: 'open' | 'closed' | 'cancelled';
  created_at: string;
  updated_at: string;
  // Campos calculados o relacionados
  space_name?: string;
  rate_name?: string;
  payment_method?: string;
  attendant_name?: string;
  is_subscriber?: boolean;
}

interface SesionesTableProps {
  sessions: ParkingSession[];
  isLoading?: boolean;
  onEdit?: (session: ParkingSession) => void;
  onPrint?: (session: ParkingSession) => void;
  canEdit?: boolean;
}

const vehicleIcons: Record<string, React.ReactNode> = {
  car: <Car className="h-4 w-4" />,
  motorcycle: <Bike className="h-4 w-4" />,
  bicycle: <Bike className="h-4 w-4" />,
  truck: <Truck className="h-4 w-4" />,
};

const vehicleLabels: Record<string, string> = {
  car: 'Carro',
  motorcycle: 'Moto',
  bicycle: 'Bicicleta',
  truck: 'Camión',
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  open: { 
    label: 'Activa', 
    variant: 'default',
    icon: <Clock className="h-3 w-3" />
  },
  closed: { 
    label: 'Cerrada', 
    variant: 'secondary',
    icon: <CheckCircle className="h-3 w-3" />
  },
  cancelled: { 
    label: 'Cancelada', 
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />
  },
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SesionesTable({
  sessions,
  isLoading = false,
  onEdit,
  onPrint,
  canEdit = false,
}: SesionesTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500 dark:text-gray-400">Cargando sesiones...</span>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No se encontraron sesiones
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Ajusta los filtros o verifica que existan registros en el sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900/50">
              <TableHead className="font-semibold">Placa</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Entrada</TableHead>
              <TableHead className="font-semibold">Salida</TableHead>
              <TableHead className="font-semibold">Duración</TableHead>
              <TableHead className="font-semibold">Monto</TableHead>
              <TableHead className="font-semibold">Pago</TableHead>
              <TableHead className="font-semibold">Estado</TableHead>
              <TableHead className="font-semibold text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const status = statusConfig[session.status] || statusConfig.open;
              
              return (
                <TableRow 
                  key={session.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {session.vehicle_plate}
                      </span>
                      {session.is_subscriber && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                          Abonado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                      {vehicleIcons[session.vehicle_type] || <Car className="h-4 w-4" />}
                      <span>{vehicleLabels[session.vehicle_type] || session.vehicle_type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(session.entry_at)}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {session.exit_at ? formatDateTime(session.exit_at) : '-'}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatDuration(session.duration_min)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {session.amount ? formatCurrency(session.amount) : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {session.payment_method ? (
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <CreditCard className="h-4 w-4" />
                        <span className="capitalize">{session.payment_method}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={status.variant}
                      className="flex items-center gap-1 w-fit"
                    >
                      {status.icon}
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/app/parking/sesiones/${session.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalle">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      {canEdit && session.status !== 'cancelled' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          title="Editar"
                          onClick={() => onEdit?.(session)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {session.status === 'closed' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          title="Reimprimir recibo"
                          onClick={() => onPrint?.(session)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
