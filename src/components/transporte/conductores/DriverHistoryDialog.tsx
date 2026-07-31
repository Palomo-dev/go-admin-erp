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
import { DriverCredential, Trip } from '@/lib/services/transportService';
import { 
  Loader2, 
  User,
  MapPin,
  Calendar,
  Truck,
  Clock,
  Route,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DriverHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverCredential | null;
  trips: Trip[];
  isLoading?: boolean;
}

const tripStatusLabels: Record<string, string> = {
  scheduled: 'Programado',
  boarding: 'Abordando',
  in_transit: 'En tránsito',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const tripStatusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  boarding: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  in_transit: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export function DriverHistoryDialog({
  open,
  onOpenChange,
  driver,
  trips,
  isLoading,
}: DriverHistoryDialogProps) {
  const [activeTab, setActiveTab] = useState('trips');

  if (!driver) return null;

  const profile = driver.employments?.organization_members?.profiles;
  const fullName = profile 
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
    : driver.license_number;

  const completedTrips = trips.filter(t => t.status === 'completed').length;
  const totalTrips = trips.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-blue-600" />
            Historial del Conductor
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
          <div className="p-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <User className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-white">
              {fullName}
            </p>
            <p className="text-sm text-gray-500">
              Licencia: {driver.license_number} • Cat. {driver.license_category}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{completedTrips}</p>
            <p className="text-xs text-gray-500">viajes completados</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trips" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Viajes ({totalTrips})
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Estadísticas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trips" className="flex-1 overflow-auto mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No hay viajes registrados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={tripStatusColors[trip.status] || ''}>
                          {tripStatusLabels[trip.status] || trip.status}
                        </Badge>
                        {trip.transport_routes?.name && (
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {trip.transport_routes.name}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {trip.trip_code}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <p className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(trip.trip_date), 'dd MMM yyyy', { locale: es })}
                      </p>
                      {trip.scheduled_departure && (
                        <p className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {trip.scheduled_departure}
                        </p>
                      )}
                    </div>
                    
                    {trip.transport_routes && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-blue-500" />
                          Ruta: {trip.transport_routes.name}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="flex-1 overflow-auto mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                <p className="text-3xl font-bold text-blue-600">{totalTrips}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total viajes</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                <p className="text-3xl font-bold text-green-600">{completedTrips}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Completados</p>
              </div>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                <p className="text-3xl font-bold text-yellow-600">
                  {trips.filter(t => t.status === 'in_transit' || t.status === 'boarding').length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">En curso</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                <p className="text-3xl font-bold text-red-600">
                  {trips.filter(t => t.status === 'cancelled').length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Cancelados</p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium mb-2">Información del conductor</h4>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <p><strong>Licencia:</strong> {driver.license_number}</p>
                <p><strong>Categoría:</strong> {driver.license_category}</p>
                <p><strong>Vencimiento:</strong> {format(new Date(driver.license_expiry), 'dd/MM/yyyy')}</p>
                {driver.certifications && driver.certifications.length > 0 && (
                  <div className="pt-1">
                    <p className="font-medium">Certificaciones:</p>
                    {driver.certifications.map((cert, i) => (
                      <p key={i}>✓ {cert}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
