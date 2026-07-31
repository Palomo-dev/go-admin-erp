'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  Play,
  Square,
  UserCheck,
  Bus,
  Clock,
  Users,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TripWithDetails } from '@/lib/services/tripsService';

interface TripsListProps {
  trips: TripWithDetails[];
  isLoading: boolean;
  onEdit: (trip: TripWithDetails) => void;
  onDuplicate: (trip: TripWithDetails) => void;
  onDelete: (trip: TripWithDetails) => void;
  onStatusChange: (trip: TripWithDetails, status: string) => void;
  onBoarding: (trip: TripWithDetails) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: {
    label: 'Programado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    icon: <Clock className="h-3 w-3" />,
  },
  boarding: {
    label: 'En Abordaje',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    icon: <UserCheck className="h-3 w-3" />,
  },
  in_transit: {
    label: 'En Ruta',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    icon: <Bus className="h-3 w-3" />,
  },
  completed: {
    label: 'Completado',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: <Square className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

export function TripsList({
  trips,
  isLoading,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onBoarding,
}: TripsListProps) {
  const router = useRouter();

  const handleViewDetails = (trip: TripWithDetails) => {
    router.push(`/app/transporte/viajes/${trip.id}`);
  };

  const getOccupancy = (trip: TripWithDetails) => {
    const occupied = trip.total_seats - trip.available_seats;
    const percentage = trip.total_seats > 0 ? Math.round((occupied / trip.total_seats) * 100) : 0;
    return { occupied, total: trip.total_seats, percentage };
  };

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando viajes...</span>
        </div>
      </Card>
    );
  }

  if (trips.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center">
          <Bus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No hay viajes
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            No se encontraron viajes con los filtros aplicados.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Fecha / Hora</TableHead>
            <TableHead>Ruta</TableHead>
            <TableHead>Vehículo</TableHead>
            <TableHead>Conductor</TableHead>
            <TableHead>Ocupación</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.map((trip) => {
            const status = STATUS_CONFIG[trip.status] || STATUS_CONFIG.scheduled;
            const occupancy = getOccupancy(trip);

            return (
              <TableRow
                key={trip.id}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleViewDetails(trip)}
              >
                <TableCell className="font-medium">
                  <span className="text-blue-600 dark:text-blue-400">
                    {trip.trip_code}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {format(new Date(trip.trip_date), 'dd/MM/yyyy', { locale: es })}
                    </span>
                    <span className="text-sm text-gray-500">
                      {format(new Date(trip.scheduled_departure), 'HH:mm')}
                      {trip.scheduled_arrival && (
                        <> - {format(new Date(trip.scheduled_arrival), 'HH:mm')}</>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{trip.transport_routes?.name || '-'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {trip.vehicles ? (
                    <div className="flex flex-col">
                      <span>{trip.vehicles.plate}</span>
                      <span className="text-xs text-gray-500">
                        {trip.vehicles.brand} {trip.vehicles.model}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">Sin asignar</span>
                  )}
                </TableCell>
                <TableCell>
                  {trip.driver_credentials?.employments?.organization_members?.profiles ? (
                    <span>
                      {trip.driver_credentials.employments.organization_members.profiles.first_name}{' '}
                      {trip.driver_credentials.employments.organization_members.profiles.last_name}
                    </span>
                  ) : (
                    <span className="text-gray-400">Sin asignar</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span>
                      {occupancy.occupied}/{occupancy.total}
                    </span>
                    <span className="text-xs text-gray-500">({occupancy.percentage}%)</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${status.color} flex items-center gap-1 w-fit`}>
                    {status.icon}
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewDetails(trip)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalles
                      </DropdownMenuItem>
                      {trip.status === 'scheduled' && (
                        <DropdownMenuItem onClick={() => onBoarding(trip)}>
                          <UserCheck className="h-4 w-4 mr-2" />
                          Iniciar Abordaje
                        </DropdownMenuItem>
                      )}
                      {trip.status === 'boarding' && (
                        <DropdownMenuItem onClick={() => onStatusChange(trip, 'in_transit')}>
                          <Play className="h-4 w-4 mr-2" />
                          Iniciar Viaje
                        </DropdownMenuItem>
                      )}
                      {trip.status === 'in_transit' && (
                        <DropdownMenuItem onClick={() => onStatusChange(trip, 'completed')}>
                          <Square className="h-4 w-4 mr-2" />
                          Completar Viaje
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEdit(trip)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(trip)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {trip.status !== 'cancelled' && trip.status !== 'completed' && (
                        <DropdownMenuItem
                          onClick={() => onStatusChange(trip, 'cancelled')}
                          className="text-red-600"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Cancelar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onDelete(trip)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
