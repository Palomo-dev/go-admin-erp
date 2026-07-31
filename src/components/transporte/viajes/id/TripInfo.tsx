'use client';

import { Card } from '@/components/ui/card';
import { Bus, MapPin, Clock, Users, DollarSign, User } from 'lucide-react';
import { format } from 'date-fns';
import type { TripWithDetails } from '@/lib/services/tripsService';

interface TripInfoProps {
  trip: TripWithDetails;
}

export function TripInfo({ trip }: TripInfoProps) {
  const occupancy = trip.total_seats - trip.available_seats;
  const occupancyPercent = trip.total_seats > 0
    ? Math.round((occupancy / trip.total_seats) * 100)
    : 0;

  const infoCards = [
    {
      title: 'Ruta',
      value: trip.transport_routes?.name || '-',
      subtitle: trip.transport_routes?.code,
      icon: <MapPin className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Vehículo',
      value: trip.vehicles?.plate || 'Sin asignar',
      subtitle: trip.vehicles ? `${trip.vehicles.brand || ''} ${trip.vehicles.model || ''}`.trim() : undefined,
      icon: <Bus className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Conductor',
      value: trip.driver_credentials?.employments?.organization_members?.profiles
        ? `${trip.driver_credentials.employments.organization_members.profiles.first_name} ${trip.driver_credentials.employments.organization_members.profiles.last_name}`
        : 'Sin asignar',
      icon: <User className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Horario',
      value: format(new Date(trip.scheduled_departure), 'HH:mm'),
      subtitle: trip.scheduled_arrival
        ? `Llegada: ${format(new Date(trip.scheduled_arrival), 'HH:mm')}`
        : undefined,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    },
    {
      title: 'Ocupación',
      value: `${occupancy}/${trip.total_seats}`,
      subtitle: `${occupancyPercent}% ocupado`,
      icon: <Users className="h-5 w-5" />,
      color: 'text-teal-600 bg-teal-100 dark:bg-teal-900/30',
    },
    {
      title: 'Tarifa Base',
      value: new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: trip.currency || 'COP',
        minimumFractionDigits: 0,
      }).format(trip.base_fare || 0),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {infoCards.map((card) => (
        <Card key={card.title} className="p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${card.color}`}>
              {card.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{card.title}</p>
              <p className="font-semibold text-gray-900 dark:text-white truncate">
                {card.value}
              </p>
              {card.subtitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {card.subtitle}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
