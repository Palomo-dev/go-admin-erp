'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Car,
  Bike,
  Truck,
  Clock,
  DollarSign,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { ParkingRateDialog, type ParkingRate } from './ParkingRateDialog';

interface ParkingRatesTabProps {
  organizationId: number;
}

const VEHICLE_ICONS: Record<string, React.ElementType> = {
  car: Car,
  motorcycle: Bike,
  truck: Truck,
};

const VEHICLE_LABELS: Record<string, string> = {
  car: 'Automóvil',
  motorcycle: 'Motocicleta',
  truck: 'Camión',
};

const UNIT_LABELS: Record<string, string> = {
  minute: 'minuto',
  hour: 'hora',
  day: 'día',
  week: 'semana',
  month: 'mes',
  year: 'año',
};

export function ParkingRatesTab({ organizationId }: ParkingRatesTabProps) {
  const { toast } = useToast();
  const [rates, setRates] = useState<ParkingRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedRate, setSelectedRate] = useState<ParkingRate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rateToDelete, setRateToDelete] = useState<ParkingRate | null>(null);

  useEffect(() => {
    if (organizationId) {
      loadRates();
    }
  }, [organizationId]);

  const loadRates = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('parking_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .order('vehicle_type')
        .order('unit');

      if (error) throw error;
      setRates(data || []);
    } catch (error) {
      console.error('Error cargando tarifas de parking:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tarifas de parking.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewRate = () => {
    setSelectedRate(null);
    setShowDialog(true);
  };

  const handleEdit = (rate: ParkingRate) => {
    setSelectedRate(rate);
    setShowDialog(true);
  };

  const handleDeleteClick = (rate: ParkingRate) => {
    setRateToDelete(rate);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!rateToDelete) return;

    try {
      const { error } = await supabase
        .from('parking_rates')
        .delete()
        .eq('id', rateToDelete.id);

      if (error) throw error;

      toast({
        title: 'Tarifa eliminada',
        description: 'La tarifa se eliminó correctamente.',
      });
      await loadRates();
    } catch (error) {
      console.error('Error eliminando tarifa:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarifa.',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setRateToDelete(null);
    }
  };

  const handleSave = async (data: Omit<ParkingRate, 'id' | 'created_at'>) => {
    try {
      if (selectedRate) {
        const { error } = await supabase
          .from('parking_rates')
          .update({
            rate_name: data.rate_name,
            vehicle_type: data.vehicle_type,
            unit: data.unit,
            price: data.price,
            grace_period_min: data.grace_period_min,
          })
          .eq('id', selectedRate.id);

        if (error) throw error;

        toast({
          title: 'Tarifa actualizada',
          description: 'La tarifa se actualizó correctamente.',
        });
      } else {
        const { error } = await supabase
          .from('parking_rates')
          .insert({
            organization_id: organizationId,
            rate_name: data.rate_name,
            vehicle_type: data.vehicle_type,
            unit: data.unit,
            price: data.price,
            grace_period_min: data.grace_period_min,
          });

        if (error) throw error;

        toast({
          title: 'Tarifa creada',
          description: 'La nueva tarifa se creó correctamente.',
        });
      }

      await loadRates();
    } catch (error: any) {
      console.error('Error guardando tarifa:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo guardar la tarifa.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Tarifas de Estacionamiento
          </h3>
          <p className="text-sm text-gray-500">
            Configura las tarifas según tipo de vehículo y unidad de tiempo.
          </p>
        </div>
        <Button onClick={handleNewRate}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Tarifa
        </Button>
      </div>

      {rates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No hay tarifas configuradas
            </h3>
            <p className="text-gray-500 text-center mb-4">
              Crea tu primera tarifa de estacionamiento para comenzar a cobrar.
            </p>
            <Button onClick={handleNewRate}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primera Tarifa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rates.map((rate) => {
            const VehicleIcon = VEHICLE_ICONS[rate.vehicle_type] || Car;
            return (
              <Card key={rate.id} className="relative">
                <CardContent className="pt-6">
                  <div className="absolute top-2 right-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(rate)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(rate)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <VehicleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {rate.rate_name}
                      </h4>
                      <Badge variant="outline" className="mt-1">
                        {VEHICLE_LABELS[rate.vehicle_type] || rate.vehicle_type}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-500">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-sm">Precio</span>
                      </div>
                      <span className="font-bold text-lg text-gray-900 dark:text-gray-100">
                        ${rate.price.toLocaleString()}/{UNIT_LABELS[rate.unit]}
                      </span>
                    </div>

                    {rate.grace_period_min && rate.grace_period_min > 0 && (
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Clock className="h-4 w-4" />
                          <span className="text-sm">Gracia</span>
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {rate.grace_period_min} min
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ParkingRateDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        rate={selectedRate}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la tarifa &quot;
              {rateToDelete?.rate_name}&quot; permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
