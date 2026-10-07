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
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Truck, User, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  deliveryIntegrationService,
  type DeliveryVehicle,
  type DeliveryDriver,
} from '@/lib/services/deliveryIntegrationService';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('pedidoWeb');
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
        setError(t('assignDeliveryDialog.noHayVehiculosDisponibles'));
      }
      if (driversData.length === 0) {
        setError(t('assignDeliveryDialog.noHayConductoresDisponibles'));
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(t('assignDeliveryDialog.errorCargarDatosVehiculos'));
    } finally {
      setLoadingData(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedVehicle || !selectedDriver) {
      toast({
        title: t('assignDeliveryDialog.camposRequeridos'),
        description: t('assignDeliveryDialog.seleccionaVehiculoConductor'),
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
          title: t('assignDeliveryDialog.error'),
          description: t('assignDeliveryDialog.noEncontroEnvioAsociado'),
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
        title: t('assignDeliveryDialog.asignacionExitosa'),
        description: t('assignDeliveryDialog.haAsignadoConductorVehiculo'),
      });

      onOpenChange(false);
      onAssigned?.();
    } catch (err) {
      console.error('Error assigning delivery:', err);
      toast({
        title: t('assignDeliveryDialog.error'),
        description: t('assignDeliveryDialog.noPudoAsignarDelivery'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getVehicleTypeLabel = (type: string) => {
    return t.has(`assignDeliveryDialog.vehiculos.${type}`) ? t(`assignDeliveryDialog.vehiculos.${type}`) : type;
  };

  const getVehicleIcon = (type: string) => {
    return <Truck className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-gray-100">
            <Truck className="h-5 w-5 dark:text-gray-300" />
            {t('assignDeliveryDialog.asignarDelivery')}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {t('assignDeliveryDialog.seleccionaVehiculoConductorEntrega')}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="py-8 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error && vehicles.length === 0 && drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-yellow-500 dark:text-yellow-400 mb-3" />
            <p className="text-sm text-muted-foreground dark:text-gray-300">{error}</p>
            <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
              {t('assignDeliveryDialog.configuraVehiculosConductoresModulo')}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Selección de Vehículo */}
            <div className="space-y-2">
              <Label htmlFor="vehicle" className="dark:text-gray-200">{t('assignDeliveryDialog.vehiculo')}</Label>
              <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                <SelectTrigger id="vehicle">
                  <SelectValue placeholder={t('assignDeliveryDialog.seleccionarVehiculo')} />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      <div className="flex items-center gap-2">
                        {getVehicleIcon(vehicle.vehicle_type)}
                        <span className="font-medium dark:text-gray-100">{vehicle.plate}</span>
                        <Badge variant="outline" className="text-xs dark:text-gray-100 dark:border-gray-600">
                          {getVehicleTypeLabel(vehicle.vehicle_type)}
                        </Badge>
                        {vehicle.brand && vehicle.model && (
                          <span className="text-muted-foreground dark:text-gray-400 text-xs">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicles.length === 0 && (
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  {t('assignDeliveryDialog.noHayVehiculosDisponibles2')}
                </p>
              )}
            </div>

            {/* Selección de Conductor */}
            <div className="space-y-2">
              <Label htmlFor="driver" className="dark:text-gray-200">{t('assignDeliveryDialog.conductor')}</Label>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger id="driver">
                  <SelectValue placeholder={t('assignDeliveryDialog.seleccionarConductor')} />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 dark:text-gray-400" />
                        <span className="dark:text-gray-100">
                          {driver.employee
                            ? `${driver.employee.first_name} ${driver.employee.last_name}`
                            : t('assignDeliveryDialog.conductor2', { license_number: driver.license_number })}
                        </span>
                        <span className="text-xs text-muted-foreground dark:text-gray-400">
                          {t('assignDeliveryDialog.lic', { license_category: driver.license_category })}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {drivers.length === 0 && (
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  {t('assignDeliveryDialog.noHayConductoresDisponibles')}
                </p>
              )}
            </div>

            {/* Tiempo estimado */}
            <div className="space-y-2">
              <Label htmlFor="estimated-time" className="flex items-center gap-2 dark:text-gray-200">
                <Clock className="h-4 w-4 dark:text-gray-400" />
                {t('assignDeliveryDialog.tiempoEstimadoEntregaMinutos')}
              </Label>
              <Input
                id="estimated-time"
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                min={5}
                max={180}
              />
              <p className="text-xs text-muted-foreground dark:text-gray-400">
                {t('assignDeliveryDialog.llegadaEstimada', { localeTimeString: new Date(Date.now() + estimatedMinutes * 60000).toLocaleTimeString(
                  'es-CO',
                  { hour: '2-digit', minute: '2-digit' }
                ) })}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-gray-600">
            {t('ficha.cancelar')}
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading || loadingData || !selectedVehicle || !selectedDriver}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('assignDeliveryDialog.asignarDelivery')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
