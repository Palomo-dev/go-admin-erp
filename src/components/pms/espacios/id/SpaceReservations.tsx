'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, User, Clock, Mail, Phone, DoorOpen, LogIn, LogOut, AlertCircle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Reservation {
  id: string;
  checkin: string;
  checkout: string;
  status: string;
  occupant_count: number;
  total_estimated: number;
  notes?: string;
  customer?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
}

interface SpaceReservationsProps {
  reservations: Reservation[];
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmada', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'checked_in':
      return { label: 'Check-in', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    case 'checked_out':
      return { label: 'Check-out', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
    case 'cancelled':
      return { label: 'Cancelada', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'no_show':
      return { label: 'No Show', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
    default:
      return { label: status, color: 'bg-gray-100 text-gray-800' };
  }
};

export function SpaceReservations({ reservations }: SpaceReservationsProps) {
  const now = new Date();
  
  // Encontrar la reserva actualmente ocupando el espacio (checked_in)
  const currentReservation = reservations.find(r => r.status === 'checked_in');
  
  // Filtrar el resto de reservas
  const upcoming = reservations.filter(r => 
    r.status !== 'checked_in' && new Date(r.checkin) >= now
  );
  const past = reservations.filter(r => 
    r.status !== 'checked_in' && new Date(r.checkin) < now
  );

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Historial de Reservas
      </h2>

      {/* Reserva Actual - Ocupado */}
      {currentReservation && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <DoorOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Reserva Actual - Ocupado
            </h3>
          </div>
          
          <div className="p-5 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border-2 border-green-200 dark:border-green-800">
            {/* Header con huésped y estado */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {currentReservation.customer?.first_name} {currentReservation.customer?.last_name}
                </h4>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300">
                En Hospedaje
              </Badge>
            </div>

            {/* Información del Cliente */}
            <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-4 mb-4 space-y-2">
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Información del Huésped
              </h5>
              {currentReservation.customer?.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {currentReservation.customer.email}
                  </span>
                </div>
              )}
              {currentReservation.customer?.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {currentReservation.customer.phone}
                  </span>
                </div>
              )}
            </div>

            {/* Fechas de Estadía */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                  <LogIn className="h-4 w-4" />
                  <span className="text-xs font-medium">Check-in</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {format(new Date(currentReservation.checkin), 'dd MMM yyyy', { locale: es })}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                  <LogOut className="h-4 w-4" />
                  <span className="text-xs font-medium">Check-out</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {format(new Date(currentReservation.checkout), 'dd MMM yyyy', { locale: es })}
                </p>
              </div>
            </div>

            {/* Información Adicional */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Clock className="h-4 w-4" />
                <span>{currentReservation.occupant_count} huésped{currentReservation.occupant_count > 1 ? 'es' : ''}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>
                  {differenceInDays(
                    new Date(currentReservation.checkout),
                    new Date(currentReservation.checkin)
                  )} noche{differenceInDays(
                    new Date(currentReservation.checkout),
                    new Date(currentReservation.checkin)
                  ) > 1 ? 's' : ''}
                </span>
              </div>

              {currentReservation.total_estimated && (
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  ${currentReservation.total_estimated.toLocaleString()}
                </div>
              )}
            </div>

            {/* Días restantes */}
            {(() => {
              const daysLeft = differenceInDays(new Date(currentReservation.checkout), now);
              if (daysLeft > 0) {
                return (
                  <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>
                      {daysLeft === 1 
                        ? 'Sale mañana' 
                        : `Faltan ${daysLeft} días para el check-out`}
                    </span>
                  </div>
                );
              } else if (daysLeft === 0) {
                return (
                  <div className="mt-3 flex items-center gap-2 text-xs text-orange-700 dark:text-orange-300 bg-orange-100/50 dark:bg-orange-900/30 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>Check-out programado para hoy</span>
                  </div>
                );
              } else {
                return (
                  <div className="mt-3 flex items-center gap-2 text-xs text-red-700 dark:text-red-300 bg-red-100/50 dark:bg-red-900/30 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>Check-out tardío ({Math.abs(daysLeft)} {Math.abs(daysLeft) === 1 ? 'día' : 'días'} de retraso)</span>
                  </div>
                );
              }
            })()}
          </div>

          <Separator className="my-6" />
        </div>
      )}

      {/* Próximas Reservas */}
      {upcoming.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Próximas ({upcoming.length})
          </h3>
          <div className="space-y-4">
            {upcoming.map((reservation) => {
              const statusInfo = getStatusInfo(reservation.status);
              return (
                <div
                  key={reservation.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {reservation.customer?.first_name} {reservation.customer?.last_name}
                      </span>
                    </div>
                    <Badge className={statusInfo.color}>
                      {statusInfo.label}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(reservation.checkin), 'dd MMM', { locale: es })} - {' '}
                        {format(new Date(reservation.checkout), 'dd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Clock className="h-4 w-4" />
                      <span>{reservation.occupant_count} huéspedes</span>
                    </div>
                  </div>

                  {reservation.total_estimated && (
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Total: ${reservation.total_estimated.toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reservas Pasadas */}
      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Historial ({past.length})
          </h3>
          <div className="space-y-3">
            {past.slice(0, 5).map((reservation) => {
              const statusInfo = getStatusInfo(reservation.status);
              return (
                <div
                  key={reservation.id}
                  className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {reservation.customer?.first_name} {reservation.customer?.last_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(reservation.checkin), 'dd MMM', { locale: es })} - {' '}
                        {format(new Date(reservation.checkout), 'dd MMM yyyy', { locale: es })}
                      </p>
                    </div>
                    <Badge className={statusInfo.color} variant="outline">
                      {statusInfo.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reservations.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay reservas registradas
          </p>
        </div>
      )}
    </Card>
  );
}
