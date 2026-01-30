'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Truck, DollarSign, MapPin, Calendar } from 'lucide-react';
import type {
  ShippingRateWithCarrier,
  CreateShippingRateData,
  TransportCarrier,
} from '@/lib/services/shippingRatesService';

interface ShippingRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate?: ShippingRateWithCarrier | null;
  carriers: TransportCarrier[];
  onSave: (data: Partial<CreateShippingRateData>) => Promise<void>;
  isLoading?: boolean;
}

const SERVICE_LEVELS = [
  { value: 'express', label: 'Express' },
  { value: 'standard', label: 'Estándar' },
  { value: 'economy', label: 'Económico' },
  { value: 'overnight', label: 'Día siguiente' },
  { value: 'same_day', label: 'Mismo día' },
];

const CALCULATION_METHODS = [
  { value: 'weight', label: 'Por peso (kg)' },
  { value: 'volume', label: 'Por volumen (m³)' },
  { value: 'dimensional', label: 'Peso dimensional' },
  { value: 'flat', label: 'Tarifa fija' },
];

const CURRENCIES = [
  { value: 'COP', label: 'COP - Peso Colombiano' },
  { value: 'USD', label: 'USD - Dólar' },
  { value: 'EUR', label: 'EUR - Euro' },
];

const initialFormData: Partial<CreateShippingRateData> = {
  rate_name: '',
  rate_code: '',
  carrier_id: '',
  service_level: 'standard',
  calculation_method: 'weight',
  origin_zone: '',
  destination_zone: '',
  origin_city: '',
  destination_city: '',
  base_rate: 0,
  rate_per_kg: 0,
  rate_per_m3: 0,
  dimensional_factor: 5000,
  min_weight_kg: undefined,
  max_weight_kg: undefined,
  min_charge: 0,
  fuel_surcharge_percent: 0,
  insurance_percent: 0,
  currency: 'COP',
  valid_from: '',
  valid_until: '',
  is_active: true,
};

export function ShippingRateDialog({
  open,
  onOpenChange,
  rate,
  carriers,
  onSave,
  isLoading = false,
}: ShippingRateDialogProps) {
  const [formData, setFormData] = useState<Partial<CreateShippingRateData>>(initialFormData);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (rate) {
      setFormData({
        rate_name: rate.rate_name,
        rate_code: rate.rate_code || '',
        carrier_id: rate.carrier_id || '',
        service_level: rate.service_level || 'standard',
        calculation_method: rate.calculation_method || 'weight',
        origin_zone: rate.origin_zone || '',
        destination_zone: rate.destination_zone || '',
        origin_city: rate.origin_city || '',
        destination_city: rate.destination_city || '',
        base_rate: rate.base_rate || 0,
        rate_per_kg: rate.rate_per_kg || 0,
        rate_per_m3: rate.rate_per_m3 || 0,
        dimensional_factor: rate.dimensional_factor || 5000,
        min_weight_kg: rate.min_weight_kg,
        max_weight_kg: rate.max_weight_kg,
        min_charge: rate.min_charge || 0,
        fuel_surcharge_percent: rate.fuel_surcharge_percent || 0,
        insurance_percent: rate.insurance_percent || 0,
        currency: rate.currency || 'COP',
        valid_from: rate.valid_from || '',
        valid_until: rate.valid_until || '',
        is_active: rate.is_active,
      });
    } else {
      setFormData(initialFormData);
    }
    setActiveTab('general');
  }, [rate, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const handleChange = (field: keyof CreateShippingRateData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            {rate ? 'Editar Tarifa de Envío' : 'Nueva Tarifa de Envío'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="precios">Precios</TabsTrigger>
              <TabsTrigger value="zonas">Zonas</TabsTrigger>
              <TabsTrigger value="vigencia">Vigencia</TabsTrigger>
            </TabsList>

            {/* Tab General */}
            <TabsContent value="general" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate_name">Nombre de tarifa *</Label>
                  <Input
                    id="rate_name"
                    value={formData.rate_name || ''}
                    onChange={(e) => handleChange('rate_name', e.target.value)}
                    placeholder="Ej: Envío Express Bogotá-Medellín"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate_code">Código</Label>
                  <Input
                    id="rate_code"
                    value={formData.rate_code || ''}
                    onChange={(e) => handleChange('rate_code', e.target.value)}
                    placeholder="Ej: EXP-BOG-MED"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Transportador</Label>
                  <Select
                    value={formData.carrier_id || 'none'}
                    onValueChange={(v) => handleChange('carrier_id', v === 'none' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar transportador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin transportador específico</SelectItem>
                      {carriers.map((carrier) => (
                        <SelectItem key={carrier.id} value={carrier.id}>
                          {carrier.name} ({carrier.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nivel de servicio</Label>
                  <Select
                    value={formData.service_level || 'standard'}
                    onValueChange={(v) => handleChange('service_level', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Método de cálculo</Label>
                <Select
                  value={formData.calculation_method || 'weight'}
                  onValueChange={(v) => handleChange('calculation_method', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALCULATION_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Tarifa activa</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => handleChange('is_active', checked)}
                />
              </div>
            </TabsContent>

            {/* Tab Precios */}
            <TabsContent value="precios" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <DollarSign className="h-4 w-4" />
                Configuración de precios y cargos
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Select
                    value={formData.currency || 'COP'}
                    onValueChange={(v) => handleChange('currency', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((curr) => (
                        <SelectItem key={curr.value} value={curr.value}>
                          {curr.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="base_rate">Tarifa base</Label>
                  <Input
                    id="base_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.base_rate || 0}
                    onChange={(e) => handleChange('base_rate', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate_per_kg">Tarifa por kg</Label>
                  <Input
                    id="rate_per_kg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.rate_per_kg || 0}
                    onChange={(e) => handleChange('rate_per_kg', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate_per_m3">Tarifa por m³</Label>
                  <Input
                    id="rate_per_m3"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.rate_per_m3 || 0}
                    onChange={(e) => handleChange('rate_per_m3', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dimensional_factor">Factor dimensional</Label>
                  <Input
                    id="dimensional_factor"
                    type="number"
                    min="1"
                    value={formData.dimensional_factor || 5000}
                    onChange={(e) => handleChange('dimensional_factor', parseFloat(e.target.value) || 5000)}
                  />
                  <p className="text-xs text-gray-500">Divisor para peso volumétrico (L×A×H / factor)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_charge">Cargo mínimo</Label>
                  <Input
                    id="min_charge"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.min_charge || 0}
                    onChange={(e) => handleChange('min_charge', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_weight_kg">Peso mínimo (kg)</Label>
                  <Input
                    id="min_weight_kg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.min_weight_kg || ''}
                    onChange={(e) => handleChange('min_weight_kg', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Sin mínimo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_weight_kg">Peso máximo (kg)</Label>
                  <Input
                    id="max_weight_kg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.max_weight_kg || ''}
                    onChange={(e) => handleChange('max_weight_kg', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Sin máximo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-gray-700">
                <div className="space-y-2">
                  <Label htmlFor="fuel_surcharge_percent">Recargo combustible (%)</Label>
                  <Input
                    id="fuel_surcharge_percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.fuel_surcharge_percent || 0}
                    onChange={(e) => handleChange('fuel_surcharge_percent', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_percent">Seguro (% del valor)</Label>
                  <Input
                    id="insurance_percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.insurance_percent || 0}
                    onChange={(e) => handleChange('insurance_percent', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab Zonas */}
            <TabsContent value="zonas" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <MapPin className="h-4 w-4" />
                Definir zonas de cobertura
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="origin_zone">Zona origen</Label>
                  <Input
                    id="origin_zone"
                    value={formData.origin_zone || ''}
                    onChange={(e) => handleChange('origin_zone', e.target.value)}
                    placeholder="Ej: Zona Norte"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination_zone">Zona destino</Label>
                  <Input
                    id="destination_zone"
                    value={formData.destination_zone || ''}
                    onChange={(e) => handleChange('destination_zone', e.target.value)}
                    placeholder="Ej: Zona Sur"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="origin_city">Ciudad origen</Label>
                  <Input
                    id="origin_city"
                    value={formData.origin_city || ''}
                    onChange={(e) => handleChange('origin_city', e.target.value)}
                    placeholder="Ej: Bogotá"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination_city">Ciudad destino</Label>
                  <Input
                    id="destination_city"
                    value={formData.destination_city || ''}
                    onChange={(e) => handleChange('destination_city', e.target.value)}
                    placeholder="Ej: Medellín"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Deja los campos vacíos para aplicar a cualquier origen/destino.
              </p>
            </TabsContent>

            {/* Tab Vigencia */}
            <TabsContent value="vigencia" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <Calendar className="h-4 w-4" />
                Período de validez de la tarifa
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valid_from">Válida desde</Label>
                  <Input
                    id="valid_from"
                    type="date"
                    value={formData.valid_from || ''}
                    onChange={(e) => handleChange('valid_from', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valid_until">Válida hasta</Label>
                  <Input
                    id="valid_until"
                    type="date"
                    value={formData.valid_until || ''}
                    onChange={(e) => handleChange('valid_until', e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Deja los campos vacíos para una vigencia indefinida.
              </p>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !formData.rate_name}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                rate ? 'Guardar cambios' : 'Crear tarifa'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ShippingRateDialog;
