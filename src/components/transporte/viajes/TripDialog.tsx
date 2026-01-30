'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { TripWithDetails } from '@/lib/services/tripsService';

interface Route {
  id: string;
  name: string;
  code: string;
}

interface Vehicle {
  id: string;
  plate: string;
  passenger_capacity?: number;
}

interface Driver {
  id: string;
  name: string;
}

interface Branch {
  id: number;
  name: string;
}

interface TripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip?: TripWithDetails | null;
  routes: Route[];
  vehicles: Vehicle[];
  drivers: Driver[];
  branches: Branch[];
  onSave: (data: Partial<TripWithDetails>) => Promise<void>;
}

export function TripDialog({
  open,
  onOpenChange,
  trip,
  routes,
  vehicles,
  drivers,
  branches,
  onSave,
}: TripDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    route_id: '',
    trip_date: '',
    scheduled_departure: '',
    scheduled_arrival: '',
    vehicle_id: '',
    driver_id: '',
    branch_id: '',
    total_seats: 0,
    base_fare: 0,
    currency: 'COP',
    notes: '',
  });

  useEffect(() => {
    if (trip) {
      setFormData({
        route_id: trip.route_id || '',
        trip_date: trip.trip_date || '',
        scheduled_departure: trip.scheduled_departure ? trip.scheduled_departure.substring(11, 16) : '',
        scheduled_arrival: trip.scheduled_arrival ? trip.scheduled_arrival.substring(11, 16) : '',
        vehicle_id: trip.vehicle_id || '',
        driver_id: trip.driver_id || '',
        branch_id: trip.branch_id?.toString() || '',
        total_seats: trip.total_seats || 0,
        base_fare: trip.base_fare || 0,
        currency: trip.currency || 'COP',
        notes: trip.notes || '',
      });
    } else {
      const today = new Date().toISOString().split('T')[0];
      setFormData({
        route_id: '',
        trip_date: today,
        scheduled_departure: '08:00',
        scheduled_arrival: '',
        vehicle_id: '',
        driver_id: '',
        branch_id: '',
        total_seats: 40,
        base_fare: 0,
        currency: 'COP',
        notes: '',
      });
    }
  }, [trip, open]);

  const handleVehicleChange = (vehicleId: string) => {
    setFormData((prev) => ({ ...prev, vehicle_id: vehicleId }));
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (vehicle?.passenger_capacity && !trip) {
      setFormData((prev) => ({ ...prev, total_seats: vehicle.passenger_capacity || 40 }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.route_id || !formData.trip_date || !formData.scheduled_departure) {
      return;
    }

    setLoading(true);
    try {
      const departureDateTime = `${formData.trip_date}T${formData.scheduled_departure}:00`;
      const arrivalDateTime = formData.scheduled_arrival
        ? `${formData.trip_date}T${formData.scheduled_arrival}:00`
        : undefined;

      await onSave({
        route_id: formData.route_id,
        trip_date: formData.trip_date,
        scheduled_departure: departureDateTime,
        scheduled_arrival: arrivalDateTime,
        vehicle_id: formData.vehicle_id || undefined,
        driver_id: formData.driver_id || undefined,
        branch_id: formData.branch_id ? parseInt(formData.branch_id) : undefined,
        total_seats: formData.total_seats,
        available_seats: trip ? undefined : formData.total_seats,
        base_fare: formData.base_fare,
        currency: formData.currency,
        notes: formData.notes || undefined,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {trip ? 'Editar Viaje' : 'Nuevo Viaje'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Ruta */}
          <div className="grid gap-2">
            <Label htmlFor="route">Ruta *</Label>
            <Select
              value={formData.route_id}
              onValueChange={(v) => setFormData((p) => ({ ...p, route_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar ruta" />
              </SelectTrigger>
              <SelectContent>
                {routes.map((route) => (
                  <SelectItem key={route.id} value={route.id}>
                    {route.code} - {route.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha y horarios */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="trip_date">Fecha *</Label>
              <Input
                id="trip_date"
                type="date"
                value={formData.trip_date}
                onChange={(e) => setFormData((p) => ({ ...p, trip_date: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="departure">Hora Salida *</Label>
              <Input
                id="departure"
                type="time"
                value={formData.scheduled_departure}
                onChange={(e) => setFormData((p) => ({ ...p, scheduled_departure: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="arrival">Hora Llegada</Label>
              <Input
                id="arrival"
                type="time"
                value={formData.scheduled_arrival}
                onChange={(e) => setFormData((p) => ({ ...p, scheduled_arrival: e.target.value }))}
              />
            </div>
          </div>

          {/* Vehículo y Conductor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="vehicle">Vehículo</Label>
              <Select
                value={formData.vehicle_id || '__none__'}
                onValueChange={(v) => handleVehicleChange(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar vehículo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate} ({v.passenger_capacity || 0} asientos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driver">Conductor</Label>
              <Select
                value={formData.driver_id || '__none__'}
                onValueChange={(v) => setFormData((p) => ({ ...p, driver_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar conductor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sucursal */}
          {branches.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="branch">Sucursal</Label>
              <Select
                value={formData.branch_id || '__none__'}
                onValueChange={(v) => setFormData((p) => ({ ...p, branch_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Capacidad y Tarifa */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="total_seats">Total Asientos</Label>
              <Input
                id="total_seats"
                type="number"
                min={1}
                value={formData.total_seats}
                onChange={(e) => setFormData((p) => ({ ...p, total_seats: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="base_fare">Tarifa Base</Label>
              <Input
                id="base_fare"
                type="number"
                min={0}
                step={100}
                value={formData.base_fare}
                onChange={(e) => setFormData((p) => ({ ...p, base_fare: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Moneda</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setFormData((p) => ({ ...p, currency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notas */}
          <div className="grid gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              placeholder="Notas adicionales del viaje..."
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !formData.route_id || !formData.trip_date}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {trip ? 'Guardar Cambios' : 'Crear Viaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
