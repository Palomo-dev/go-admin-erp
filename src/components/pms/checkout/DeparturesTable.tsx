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
  LogOut,
  User,
  Mail,
  Phone,
  DoorOpen,
  Calendar,
  DollarSign,
  FileText,
} from 'lucide-react';
import type { CheckoutReservation } from '@/lib/services/checkoutService';
import { formatCurrency } from '@/utils/Utils';

interface DeparturesTableProps {
  departures: CheckoutReservation[];
  isLoading?: boolean;
  onCheckout: (reservation: CheckoutReservation) => void;
  onViewFolio: (reservation: CheckoutReservation) => void;
}

export function DeparturesTable({
  departures,
  isLoading,
  onCheckout,
  onViewFolio,
}: DeparturesTableProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Cargando salidas del día...
          </p>
        </div>
      </div>
    );
  }

  if (departures.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="p-12 text-center">
          <LogOut className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            No hay salidas para este período
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            No se encontraron reservas con fecha de salida en el rango seleccionado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50">
            <TableHead className="font-semibold">Reserva</TableHead>
            <TableHead className="font-semibold">Huésped</TableHead>
            <TableHead className="font-semibold">Espacios</TableHead>
            <TableHead className="font-semibold">Fechas</TableHead>
            <TableHead className="font-semibold">Folio</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {departures.map((departure) => (
            <TableRow
              key={departure.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-900/50"
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {departure.code}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {departure.nights} {departure.nights === 1 ? 'noche' : 'noches'}
                    </p>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {departure.customer_name}
                    </span>
                  </div>
                  {departure.customer_email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Mail className="h-3 w-3" />
                      <span>{departure.customer_email}</span>
                    </div>
                  )}
                  {departure.customer_phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Phone className="h-3 w-3" />
                      <span>{departure.customer_phone}</span>
                    </div>
                  )}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex flex-col gap-1">
                  {departure.spaces.map((space, index) => (
                    <div
                      key={space.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <DoorOpen className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {space.label}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        ({space.space_type_name})
                      </span>
                    </div>
                  ))}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">Check-in:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(departure.checkin)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">Check-out:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(departure.checkout)}
                    </span>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                {departure.folio ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Total:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(departure.folio.total_charges)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Saldo:
                      </span>
                      <span
                        className={`font-semibold ${
                          departure.folio.balance > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {formatCurrency(departure.folio.balance)}
                      </span>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => onViewFolio(departure)}
                      className="h-auto p-0 text-blue-600 dark:text-blue-400"
                    >
                      Ver detalle del folio
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Sin folio
                  </span>
                )}
              </TableCell>

              <TableCell>
                <Badge
                  variant={
                    departure.status === 'checked_in' ? 'default' : 'secondary'
                  }
                  className={
                    departure.status === 'checked_in'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : ''
                  }
                >
                  {departure.status === 'checked_in' ? 'En estancia' : departure.status}
                </Badge>
              </TableCell>

              <TableCell className="text-right">
                <Button
                  onClick={() => onCheckout(departure)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
                  disabled={departure.status === 'closed'}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Check-out
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
