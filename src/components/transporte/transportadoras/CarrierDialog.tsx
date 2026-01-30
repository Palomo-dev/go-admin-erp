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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { TransportCarrier } from '@/lib/services/transportService';

const carrierSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  carrier_type: z.enum(['own_fleet', 'third_party']),
  service_type: z.enum(['cargo', 'passenger', 'both']),
  tax_id: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  api_provider: z.string().optional(),
  tracking_url_template: z.string().optional(),
  is_active: z.boolean(),
});

type CarrierFormData = z.infer<typeof carrierSchema>;

interface CarrierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier?: TransportCarrier | null;
  onSave: (data: Partial<TransportCarrier>) => Promise<void>;
  isSaving?: boolean;
}

export function CarrierDialog({
  open,
  onOpenChange,
  carrier,
  onSave,
  isSaving,
}: CarrierDialogProps) {
  const isEditing = !!carrier;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CarrierFormData>({
    resolver: zodResolver(carrierSchema),
    defaultValues: {
      code: '',
      name: '',
      carrier_type: 'own_fleet',
      service_type: 'cargo',
      tax_id: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      address: '',
      city: '',
      api_provider: '',
      tracking_url_template: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (carrier) {
      reset({
        code: carrier.code,
        name: carrier.name,
        carrier_type: carrier.carrier_type,
        service_type: carrier.service_type,
        tax_id: carrier.tax_id || '',
        contact_name: carrier.contact_name || '',
        contact_phone: carrier.contact_phone || '',
        contact_email: carrier.contact_email || '',
        address: carrier.address || '',
        city: carrier.city || '',
        api_provider: carrier.api_provider || '',
        tracking_url_template: carrier.tracking_url_template || '',
        is_active: carrier.is_active,
      });
    } else {
      reset({
        code: '',
        name: '',
        carrier_type: 'own_fleet',
        service_type: 'cargo',
        tax_id: '',
        contact_name: '',
        contact_phone: '',
        contact_email: '',
        address: '',
        city: '',
        api_provider: '',
        tracking_url_template: '',
        is_active: true,
      });
    }
  }, [carrier, reset]);

  const onSubmit = async (data: CarrierFormData) => {
    await onSave(data);
  };

  const carrierType = watch('carrier_type');
  const serviceType = watch('service_type');
  const isActive = watch('is_active');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Transportadora' : 'Nueva Transportadora'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                {...register('code')}
                placeholder="TRANS-001"
              />
              {errors.code && (
                <p className="text-sm text-red-500">{errors.code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="Transportes ABC"
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="carrier_type">Tipo de Transportadora</Label>
              <Select
                value={carrierType}
                onValueChange={(v) => setValue('carrier_type', v as 'own_fleet' | 'third_party')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own_fleet">Flota Propia</SelectItem>
                  <SelectItem value="third_party">Tercero</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service_type">Tipo de Servicio</Label>
              <Select
                value={serviceType}
                onValueChange={(v) => setValue('service_type', v as 'cargo' | 'passenger' | 'both')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cargo">Carga</SelectItem>
                  <SelectItem value="passenger">Pasajeros</SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_id">NIT / Identificación Fiscal</Label>
              <Input
                id="tax_id"
                {...register('tax_id')}
                placeholder="900123456-7"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_name">Nombre de Contacto</Label>
              <Input
                id="contact_name"
                {...register('contact_name')}
                placeholder="Juan Pérez"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_phone">Teléfono de Contacto</Label>
              <Input
                id="contact_phone"
                {...register('contact_phone')}
                placeholder="+57 300 123 4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Email de Contacto</Label>
              <Input
                id="contact_email"
                {...register('contact_email')}
                placeholder="contacto@transportes.com"
                type="email"
              />
              {errors.contact_email && (
                <p className="text-sm text-red-500">{errors.contact_email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                {...register('city')}
                placeholder="Bogotá"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_provider">Proveedor API (Tracking)</Label>
              <Input
                id="api_provider"
                {...register('api_provider')}
                placeholder="coordinadora, servientrega, etc."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Textarea
              id="address"
              {...register('address')}
              placeholder="Cra 10 #20-30, Zona Industrial"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tracking_url_template">Template URL de Tracking</Label>
            <Input
              id="tracking_url_template"
              {...register('tracking_url_template')}
              placeholder="https://tracking.ejemplo.com/guia/{tracking_number}"
            />
            <p className="text-xs text-gray-500">
              Usa {'{tracking_number}'} como placeholder para el número de guía
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={(v) => setValue('is_active', v)}
              />
              <Label htmlFor="is_active">Transportadora activa</Label>
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
              {isEditing ? 'Guardar Cambios' : 'Crear Transportadora'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
