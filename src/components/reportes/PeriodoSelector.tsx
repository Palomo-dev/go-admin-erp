'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TipoCierre, PeriodoCierre } from '@/lib/services/reportes/types';
import { resolverPeriodo, periodoAnterior, periodoSiguiente } from '@/lib/services/reportes/periodosService';

const OPCIONES: { value: TipoCierre; label: string }[] = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

interface PeriodoSelectorProps {
  periodo: PeriodoCierre;
  onChange: (periodo: PeriodoCierre) => void;
}

export function PeriodoSelector({ periodo, onChange }: PeriodoSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(periodo.fechaInicio);
  const [customTo, setCustomTo] = useState(periodo.fechaFin);

  const handleTipoChange = (tipo: string) => {
    if (tipo === 'personalizado') {
      setCustomOpen(true);
      return;
    }
    const nuevo = resolverPeriodo(tipo as TipoCierre);
    onChange(nuevo);
  };

  const handleCustomApply = () => {
    if (!customFrom || !customTo) return;
    onChange({
      tipo: 'personalizado',
      fechaInicio: customFrom,
      fechaFin: customTo,
      etiqueta: `${customFrom} → ${customTo}`,
    });
    setCustomOpen(false);
  };

  const handlePrev = () => onChange(periodoAnterior(periodo));
  const handleNext = () => {
    const next = periodoSiguiente(periodo);
    if (next) onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={handlePrev} className="h-9 w-9">
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Select value={periodo.tipo} onValueChange={handleTipoChange}>
        <SelectTrigger className="w-[160px] h-9">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {OPCIONES.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
          <SelectItem value="personalizado">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="icon" onClick={handleNext} className="h-9 w-9">
        <ChevronRight className="h-4 w-4" />
      </Button>

      <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline-block min-w-[120px]">
        {periodo.etiqueta}
      </span>

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="hidden">
            <CalendarDays className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3 p-2">
            <p className="text-sm font-medium">Rango personalizado</p>
            <div className="space-y-2">
              <Label htmlFor="from">Fecha inicio</Label>
              <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Fecha fin</Label>
              <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            <Button size="sm" className="w-full" onClick={handleCustomApply}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
