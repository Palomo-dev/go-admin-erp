'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, ChevronLeft, ChevronRight, Check, X, Clock } from 'lucide-react';
import { HorasPresets } from '@/components/inicio/HorasPresets';
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
  const [isCustom, setIsCustom] = useState(periodo.tipo === 'personalizado');
  const [customFrom, setCustomFrom] = useState(periodo.fechaInicio);
  const [customTo, setCustomTo] = useState(periodo.fechaFin);
  const [showHours, setShowHours] = useState(false);
  const [horaInicio, setHoraInicio] = useState(periodo.horaInicio ?? '');
  const [horaFin, setHoraFin] = useState(periodo.horaFin ?? '');

  const handleTipoChange = (tipo: string) => {
    if (tipo === 'personalizado') {
      setIsCustom(true);
      return;
    }
    setIsCustom(false);
    const nuevo = resolverPeriodo(tipo as TipoCierre);
    // Preservar horas manuales si están definidas
    if (horaInicio || horaFin) {
      nuevo.horaInicio = horaInicio || null;
      nuevo.horaFin = horaFin || null;
    }
    onChange(nuevo);
  };

  const handleCustomApply = () => {
    if (!customFrom || !customTo) return;
    onChange({
      tipo: 'personalizado',
      fechaInicio: customFrom,
      fechaFin: customTo,
      etiqueta: `${customFrom} → ${customTo}${horaInicio || horaFin ? ` (${horaInicio || '00:00'}-${horaFin || '23:59'})` : ''}`,
      horaInicio: horaInicio || null,
      horaFin: horaFin || null,
    });
    setIsCustom(false);
  };

  const handleCustomCancel = () => {
    setIsCustom(false);
  };

  // Aplicar/quitar filtro de horas sin cambiar el período
  const handleToggleHours = () => {
    if (horaInicio || horaFin) {
      // Quitar horas
      setHoraInicio('');
      setHoraFin('');
      onChange({ ...periodo, horaInicio: null, horaFin: null });
    } else {
      setShowHours(true);
    }
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

      {isCustom ? (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-9 w-[140px]"
          />
          <span className="text-xs text-gray-400">→</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-9 w-[140px]"
          />
          <Button variant="default" size="icon" onClick={handleCustomApply} className="h-9 w-9 bg-blue-600 hover:bg-blue-700">
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleCustomCancel} className="h-9 w-9">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
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
      )}

      <Button variant="outline" size="icon" onClick={handleNext} className="h-9 w-9">
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Filtro de horas opcional */}
      {showHours ? (
        <HorasPresets
          horaInicio={horaInicio}
          horaFin={horaFin}
          onApply={(hIni, hFin) => {
            setHoraInicio(hIni ?? '');
            setHoraFin(hFin ?? '');
            onChange({ ...periodo, horaInicio: hIni, horaFin: hFin });
            setShowHours(false);
          }}
          onCancel={() => setShowHours(false)}
        />
      ) : (
        <Button
          variant={horaInicio || horaFin ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleHours}
          className="h-9"
          title="Filtrar por horas del día"
        >
          <Clock className="h-4 w-4 mr-1" />
          {(horaInicio || horaFin)
            ? `${horaInicio || '00:00'}-${horaFin || '23:59'}`
            : 'Horas'}
        </Button>
      )}

      <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline-block min-w-[120px]">
        {periodo.etiqueta}
      </span>
    </div>
  );
}
