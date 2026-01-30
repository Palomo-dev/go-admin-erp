'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calculator,
  Loader2,
  Truck,
  Scale,
  Package,
  DollarSign,
  Ruler,
  Info,
} from 'lucide-react';
import type {
  SimulateShippingParams,
  SimulatedRate,
  TransportCarrier,
} from '@/lib/services/shippingRatesService';

interface SimulatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carriers: TransportCarrier[];
  onSimulate: (params: SimulateShippingParams) => Promise<SimulatedRate[]>;
}

const SERVICE_LEVELS = [
  { value: '', label: 'Todos los niveles' },
  { value: 'express', label: 'Express' },
  { value: 'standard', label: 'Estándar' },
  { value: 'economy', label: 'Económico' },
  { value: 'overnight', label: 'Día siguiente' },
  { value: 'same_day', label: 'Mismo día' },
];

export function SimulatorDialog({
  open,
  onOpenChange,
  carriers,
  onSimulate,
}: SimulatorDialogProps) {
  const [params, setParams] = useState<SimulateShippingParams>({
    weight_kg: 1,
    length_cm: undefined,
    width_cm: undefined,
    height_cm: undefined,
    declared_value: undefined,
    origin_city: '',
    destination_city: '',
    carrier_id: '',
    service_level: '',
  });
  const [results, setResults] = useState<SimulatedRate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSimulate = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const simResults = await onSimulate(params);
      setResults(simResults);
    } catch (error) {
      console.error('Error simulando:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'COP') => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleChange = (field: keyof SimulateShippingParams, value: unknown) => {
    setParams(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            Simulador de Tarifas
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Formulario */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Datos del envío
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="origin_city">Ciudad origen</Label>
                <Input
                  id="origin_city"
                  value={params.origin_city || ''}
                  onChange={(e) => handleChange('origin_city', e.target.value)}
                  placeholder="Ej: Bogotá"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destination_city">Ciudad destino</Label>
                <Input
                  id="destination_city"
                  value={params.destination_city || ''}
                  onChange={(e) => handleChange('destination_city', e.target.value)}
                  placeholder="Ej: Medellín"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight_kg" className="flex items-center gap-1">
                <Scale className="h-3 w-3" />
                Peso (kg) *
              </Label>
              <Input
                id="weight_kg"
                type="number"
                min="0.01"
                step="0.01"
                value={params.weight_kg}
                onChange={(e) => handleChange('weight_kg', parseFloat(e.target.value) || 0)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                Dimensiones (cm)
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  min="0"
                  placeholder="Largo"
                  value={params.length_cm || ''}
                  onChange={(e) => handleChange('length_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Ancho"
                  value={params.width_cm || ''}
                  onChange={(e) => handleChange('width_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Alto"
                  value={params.height_cm || ''}
                  onChange={(e) => handleChange('height_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="declared_value">Valor declarado</Label>
              <Input
                id="declared_value"
                type="number"
                min="0"
                placeholder="Para calcular seguro"
                value={params.declared_value || ''}
                onChange={(e) => handleChange('declared_value', e.target.value ? parseFloat(e.target.value) : undefined)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Transportador</Label>
                <Select
                  value={params.carrier_id || 'all'}
                  onValueChange={(v) => handleChange('carrier_id', v === 'all' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {carriers.map((carrier) => (
                      <SelectItem key={carrier.id} value={carrier.id}>
                        {carrier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nivel servicio</Label>
                <Select
                  value={params.service_level || 'all'}
                  onValueChange={(v) => handleChange('service_level', v === 'all' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_LEVELS.map((level) => (
                      <SelectItem key={level.value || 'all'} value={level.value || 'all'}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={handleSimulate} 
              className="w-full"
              disabled={isLoading || params.weight_kg <= 0}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular Tarifas
                </>
              )}
            </Button>
          </div>

          {/* Resultados */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Resultados ({results.length})
            </h4>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : results.length === 0 ? (
              <Card className="p-6 text-center">
                {hasSearched ? (
                  <>
                    <Info className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500">No se encontraron tarifas aplicables</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Verifica los filtros o crea nuevas tarifas
                    </p>
                  </>
                ) : (
                  <>
                    <Calculator className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500">Ingresa los datos del envío</p>
                    <p className="text-xs text-gray-400 mt-1">
                      y presiona calcular para ver las tarifas
                    </p>
                  </>
                )}
              </Card>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {results.map((result, index) => (
                  <Card key={result.rate.id} className={`p-4 ${index === 0 ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h5 className="font-medium text-sm">{result.rate.rate_name}</h5>
                        {result.rate.transport_carriers && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {result.rate.transport_carriers.name}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-blue-600">
                          {formatCurrency(result.total_cost, result.rate.currency)}
                        </p>
                        {index === 0 && (
                          <Badge className="text-xs bg-blue-600">Mejor precio</Badge>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 border-t dark:border-gray-700 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span>Base:</span>
                        <span>{formatCurrency(result.base_cost, result.rate.currency)}</span>
                      </div>
                      {result.weight_cost > 0 && (
                        <div className="flex justify-between">
                          <span>Peso ({result.billable_weight.toFixed(2)} kg):</span>
                          <span>{formatCurrency(result.weight_cost, result.rate.currency)}</span>
                        </div>
                      )}
                      {result.volume_cost > 0 && (
                        <div className="flex justify-between">
                          <span>Volumen:</span>
                          <span>{formatCurrency(result.volume_cost, result.rate.currency)}</span>
                        </div>
                      )}
                      {result.fuel_surcharge > 0 && (
                        <div className="flex justify-between">
                          <span>Combustible:</span>
                          <span>{formatCurrency(result.fuel_surcharge, result.rate.currency)}</span>
                        </div>
                      )}
                      {result.insurance_cost > 0 && (
                        <div className="flex justify-between">
                          <span>Seguro:</span>
                          <span>{formatCurrency(result.insurance_cost, result.rate.currency)}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 mt-2 italic">
                      {result.calculation_details}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SimulatorDialog;
