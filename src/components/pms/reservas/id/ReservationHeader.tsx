'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Calendar,
  User,
  DoorOpen,
  CreditCard,
  Globe,
  Users,
  Clock,
} from 'lucide-react';
import { type ReservationDetail } from '@/lib/services/reservationDetailService';

interface ReservationHeaderProps {
  reservation: ReservationDetail;
  nights: number;
  financials: {
    total: number;
    paid: number;
    balance: number;
    isPaidInFull: boolean;
  };
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  tentative: { label: 'Tentativa', variant: 'outline' },
  confirmed: { label: 'Confirmada', variant: 'default' },
  checked_in: { label: 'Check-in', variant: 'secondary' },
  checked_out: { label: 'Check-out', variant: 'secondary' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'destructive' },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
  direct: { label: 'Directo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  booking: { label: 'Booking', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  airbnb: { label: 'Airbnb', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  expedia: { label: 'Expedia', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
  other: { label: 'Otro', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
};

export function ReservationHeader({ reservation, nights, financials }: ReservationHeaderProps) {
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
    <div className="space-y-4">
      {/* Título y estado */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Reserva #{reservation.id.substring(0, 8).toUpperCase()}
            </h1>
            <Badge variant={STATUS_CONFIG[reservation.status]?.variant || 'default'}>
              {STATUS_CONFIG[reservation.status]?.label || reservation.status}
            </Badge>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Creada el {formatDate(reservation.created_at)}
          </p>
        </div>
      </div>

      {/* Cards de información */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Fechas */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">Fechas</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {formatDate(reservation.checkin)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {nights} noche{nights !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </Card>

        {/* Huésped */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">Huésped</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {reservation.customer.first_name} {reservation.customer.last_name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {reservation.customer.email}
              </p>
            </div>
          </div>
        </Card>

        {/* Espacios */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
              <DoorOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">Espacios</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {reservation.spaces.length} espacio{reservation.spaces.length !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {reservation.spaces[0]?.label || 'Sin asignar'}
              </p>
            </div>
          </div>
        </Card>

        {/* Saldo */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              financials.isPaidInFull
                ? 'bg-green-100 dark:bg-green-900'
                : 'bg-orange-100 dark:bg-orange-900'
            }`}>
              <CreditCard className={`h-5 w-5 ${
                financials.isPaidInFull
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-orange-600 dark:text-orange-400'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">Saldo</p>
              <p className={`font-semibold truncate ${
                financials.isPaidInFull
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-orange-600 dark:text-orange-400'
              }`}>
                {formatCurrency(financials.balance)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                de {formatCurrency(financials.total)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Detalles adicionales */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Canal</p>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                CHANNEL_CONFIG[reservation.channel]?.color || CHANNEL_CONFIG.other.color
              }`}>
                {CHANNEL_CONFIG[reservation.channel]?.label || reservation.channel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ocupantes</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {reservation.occupant_count} persona{reservation.occupant_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Última actualización</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(reservation.updated_at).toLocaleString('es-ES')}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
