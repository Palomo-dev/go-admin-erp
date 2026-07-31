'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Bus, User } from 'lucide-react';
import { transportRoutesService } from '@/lib/services/transportRoutesService';

interface Trip {
  id: string;
  trip_date: string;
  departure_time?: string;
  status: string;
  vehicles?: { plate_number: string };
  driver_credentials?: { license_number: string };
}

interface RouteTripsHistoryProps {
  routeId: string;
}

export function RouteTripsHistory({ routeId }: RouteTripsHistoryProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTrips = async () => {
      setIsLoading(true);
      try {
        const data = await transportRoutesService.getTripsByRoute(routeId, 10);
        setTrips(data);
      } catch (error) {
        console.error('Error loading trips:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTrips();
  }, [routeId]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Completado', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' };
      case 'in_progress':
        return { label: 'En curso', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' };
      case 'scheduled':
        return { label: 'Programado', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' };
      case 'cancelled':
        return { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800' };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Viajes Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Viajes Recientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {trips.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hay viajes registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => {
              const statusConfig = getStatusConfig(trip.status);
              return (
                <div
                  key={trip.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {new Date(trip.trip_date).toLocaleDateString('es-CO', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                      {trip.departure_time && (
                        <p className="text-gray-500">{trip.departure_time}</p>
                      )}
                    </div>
                    {trip.vehicles && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Bus className="h-4 w-4" />
                        {trip.vehicles.plate_number}
                      </div>
                    )}
                    {trip.driver_credentials && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <User className="h-4 w-4" />
                        {trip.driver_credentials.license_number}
                      </div>
                    )}
                  </div>
                  <Badge className={statusConfig.color}>
                    {statusConfig.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
