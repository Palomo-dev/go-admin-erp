'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { DoorOpen, User, Mail, Phone, Calendar, Users, Tag } from 'lucide-react';
import { type ReservationDetail } from '@/lib/services/reservationDetailService';

interface OverviewTabProps {
  reservation: ReservationDetail;
  nights: number;
}

export function OverviewTab({ reservation, nights }: OverviewTabProps) {
  const formatDate = (dateString: string) => {
    // Agregar hora para evitar problemas de zona horaria
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Información del Huésped */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Información del Huésped
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Nombre Completo</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {reservation.customer.first_name} {reservation.customer.last_name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
              <p className="text-gray-900 dark:text-gray-100">{reservation.customer.email}</p>
            </div>
          </div>

          {reservation.customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Teléfono</p>
                <p className="text-gray-900 dark:text-gray-100">{reservation.customer.phone}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ocupantes</p>
              <p className="text-gray-900 dark:text-gray-100">
                {reservation.occupant_count} persona{reservation.occupant_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Detalles de la Estancia */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Detalles de la Estancia
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Check-in</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {formatDate(reservation.checkin)}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Check-out</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {formatDate(reservation.checkout)}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Duración</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {nights} noche{nights !== 1 ? 's' : ''}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Estimado</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(reservation.total_estimated)}
            </p>
          </div>
        </div>
      </Card>

      {/* Espacios Asignados */}
      <Card className="p-6 lg:col-span-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <DoorOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Espacios Asignados
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reservation.spaces.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 col-span-full">
              No hay espacios asignados
            </p>
          ) : (
            reservation.spaces.map((space) => (
              <Card key={space.id} className="p-4 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                    <DoorOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {space.label}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {space.space_type.name}
                    </p>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {formatCurrency(space.space_type.base_rate)} / noche
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>

      {/* Extras/Servicios */}
      {reservation.metadata?.extras && reservation.metadata.extras.length > 0 && (
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Servicios Adicionales
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reservation.metadata.extras.map((extra: any, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{extra.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Cantidad: {extra.quantity}
                  </p>
                </div>
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  {formatCurrency(extra.price * extra.quantity)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
