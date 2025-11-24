'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LogIn,
  DoorOpen,
  AlertCircle,
  CheckCircle2,
  User,
  Calendar,
  Users,
} from 'lucide-react';
import type { CheckinReservation } from '@/lib/services/checkinService';

interface ArrivalsTableProps {
  arrivals: CheckinReservation[];
  onCheckin: (reservation: CheckinReservation) => void;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  confirmed: {
    label: 'Confirmada',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    icon: Calendar,
  },
  checked_in: {
    label: 'Check-in',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelada',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    icon: AlertCircle,
  },
};

export function ArrivalsTable({
  arrivals,
  onCheckin,
  isLoading,
}: ArrivalsTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
  };

  if (isLoading) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-500 dark:text-gray-400 mt-4">
            Cargando llegadas...
          </p>
        </div>
      </div>
    );
  }

  if (arrivals.length === 0) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-8 text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay llegadas programadas para hoy
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="font-semibold">Código</TableHead>
            <TableHead className="font-semibold">Huésped</TableHead>
            <TableHead className="font-semibold">Contacto</TableHead>
            <TableHead className="font-semibold">Espacios</TableHead>
            <TableHead className="font-semibold">Estado Limpieza</TableHead>
            <TableHead className="font-semibold">Noches</TableHead>
            <TableHead className="font-semibold">Ocupantes</TableHead>
            <TableHead className="font-semibold text-right">Total</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {arrivals.map((arrival) => {
            const statusConfig =
              STATUS_CONFIG[arrival.status] || STATUS_CONFIG.confirmed;
            const StatusIcon = statusConfig.icon;
            const allRoomsReady = arrival.spaces.every((s) => s.is_ready);

            return (
              <TableRow
                key={arrival.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <TableCell className="font-mono font-medium text-blue-600 dark:text-blue-400">
                  #{arrival.code}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {arrival.customer_name}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="text-sm">
                    <p className="text-gray-900 dark:text-gray-100">
                      {arrival.customer_email}
                    </p>
                    {arrival.customer_phone && (
                      <p className="text-gray-500 dark:text-gray-400">
                        {arrival.customer_phone}
                      </p>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="space-y-1">
                    {arrival.spaces.map((space) => (
                      <div
                        key={space.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <DoorOpen className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {space.label}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {space.space_type_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </TableCell>

                <TableCell>
                  {arrival.spaces.map((space) => (
                    <Badge
                      key={space.id}
                      variant={space.is_ready ? 'default' : 'secondary'}
                      className={
                        space.is_ready
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                      }
                    >
                      {space.is_ready ? (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      ) : (
                        <AlertCircle className="h-3 w-3 mr-1" />
                      )}
                      {space.is_ready ? 'Lista' : 'Pendiente'}
                    </Badge>
                  ))}
                </TableCell>

                <TableCell>
                  <span className="text-gray-900 dark:text-gray-100">
                    {arrival.nights}
                  </span>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-900 dark:text-gray-100">
                      {arrival.occupant_count}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(arrival.total_estimated)}
                  </span>
                </TableCell>

                <TableCell>
                  <Badge className={statusConfig.color}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusConfig.label}
                  </Badge>
                </TableCell>

                <TableCell className="text-right">
                  {arrival.status === 'confirmed' && (
                    <Button
                      onClick={() => onCheckin(arrival)}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!allRoomsReady}
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Check-in
                    </Button>
                  )}
                  {arrival.status === 'checked_in' && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Completado
                    </Badge>
                  )}
                  {!allRoomsReady && arrival.status === 'confirmed' && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      Espacio sin limpieza
                    </p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
