'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Route, Navigation, AlertCircle, CheckCircle2 } from 'lucide-react';
import { TransportRoute, TransportStop, RouteInput, transportRoutesService } from '@/lib/services/transportRoutesService';
import { googleMapsService } from '@/lib/services/googleMapsService';

interface RouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route?: TransportRoute | null;
  organizationId: number;
  onSave: (data: RouteInput) => Promise<void>;
}

export function RouteDialog({
  open,
  onOpenChange,
  route,
  organizationId,
  onSave,
}: RouteDialogProps) {
  const isEditing = !!route;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([]);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeCalculated, setRouteCalculated] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [formData, setFormData] = useState<RouteInput>({
    name: '',
    code: '',
    route_type: 'passenger',
    carrier_id: undefined,
    origin_stop_id: undefined,
    destination_stop_id: undefined,
    estimated_distance_km: undefined,
    estimated_duration_minutes: undefined,
    base_fare: undefined,
    base_shipping_fee: undefined,
    currency: 'COP',
    is_active: true,
  });

  useEffect(() => {
    const loadData = async () => {
      const [stopsData, carriersData] = await Promise.all([
        transportRoutesService.getStops(organizationId),
        transportRoutesService.getCarriers(organizationId),
      ]);
      setStops(stopsData);
      setCarriers(carriersData);
    };
    if (open && organizationId) {
      loadData();
    }
  }, [open, organizationId]);

  useEffect(() => {
    if (route) {
      setFormData({
        name: route.name,
        code: route.code,
        route_type: route.route_type,
        carrier_id: route.carrier_id,
        origin_stop_id: route.origin_stop_id,
        destination_stop_id: route.destination_stop_id,
        estimated_distance_km: route.estimated_distance_km,
        estimated_duration_minutes: route.estimated_duration_minutes,
        base_fare: route.base_fare,
        base_shipping_fee: route.base_shipping_fee,
        currency: route.currency || 'COP',
        is_active: route.is_active,
      });
    } else {
      setFormData({
        name: '',
        code: '',
        route_type: 'passenger',
        carrier_id: undefined,
        origin_stop_id: undefined,
        destination_stop_id: undefined,
        estimated_distance_km: undefined,
        estimated_duration_minutes: undefined,
        base_fare: undefined,
        base_shipping_fee: undefined,
        currency: 'COP',
        is_active: true,
      });
    }
  }, [route, open]);

  // Calcular ruta con Google Maps
  const calculateRoute = async () => {
    const originStop = stops.find(s => s.id === formData.origin_stop_id);
    const destStop = stops.find(s => s.id === formData.destination_stop_id);
    
    if (!originStop || !destStop) {
      setRouteError('Selecciona origen y destino con coordenadas válidas');
      return;
    }

    if (!originStop.latitude || !originStop.longitude || !destStop.latitude || !destStop.longitude) {
      setRouteError('Las paradas seleccionadas no tienen coordenadas. Agrega coordenadas primero.');
      return;
    }

    setIsCalculatingRoute(true);
    setRouteError(null);
    setRouteCalculated(false);

    try {
      const result = await googleMapsService.getDirections({
        origin: { lat: originStop.latitude, lng: originStop.longitude },
        destination: { lat: destStop.latitude, lng: destStop.longitude },
        travelMode: 'DRIVING',
      });

      if (result) {
        setFormData(prev => ({
          ...prev,
          estimated_distance_km: result.distance.value / 1000,
          estimated_duration_minutes: Math.ceil(result.duration.value / 60),
          polyline_encoded: result.polyline,
        }));
        setRouteCalculated(true);
      } else {
        setRouteError('No se pudo calcular la ruta. Verifica las direcciones.');
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      setRouteError('Error al calcular la ruta con Google Maps');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving route:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Ruta' : 'Nueva Ruta'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los datos de la ruta' : 'Define una nueva ruta de transporte'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nombre y Código */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Bogotá - Medellín"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="BOG-MDE"
                required
              />
            </div>
          </div>

          {/* Tipo y Transportadora */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de ruta *</Label>
              <Select
                value={formData.route_type}
                onValueChange={(value: 'passenger' | 'cargo' | 'mixed') => 
                  setFormData({ ...formData, route_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passenger">Pasajeros</SelectItem>
                  <SelectItem value="cargo">Carga</SelectItem>
                  <SelectItem value="mixed">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transportadora</Label>
              <Select
                value={formData.carrier_id || '__none__'}
                onValueChange={(value) => 
                  setFormData({ ...formData, carrier_id: value === '__none__' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Origen y Destino */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parada de origen</Label>
              <Select
                value={formData.origin_stop_id || '__none__'}
                onValueChange={(value) => 
                  setFormData({ ...formData, origin_stop_id: value === '__none__' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar origen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin seleccionar</SelectItem>
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      {stop.name} ({stop.city})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Parada de destino</Label>
              <Select
                value={formData.destination_stop_id || '__none__'}
                onValueChange={(value) => 
                  setFormData({ ...formData, destination_stop_id: value === '__none__' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin seleccionar</SelectItem>
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      {stop.name} ({stop.city})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Calcular Ruta con Google Maps */}
          <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Calcular Ruta</Label>
                <p className="text-sm text-gray-500">Calcula distancia y duración con Google Maps</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={calculateRoute}
                disabled={isCalculatingRoute || !formData.origin_stop_id || !formData.destination_stop_id}
              >
                {isCalculatingRoute ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                Calcular
              </Button>
            </div>
            
            {routeError && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {routeError}
              </div>
            )}
            
            {routeCalculated && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Ruta calculada correctamente
              </div>
            )}
          </div>

          {/* Distancia y Duración */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="distance">Distancia estimada (km)</Label>
              <Input
                id="distance"
                type="number"
                step="0.1"
                value={formData.estimated_distance_km || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  estimated_distance_km: e.target.value ? parseFloat(e.target.value) : undefined 
                })}
                placeholder="450.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duración estimada (min)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.estimated_duration_minutes || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  estimated_duration_minutes: e.target.value ? parseInt(e.target.value) : undefined 
                })}
                placeholder="480"
              />
            </div>
          </div>

          {/* Tarifas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base_fare">Tarifa base pasajero</Label>
              <Input
                id="base_fare"
                type="number"
                value={formData.base_fare || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  base_fare: e.target.value ? parseFloat(e.target.value) : undefined 
                })}
                placeholder="50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="base_shipping_fee">Tarifa base envío</Label>
              <Input
                id="base_shipping_fee"
                type="number"
                value={formData.base_shipping_fee || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  base_shipping_fee: e.target.value ? parseFloat(e.target.value) : undefined 
                })}
                placeholder="15000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Moneda</Label>
              <Input
                id="currency"
                value={formData.currency || 'COP'}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                placeholder="COP"
                maxLength={3}
              />
            </div>
          </div>

          {/* Estado activo */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label>Estado de la ruta</Label>
              <p className="text-sm text-gray-500">Las rutas inactivas no aparecen en la programación</p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.code}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Ruta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
