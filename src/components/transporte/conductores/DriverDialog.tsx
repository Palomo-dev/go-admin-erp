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
import { DriverCredential } from '@/lib/services/transportService';

const driverSchema = z.object({
  employment_id: z.string().min(1, 'Selecciona un empleado'),
  license_number: z.string().min(1, 'El número de licencia es requerido'),
  license_category: z.string().min(1, 'La categoría es requerida'),
  license_expiry: z.string().min(1, 'La fecha de vencimiento es requerida'),
  medical_cert_expiry: z.string().optional(),
  certifications: z.string().optional(),
  is_active_driver: z.boolean(),
});

type DriverFormData = z.infer<typeof driverSchema>;

interface DriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: DriverCredential | null;
  employees: { id: string; name: string; email: string }[];
  onSave: (data: Partial<DriverCredential>) => Promise<void>;
  isSaving?: boolean;
}

export function DriverDialog({
  open,
  onOpenChange,
  driver,
  employees,
  onSave,
  isSaving,
}: DriverDialogProps) {
  const isEditing = !!driver;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DriverFormData>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      employment_id: '',
      license_number: '',
      license_category: 'B1',
      license_expiry: '',
      medical_cert_expiry: '',
      certifications: '',
      is_active_driver: true,
    },
  });

  useEffect(() => {
    if (driver) {
      reset({
        employment_id: driver.employment_id,
        license_number: driver.license_number,
        license_category: driver.license_category,
        license_expiry: driver.license_expiry,
        medical_cert_expiry: driver.medical_cert_expiry || '',
        certifications: driver.certifications?.join(', ') || '',
        is_active_driver: driver.is_active_driver,
      });
    } else {
      reset({
        employment_id: '',
        license_number: '',
        license_category: 'B1',
        license_expiry: '',
        medical_cert_expiry: '',
        certifications: '',
        is_active_driver: true,
      });
    }
  }, [driver, reset]);

  const onSubmit = async (data: DriverFormData) => {
    const certArray = data.certifications
      ? data.certifications.split(',').map(c => c.trim()).filter(Boolean)
      : [];
    
    await onSave({
      employment_id: data.employment_id,
      license_number: data.license_number,
      license_category: data.license_category,
      license_expiry: data.license_expiry,
      medical_cert_expiry: data.medical_cert_expiry || null,
      certifications: certArray.length > 0 ? certArray : null,
      is_active_driver: data.is_active_driver,
    } as Partial<DriverCredential>);
  };

  const employmentId = watch('employment_id');
  const isActiveDriver = watch('is_active_driver');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Conductor' : 'Nuevo Conductor'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employment_id">Empleado *</Label>
            <Select
              value={employmentId}
              onValueChange={(v) => setValue('employment_id', v)}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un empleado" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} ({emp.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employment_id && (
              <p className="text-sm text-red-500">{errors.employment_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="license_number">Número de Licencia *</Label>
              <Input
                id="license_number"
                {...register('license_number')}
                placeholder="123456789"
              />
              {errors.license_number && (
                <p className="text-sm text-red-500">{errors.license_number.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="license_category">Categoría *</Label>
              <Select
                value={watch('license_category')}
                onValueChange={(v) => setValue('license_category', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A1">A1 - Moto hasta 125cc</SelectItem>
                  <SelectItem value="A2">A2 - Moto</SelectItem>
                  <SelectItem value="B1">B1 - Auto particular</SelectItem>
                  <SelectItem value="B2">B2 - Camión hasta 3.5t</SelectItem>
                  <SelectItem value="B3">B3 - Camión más de 3.5t</SelectItem>
                  <SelectItem value="C1">C1 - Taxi/Servicio público</SelectItem>
                  <SelectItem value="C2">C2 - Bus pequeño</SelectItem>
                  <SelectItem value="C3">C3 - Bus/Buseta</SelectItem>
                </SelectContent>
              </Select>
              {errors.license_category && (
                <p className="text-sm text-red-500">{errors.license_category.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="license_expiry">Vencimiento Licencia *</Label>
              <Input
                id="license_expiry"
                type="date"
                {...register('license_expiry')}
              />
              {errors.license_expiry && (
                <p className="text-sm text-red-500">{errors.license_expiry.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="medical_cert_expiry">Venc. Examen Médico</Label>
              <Input
                id="medical_cert_expiry"
                type="date"
                {...register('medical_cert_expiry')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="certifications">Certificaciones</Label>
            <Input
              id="certifications"
              {...register('certifications')}
              placeholder="Matpel, Primeros Auxilios, Defensivo..."
            />
            <p className="text-xs text-gray-500">
              Separa las certificaciones con comas
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active_driver"
                checked={isActiveDriver}
                onCheckedChange={(v) => setValue('is_active_driver', v)}
              />
              <Label htmlFor="is_active_driver">Conductor activo</Label>
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
              {isEditing ? 'Guardar Cambios' : 'Crear Conductor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
