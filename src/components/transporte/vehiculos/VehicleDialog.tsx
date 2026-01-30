'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { Vehicle, TransportCarrier } from '@/lib/services/transportService';

const vehicleSchema = z.object({
  plate_number: z.string().min(1, 'La placa es requerida'),
  vehicle_type: z.enum(['motorcycle', 'car', 'van', 'truck', 'minibus', 'bus']),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().optional(),
  color: z.string().optional(),
  capacity_kg: z.coerce.number().optional(),
  capacity_m3: z.coerce.number().optional(),
  capacity_seats: z.coerce.number().optional(),
  fuel_type: z.string().optional(),
  vin: z.string().optional(),
  soat_expiry: z.string().optional(),
  tech_review_expiry: z.string().optional(),
  insurance_expiry: z.string().optional(),
  insurance_policy: z.string().optional(),
  carrier_id: z.string().optional(),
  branch_id: z.coerce.number().optional(),
  status: z.enum(['available', 'in_use', 'maintenance', 'inactive']),
  is_active: z.boolean(),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

interface VehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
  carriers: TransportCarrier[];
  branches: { id: number; name: string }[];
  onSave: (data: Partial<Vehicle>) => Promise<void>;
  isSaving?: boolean;
}

export function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
  carriers,
  branches,
  onSave,
  isSaving,
}: VehicleDialogProps) {
  const isEditing = !!vehicle;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate_number: '',
      vehicle_type: 'car',
      brand: '',
      model: '',
      year: undefined,
      color: '',
      capacity_kg: undefined,
      capacity_m3: undefined,
      capacity_seats: undefined,
      fuel_type: '',
      vin: '',
      soat_expiry: '',
      tech_review_expiry: '',
      insurance_expiry: '',
      insurance_policy: '',
      carrier_id: '',
      branch_id: undefined,
      status: 'available',
      is_active: true,
    },
  });

  useEffect(() => {
    if (vehicle) {
      reset({
        plate_number: vehicle.plate_number,
        vehicle_type: vehicle.vehicle_type,
        brand: vehicle.brand || '',
        model: vehicle.model || '',
        year: vehicle.year,
        color: vehicle.color || '',
        capacity_kg: vehicle.capacity_kg,
        capacity_m3: vehicle.capacity_m3,
        capacity_seats: vehicle.capacity_seats,
        fuel_type: vehicle.fuel_type || '',
        vin: vehicle.vin || '',
        soat_expiry: vehicle.soat_expiry || '',
        tech_review_expiry: vehicle.tech_review_expiry || '',
        insurance_expiry: vehicle.insurance_expiry || '',
        insurance_policy: vehicle.insurance_policy || '',
        carrier_id: vehicle.carrier_id || '',
        branch_id: vehicle.branch_id,
        status: vehicle.status,
        is_active: vehicle.is_active,
      });
    } else {
      reset({
        plate_number: '',
        vehicle_type: 'car',
        brand: '',
        model: '',
        year: undefined,
        color: '',
        capacity_kg: undefined,
        capacity_m3: undefined,
        capacity_seats: undefined,
        fuel_type: '',
        vin: '',
        soat_expiry: '',
        tech_review_expiry: '',
        insurance_expiry: '',
        insurance_policy: '',
        carrier_id: '',
        branch_id: undefined,
        status: 'available',
        is_active: true,
      });
    }
  }, [vehicle, reset]);

  const onSubmit = async (data: VehicleFormData) => {
    const cleanData = {
      ...data,
      carrier_id: data.carrier_id || null,
      branch_id: data.branch_id || null,
    };
    await onSave(cleanData);
  };

  const vehicleType = watch('vehicle_type');
  const status = watch('status');
  const carrierId = watch('carrier_id');
  const branchId = watch('branch_id');
  const isActive = watch('is_active');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Vehículo' : 'Nuevo Vehículo'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plate_number">Placa *</Label>
              <Input
                id="plate_number"
                {...register('plate_number')}
                placeholder="ABC-123"
              />
              {errors.plate_number && (
                <p className="text-sm text-red-500">{errors.plate_number.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vehicle_type">Tipo</Label>
              <Select
                value={vehicleType}
                onValueChange={(v) => setValue('vehicle_type', v as 'motorcycle' | 'car' | 'van' | 'truck' | 'minibus' | 'bus')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="motorcycle">Moto</SelectItem>
                  <SelectItem value="car">Auto</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
                  <SelectItem value="truck">Camión</SelectItem>
                  <SelectItem value="minibus">Minibús</SelectItem>
                  <SelectItem value="bus">Bus</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={status}
                onValueChange={(v) => setValue('status', v as 'available' | 'in_use' | 'maintenance' | 'inactive')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="in_use">En uso</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" {...register('brand')} placeholder="Toyota" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Input id="model" {...register('model')} placeholder="Hilux" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Año</Label>
              <Input id="year" type="number" {...register('year')} placeholder="2023" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" {...register('color')} placeholder="Blanco" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel_type">Combustible</Label>
              <Input id="fuel_type" {...register('fuel_type')} placeholder="Gasolina" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vin">VIN / Chasis</Label>
              <Input id="vin" {...register('vin')} placeholder="1HGBH41JXMN109186" />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Capacidad</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="capacity_kg">Carga máx. (kg)</Label>
                <Input id="capacity_kg" type="number" {...register('capacity_kg')} placeholder="1000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity_m3">Volumen (m³)</Label>
                <Input id="capacity_m3" type="number" step="0.1" {...register('capacity_m3')} placeholder="10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity_seats">Pasajeros</Label>
                <Input id="capacity_seats" type="number" {...register('capacity_seats')} placeholder="40" />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Documentos</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="soat_expiry">Vencimiento SOAT</Label>
                <Input id="soat_expiry" type="date" {...register('soat_expiry')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tech_review_expiry">Venc. Revisión Técnica</Label>
                <Input id="tech_review_expiry" type="date" {...register('tech_review_expiry')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance_expiry">Vencimiento Seguro</Label>
                <Input id="insurance_expiry" type="date" {...register('insurance_expiry')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance_policy">Póliza de Seguro</Label>
                <Input id="insurance_policy" {...register('insurance_policy')} placeholder="POL-123456" />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Asignación</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="carrier_id">Transportadora</Label>
                <Select
                  value={carrierId || 'none'}
                  onValueChange={(v) => setValue('carrier_id', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {carriers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">Sucursal</Label>
                <Select
                  value={branchId?.toString() || 'none'}
                  onValueChange={(v) => setValue('branch_id', v === 'none' ? undefined : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={(v) => setValue('is_active', v)}
              />
              <Label htmlFor="is_active">Vehículo activo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Vehículo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
