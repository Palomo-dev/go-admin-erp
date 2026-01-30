'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Vehicle, Trip } from '@/lib/services/transportService';
import { 
  Bus, 
  Package, 
  Calendar,
  MapPin,
  Clock,
  Loader2,
  History as HistoryIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface VehicleHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  trips: Trip[];
  isLoading?: boolean;
}

const tripStatusConfig: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Programado', color: 'bg-blue-100 text-blue-700' },
  boarding: { label: 'Abordando', color: 'bg-yellow-100 text-yellow-700' },
  in_transit: { label: 'En tránsito', color: 'bg-purple-100 text-purple-700' },
  completed: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export function VehicleHistoryDialog({
  open,
  onOpenChange,
  vehicle,
  trips,
  isLoading,
}: VehicleHistoryDialogProps) {
  const [activeTab, setActiveTab] = useState('trips');

  if (!vehicle) return null;

  const completedTrips = trips.filter(t => t.status === 'completed').length;
  const totalTrips = trips.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-blue-600" />
            Historial - {vehicle.plate_number}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 py-4">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{totalTrips}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Viajes</p>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{completedTrips}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Completados</p>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">
              {totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 100) : 0}%
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Tasa Éxito</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="trips" className="flex-1">
              <Bus className="h-4 w-4 mr-2" />
              Viajes ({trips.length})
            </TabsTrigger>
            <TabsTrigger value="manifests" className="flex-1">
              <Package className="h-4 w-4 mr-2" />
              Manifiestos (0)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trips" className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No hay viajes registrados</p>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {trips.map((trip) => {
                  const status = tripStatusConfig[trip.status] || tripStatusConfig.scheduled;
                  return (
                    <div
                      key={trip.id}
                      className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{trip.trip_code}</span>
                        <Badge className={status.color}>{status.label}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(trip.trip_date), 'dd/MM/yyyy', { locale: es })}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {trip.scheduled_departure}
                        </div>
                        {trip.transport_routes && (
                          <div className="col-span-2 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {trip.transport_routes.name}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manifests" className="max-h-64 overflow-y-auto">
            <div className="text-center py-8 text-gray-500">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay manifiestos registrados</p>
              <p className="text-xs mt-1">Los manifiestos de despacho aparecerán aquí</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
