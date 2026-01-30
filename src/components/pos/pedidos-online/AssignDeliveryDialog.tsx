'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Truck, User, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  deliveryIntegrationService,
  type DeliveryVehicle,
  type DeliveryDriver,
} from '@/lib/services/deliveryIntegrationService';

interface AssignDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webOrderId: string;
  organizationId: number;
  onAssigned?: () => void;
}

export function AssignDeliveryDialog({
  open,
  onOpenChange,
  webOrderId,
  organizationId,
  onAssigned,
}: AssignDeliveryDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [vehicles, setVehicles] = useState<DeliveryVehicle[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);

  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);

  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && organizationId) {
      loadData();
    }
  }, [open, organizationId, webOrderId]);

  const loadData = async () => {
    setLoadingData(true);
    setError(null);
    try {
      // Primero verificar/crear el shipment
      const shipment = await deliveryIntegrationService.getShipmentByWebOrderId(webOrderId);
      
      if (shipment) {
        setShipmentId(shipment.id);
        // Si ya está asignado, precargar datos
        if (shipment.metadata?.vehicle_id) {
          setSelectedVehicle(shipment.metadata.vehicle_id as string);
        }
        if (shipment.metadata?.driver_id) {
          setSelectedDriver(shipment.metadata.driver_id as string);
        }
      }

      // Cargar vehículos y conductores disponibles
      const [vehiclesData, driversData] = await Promise.all([
        deliveryIntegrationService.getAvailableVehicles(organizationId),
        deliveryIntegrationService.getAvailableDrivers(organizationId),
      ]);

      setVehicles(vehiclesData);
      setDrivers(driversData);

      if (vehiclesData.length === 0) {
        setError('No hay vehículos disponibles para delivery');
      }
      if (driversData.length === 0) {
        setError('No hay conductores disponibles');
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error al cargar datos de vehículos y conductores');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedVehicle || !selectedDriver) {
      toast({
        title: 'Campos requeridos',
        description: 'Selecciona un vehículo y un conductor',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      let currentShipmentId = shipmentId;

      // Si no existe shipment, necesitamos el web order completo para crearlo
      if (!currentShipmentId) {
        toast({
          title: 'Error',
          description: 'No se encontró el envío asociado. Intenta marcar el pedido como listo primero.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Calcular tiempo estimado de entrega
      const estimatedDeliveryTime = new Date(
        Date.now() + estimatedMinutes * 60000
      ).toISOString();

      // Asignar vehículo y conductor
      await deliveryIntegrationService.assignVehicleAndDriver(
        currentShipmentId,
        selectedVehicle,
        selectedDriver,
        estimatedDeliveryTime
      );

      toast({
        title: 'Asignación exitosa',
        description: 'Se ha asignado el conductor y vehículo al pedido',
      });

      onOpenChange(false);
      onAssigned?.();
    } catch (err) {
      console.error('Error assigning delivery:', err);
      toast({
        title: 'Error',
        description: 'No se pudo asignar el delivery',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getVehicleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      motorcycle: 'Moto',
      car: 'Carro',
      van: 'Van',
      bicycle: 'Bicicleta',
      truck: 'Camión',
    };
    return labels[type] || type;
  };

  const getVehicleIcon = (type: string) => {
    return <Truck className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Asignar Delivery
          </DialogTitle>
          <DialogDescription>
            Selecciona el vehículo y conductor para la entrega
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error && vehicles.length === 0 && drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-yellow-500 mb-3" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Configura vehículos y conductores en el módulo de Transporte
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Selección de Vehículo */}
            <div className="space-y-2">
              <Label htmlFor="vehicle">Vehículo</Label>
              <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                <SelectTrigger id="vehicle">
                  <SelectValue placeholder="Seleccionar vehículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      <div className="flex items-center gap-2">
                        {getVehicleIcon(vehicle.vehicle_type)}
                        <span className="font-medium">{vehicle.plate}</span>
                        <Badge variant="outline" className="text-xs">
                          {getVehicleTypeLabel(vehicle.vehicle_type)}
                        </Badge>
                        {vehicle.brand && vehicle.model && (
                          <span className="text-muted-foreground text-xs">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay vehículos disponibles
                </p>
              )}
            </div>

            {/* Selección de Conductor */}
            <div className="space-y-2">
              <Label htmlFor="driver">Conductor</Label>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger id="driver">
                  <SelectValue placeholder="Seleccionar conductor" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>
                          {driver.employee
                            ? `${driver.employee.first_name} ${driver.employee.last_name}`
                            : `Conductor ${driver.license_number}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Lic: {driver.license_category}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {drivers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay conductores disponibles
                </p>
              )}
            </div>

            {/* Tiempo estimado */}
            <div className="space-y-2">
              <Label htmlFor="estimated-time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tiempo estimado de entrega (minutos)
              </Label>
              <Input
                id="estimated-time"
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                min={5}
                max={180}
              />
              <p className="text-xs text-muted-foreground">
                Llegada estimada:{' '}
                {new Date(Date.now() + estimatedMinutes * 60000).toLocaleTimeString(
                  'es-CO',
                  { hour: '2-digit', minute: '2-digit' }
                )}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading || loadingData || !selectedVehicle || !selectedDriver}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Asignar Delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
