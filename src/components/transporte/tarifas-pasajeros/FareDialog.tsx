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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { FareWithDetails, CreateFareData } from '@/lib/services/faresService';

interface FareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fare?: FareWithDetails | null;
  routes: Array<{ id: string; name: string; code: string; origin_stop_id?: string; destination_stop_id?: string }>;
  stops: Array<{ id: string; name: string; code?: string; city?: string }>;
  onSave: (data: Partial<CreateFareData>) => Promise<void>;
  isLoading?: boolean;
}

const FARE_TYPES = [
  { value: 'regular', label: 'Regular' },
  { value: 'student', label: 'Estudiante' },
  { value: 'senior', label: 'Adulto Mayor' },
  { value: 'child', label: 'Niño' },
  { value: 'promo', label: 'Promoción' },
  { value: 'special', label: 'Especial' },
];

const DAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

export function FareDialog({
  open,
  onOpenChange,
  fare,
  routes,
  stops,
  onSave,
  isLoading = false,
}: FareDialogProps) {
  const [formData, setFormData] = useState<Partial<CreateFareData>>({
    fare_name: '',
    fare_code: '',
    fare_type: 'regular',
    route_id: '',
    from_stop_id: '',
    to_stop_id: '',
    amount: 0,
    currency: 'COP',
    discount_percent: 0,
    discount_amount: 0,
    min_age: undefined,
    max_age: undefined,
    requires_id: false,
    requires_approval: false,
    valid_from: '',
    valid_until: '',
    applicable_days: [1, 2, 3, 4, 5, 6, 7],
    applicable_from_time: '',
    applicable_to_time: '',
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    if (fare) {
      setFormData({
        fare_name: fare.fare_name,
        fare_code: fare.fare_code || '',
        fare_type: fare.fare_type,
        route_id: fare.route_id || '',
        from_stop_id: fare.from_stop_id || '',
        to_stop_id: fare.to_stop_id || '',
        amount: fare.amount,
        currency: fare.currency || 'COP',
        discount_percent: fare.discount_percent || 0,
        discount_amount: fare.discount_amount || 0,
        min_age: fare.min_age,
        max_age: fare.max_age,
        requires_id: fare.requires_id || false,
        requires_approval: fare.requires_approval || false,
        valid_from: fare.valid_from || '',
        valid_until: fare.valid_until || '',
        applicable_days: fare.applicable_days || [1, 2, 3, 4, 5, 6, 7],
        applicable_from_time: fare.applicable_from_time || '',
        applicable_to_time: fare.applicable_to_time || '',
        is_active: fare.is_active,
        display_order: fare.display_order || 0,
      });
    } else {
      setFormData({
        fare_name: '',
        fare_code: '',
        fare_type: 'regular',
        route_id: '',
        from_stop_id: '',
        to_stop_id: '',
        amount: 0,
        currency: 'COP',
        discount_percent: 0,
        discount_amount: 0,
        min_age: undefined,
        max_age: undefined,
        requires_id: false,
        requires_approval: false,
        valid_from: '',
        valid_until: '',
        applicable_days: [1, 2, 3, 4, 5, 6, 7],
        applicable_from_time: '',
        applicable_to_time: '',
        is_active: true,
        display_order: 0,
      });
    }
  }, [fare, open]);

  const handleSubmit = async () => {
    if (!formData.fare_name || !formData.amount) return;
    
    const dataToSave: Partial<CreateFareData> = {
      ...formData,
      route_id: formData.route_id || undefined,
      from_stop_id: formData.from_stop_id || undefined,
      to_stop_id: formData.to_stop_id || undefined,
      fare_code: formData.fare_code || undefined,
      valid_from: formData.valid_from || undefined,
      valid_until: formData.valid_until || undefined,
      applicable_from_time: formData.applicable_from_time || undefined,
      applicable_to_time: formData.applicable_to_time || undefined,
    };
    
    await onSave(dataToSave);
  };

  const toggleDay = (day: number) => {
    const currentDays = formData.applicable_days || [];
    if (currentDays.includes(day)) {
      setFormData(prev => ({
        ...prev,
        applicable_days: currentDays.filter(d => d !== day),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        applicable_days: [...currentDays, day].sort(),
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {fare ? 'Editar Tarifa' : 'Nueva Tarifa'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="pricing">Precios</TabsTrigger>
            <TabsTrigger value="schedule">Vigencia</TabsTrigger>
            <TabsTrigger value="rules">Reglas</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fare_name">Nombre de la tarifa *</Label>
                <Input
                  id="fare_name"
                  value={formData.fare_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, fare_name: e.target.value }))}
                  placeholder="Ej: Tarifa Regular Adulto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fare_code">Código</Label>
                <Input
                  id="fare_code"
                  value={formData.fare_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, fare_code: e.target.value }))}
                  placeholder="Ej: REG-ADU"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de tarifa *</Label>
                <Select
                  value={formData.fare_type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, fare_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FARE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ruta (opcional)</Label>
                <Select
                  value={formData.route_id || 'none'}
                  onValueChange={(v) => {
                    const selectedRoute = routes.find(r => r.id === v);
                    setFormData(prev => ({
                      ...prev,
                      route_id: v === 'none' ? '' : v,
                      from_stop_id: selectedRoute?.origin_stop_id || '',
                      to_stop_id: selectedRoute?.destination_stop_id || '',
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las rutas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas las rutas</SelectItem>
                    {routes.map((route) => (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name} ({route.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Parada origen (tramo)</Label>
                <Select
                  value={formData.from_stop_id || 'none'}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, from_stop_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cualquier origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cualquier origen</SelectItem>
                    {stops.map((stop) => (
                      <SelectItem key={stop.id} value={stop.id}>
                        {stop.name} {stop.city && `(${stop.city})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Parada destino (tramo)</Label>
                <Select
                  value={formData.to_stop_id || 'none'}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, to_stop_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cualquier destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cualquier destino</SelectItem>
                    {stops.map((stop) => (
                      <SelectItem key={stop.id} value={stop.id}>
                        {stop.name} {stop.city && `(${stop.city})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_order">Orden de visualización</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order || 0}
                onChange={(e) => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                min="0"
              />
            </div>
          </TabsContent>

          {/* Pricing */}
          <TabsContent value="pricing" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Precio base *</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select
                  value={formData.currency || 'COP'}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, currency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP (Peso Colombiano)</SelectItem>
                    <SelectItem value="USD">USD (Dólar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount_percent">Descuento (%)</Label>
                <Input
                  id="discount_percent"
                  type="number"
                  value={formData.discount_percent || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount_percent: parseFloat(e.target.value) || 0, discount_amount: 0 }))}
                  placeholder="0"
                  min="0"
                  max="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount_amount">Descuento (monto fijo)</Label>
                <Input
                  id="discount_amount"
                  type="number"
                  value={formData.discount_amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount_amount: parseFloat(e.target.value) || 0, discount_percent: 0 }))}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {/* Precio final calculado */}
            {formData.amount && formData.amount > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Precio final:</p>
                <p className="text-2xl font-bold text-green-600">
                  ${(formData.amount - (formData.discount_amount || (formData.amount * (formData.discount_percent || 0)) / 100)).toLocaleString()} {formData.currency}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Schedule */}
          <TabsContent value="schedule" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valid_from">Válido desde</Label>
                <Input
                  id="valid_from"
                  type="date"
                  value={formData.valid_from || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, valid_from: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valid_until">Válido hasta</Label>
                <Input
                  id="valid_until"
                  type="date"
                  value={formData.valid_until || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Días aplicables</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={formData.applicable_days?.includes(day.value) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="applicable_from_time">Hora desde</Label>
                <Input
                  id="applicable_from_time"
                  type="time"
                  value={formData.applicable_from_time || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, applicable_from_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="applicable_to_time">Hora hasta</Label>
                <Input
                  id="applicable_to_time"
                  type="time"
                  value={formData.applicable_to_time || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, applicable_to_time: e.target.value }))}
                />
              </div>
            </div>
          </TabsContent>

          {/* Rules */}
          <TabsContent value="rules" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_age">Edad mínima</Label>
                <Input
                  id="min_age"
                  type="number"
                  value={formData.min_age || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_age: parseInt(e.target.value) || undefined }))}
                  placeholder="Sin límite"
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_age">Edad máxima</Label>
                <Input
                  id="max_age"
                  type="number"
                  value={formData.max_age || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_age: parseInt(e.target.value) || undefined }))}
                  placeholder="Sin límite"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Requiere documento de identidad</Label>
                  <p className="text-sm text-gray-500">El pasajero debe mostrar documento</p>
                </div>
                <Switch
                  checked={formData.requires_id || false}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_id: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Requiere aprobación</Label>
                  <p className="text-sm text-gray-500">Necesita autorización para aplicar</p>
                </div>
                <Switch
                  checked={formData.requires_approval || false}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_approval: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Tarifa activa</Label>
                  <p className="text-sm text-gray-500">Disponible para venta</p>
                </div>
                <Switch
                  checked={formData.is_active || false}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formData.fare_name || !formData.amount}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {fare ? 'Guardar cambios' : 'Crear tarifa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FareDialog;
