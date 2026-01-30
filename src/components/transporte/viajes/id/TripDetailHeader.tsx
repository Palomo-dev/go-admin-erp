'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Edit,
  Play,
  Square,
  UserCheck,
  AlertTriangle,
  Bus,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TripWithDetails } from '@/lib/services/tripsService';

interface TripDetailHeaderProps {
  trip: TripWithDetails;
  onEdit: () => void;
  onStatusChange: (status: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: {
    label: 'Programado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    icon: <Clock className="h-4 w-4" />,
  },
  boarding: {
    label: 'En Abordaje',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    icon: <UserCheck className="h-4 w-4" />,
  },
  in_transit: {
    label: 'En Ruta',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    icon: <Bus className="h-4 w-4" />,
  },
  completed: {
    label: 'Completado',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: <Square className="h-4 w-4" />,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
};

export function TripDetailHeader({ trip, onEdit, onStatusChange }: TripDetailHeaderProps) {
  const router = useRouter();
  const status = STATUS_CONFIG[trip.status] || STATUS_CONFIG.scheduled;

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/app/transporte/viajes')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {trip.trip_code}
            </h1>
            <Badge className={`${status.color} flex items-center gap-1`}>
              {status.icon}
              {status.label}
            </Badge>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {trip.transport_routes?.name} •{' '}
            {format(new Date(trip.trip_date), "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {trip.status === 'scheduled' && (
          <Button
            variant="outline"
            onClick={() => onStatusChange('boarding')}
            className="text-yellow-600 border-yellow-600 hover:bg-yellow-50"
          >
            <UserCheck className="h-4 w-4 mr-2" />
            Iniciar Abordaje
          </Button>
        )}
        {trip.status === 'boarding' && (
          <Button
            variant="outline"
            onClick={() => onStatusChange('in_transit')}
            className="text-green-600 border-green-600 hover:bg-green-50"
          >
            <Play className="h-4 w-4 mr-2" />
            Iniciar Viaje
          </Button>
        )}
        {trip.status === 'in_transit' && (
          <Button
            variant="outline"
            onClick={() => onStatusChange('completed')}
            className="text-gray-600 border-gray-600 hover:bg-gray-50"
          >
            <Square className="h-4 w-4 mr-2" />
            Completar Viaje
          </Button>
        )}
        {trip.status !== 'cancelled' && trip.status !== 'completed' && (
          <Button
            variant="outline"
            onClick={() => onStatusChange('cancelled')}
            className="text-red-600 border-red-600 hover:bg-red-50"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        )}
        <Button onClick={onEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Edit className="h-4 w-4 mr-2" />
          Editar
        </Button>
      </div>
    </div>
  );
}
