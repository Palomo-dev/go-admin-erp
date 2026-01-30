'use client';

import React, { useState, useEffect } from 'react';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Rate } from '@/lib/services/ratesService';

interface SpaceType {
  id: string;
  name: string;
}

interface RateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: Rate | null;
  spaceTypes: SpaceType[];
  onSave: (data: RateFormData) => Promise<void>;
}

export interface RateFormData {
  space_type_id: string;
  date_from: string;
  date_to: string;
  price: number;
  priority: number;
  restrictions: {
    min_nights?: number;
    max_nights?: number;
    closed_arrival?: boolean;
    closed_departure?: boolean;
    plan?: string;
  };
}

const PLANS = [
  { value: 'solo_alojamiento', label: 'Solo Alojamiento' },
  { value: 'con_desayuno', label: 'Con Desayuno' },
  { value: 'media_pension', label: 'Media Pensión' },
  { value: 'pension_completa', label: 'Pensión Completa' },
  { value: 'todo_incluido', label: 'Todo Incluido' },
];

const PRIORITY_OPTIONS = [
  { value: '0', label: 'Normal', description: 'Tarifa base sin preferencia especial' },
  { value: '1', label: 'Baja', description: 'Se aplica si no hay otra tarifa' },
  { value: '2', label: 'Media', description: 'Promociones regulares' },
  { value: '3', label: 'Alta', description: 'Ofertas especiales o temporada' },
  { value: '4', label: 'Muy Alta', description: 'Eventos o fechas especiales' },
  { value: '5', label: 'Máxima', description: 'Override manual, siempre aplica' },
];

export function RateDialog({
  open,
  onOpenChange,
  rate,
  spaceTypes,
  onSave,
}: RateDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [spaceTypeId, setSpaceTypeId] = useState('');
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(addDays(new Date(), 30));
  const [price, setPrice] = useState('');
  const [plan, setPlan] = useState('solo_alojamiento');
  const [minNights, setMinNights] = useState('1');
  const [maxNights, setMaxNights] = useState('');
  const [closedArrival, setClosedArrival] = useState(false);
  const [closedDeparture, setClosedDeparture] = useState(false);
  const [priority, setPriority] = useState('0');

  useEffect(() => {
    if (rate) {
      setSpaceTypeId(rate.space_type_id);
      setDateFrom(new Date(rate.date_from));
      setDateTo(new Date(rate.date_to));
      setPrice(rate.price.toString());
      setPlan(rate.restrictions?.plan || 'solo_alojamiento');
      setMinNights(rate.restrictions?.min_nights?.toString() || '1');
      setMaxNights(rate.restrictions?.max_nights?.toString() || '');
      setClosedArrival(rate.restrictions?.closed_arrival || false);
      setClosedDeparture(rate.restrictions?.closed_departure || false);
      setPriority(rate.priority?.toString() || '0');
    } else {
      resetForm();
    }
  }, [rate, open]);

  const resetForm = () => {
    setSpaceTypeId('');
    setDateFrom(new Date());
    setDateTo(addDays(new Date(), 30));
    setPrice('');
    setPlan('solo_alojamiento');
    setMinNights('1');
    setMaxNights('');
    setClosedArrival(false);
    setClosedDeparture(false);
    setPriority('0');
  };

  const handleSubmit = async () => {
    if (!spaceTypeId || !price) return;

    setIsLoading(true);
    try {
      await onSave({
        space_type_id: spaceTypeId,
        date_from: format(dateFrom, 'yyyy-MM-dd'),
        date_to: format(dateTo, 'yyyy-MM-dd'),
        price: parseFloat(price),
        priority: parseInt(priority) || 0,
        restrictions: {
          plan,
          min_nights: minNights ? parseInt(minNights) : undefined,
          max_nights: maxNights ? parseInt(maxNights) : undefined,
          closed_arrival: closedArrival,
          closed_departure: closedDeparture,
        },
      });
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rate ? 'Editar Tarifa' : 'Nueva Tarifa'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de Espacio */}
          <div className="space-y-2">
            <Label>Tipo de Espacio *</Label>
            <Select value={spaceTypeId} onValueChange={setSpaceTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo de espacio" />
              </SelectTrigger>
              <SelectContent>
                {spaceTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha Desde *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateFrom, 'dd/MM/yyyy', { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => date && setDateFrom(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Fecha Hasta *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateTo, 'dd/MM/yyyy', { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => date && setDateTo(date)}
                    locale={es}
                    disabled={(date) => date < dateFrom}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Precio, Prioridad y Plan */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Precio por Noche *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  $
                </span>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-7"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar prioridad" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {PRIORITY_OPTIONS.find(p => p.value === priority)?.description || 'Selecciona una prioridad'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Restricciones de noches */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mín. Noches</Label>
              <Input
                type="number"
                value={minNights}
                onChange={(e) => setMinNights(e.target.value)}
                placeholder="1"
                min="1"
              />
            </div>

            <div className="space-y-2">
              <Label>Máx. Noches</Label>
              <Input
                type="number"
                value={maxNights}
                onChange={(e) => setMaxNights(e.target.value)}
                placeholder="Sin límite"
                min="1"
              />
            </div>
          </div>

          {/* Restricciones adicionales */}
          <div className="space-y-3 pt-2">
            <Label className="text-sm font-medium">Restricciones</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="closedArrival"
                checked={closedArrival}
                onCheckedChange={(checked) => setClosedArrival(checked as boolean)}
              />
              <label
                htmlFor="closedArrival"
                className="text-sm text-gray-600 dark:text-gray-400"
              >
                Cierre de llegada (no permite check-in en estas fechas)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="closedDeparture"
                checked={closedDeparture}
                onCheckedChange={(checked) => setClosedDeparture(checked as boolean)}
              />
              <label
                htmlFor="closedDeparture"
                className="text-sm text-gray-600 dark:text-gray-400"
              >
                Cierre de salida (no permite check-out en estas fechas)
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !spaceTypeId || !price}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : rate ? (
              'Actualizar'
            ) : (
              'Crear Tarifa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
