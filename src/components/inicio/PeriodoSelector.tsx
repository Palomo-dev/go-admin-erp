'use client';

import { useState } from 'react';
import { Calendar, CalendarDays, CalendarRange, CalendarClock, CalendarHeart, Clock, CalendarMinus, CalendarSearch, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HorasPresets } from './HorasPresets';
import type { PeriodoDashboard, HorasDashboard, FechasCustomDashboard } from './inicioService';
import { cn } from '@/utils/Utils';

interface PeriodoSelectorProps {
  value: PeriodoDashboard;
  onChange: (periodo: PeriodoDashboard) => void;
  horas?: HorasDashboard | null;
  onHorasChange?: (horas: HorasDashboard | null) => void;
  fechasCustom?: FechasCustomDashboard | null;
  onFechasCustomChange?: (fechas: FechasCustomDashboard | null) => void;
}

const OPCIONES: { value: PeriodoDashboard; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'hoy', label: 'Hoy', icon: CalendarClock },
  { value: 'ayer', label: 'Ayer', icon: CalendarMinus },
  { value: '7d', label: '7 días', icon: Calendar },
  { value: '30d', label: '30 días', icon: CalendarDays },
  { value: '90d', label: '90 días', icon: CalendarRange },
  { value: 'año', label: 'Año', icon: CalendarHeart },
];

export function PeriodoSelector({
  value,
  onChange,
  horas,
  onHorasChange,
  fechasCustom,
  onFechasCustomChange,
}: PeriodoSelectorProps) {
  const [showHours, setShowHours] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(fechasCustom?.fechaInicio ?? '');
  const [customTo, setCustomTo] = useState(fechasCustom?.fechaFin ?? '');
  const hasHoras = !!(horas?.horaInicio || horas?.horaFin);
  const isCustom = value === 'personalizado';

  const handleToggleHours = () => {
    if (hasHoras) {
      // Quitar horas
      onHorasChange?.(null);
    } else {
      setShowHours(!showHours);
    }
  };

  const handleApplyHours = (horaInicio: string | null, horaFin: string | null) => {
    onHorasChange?.({ horaInicio, horaFin });
    setShowHours(false);
  };

  const handleCustomClick = () => {
    // Si ya está activo, permitir editar las fechas
    if (isCustom) {
      setShowCustom(!showCustom);
    } else {
      setShowCustom(true);
      // Inicializar con fechas por defecto si están vacías
      if (!customFrom || !customTo) {
        const hoy = new Date().toISOString().split('T')[0];
        const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        setCustomFrom(hace30);
        setCustomTo(hoy);
      }
    }
  };

  const handleCustomApply = () => {
    if (!customFrom || !customTo) return;
    // Normalizar: si from > to, swap
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    onFechasCustomChange?.({ fechaInicio: from, fechaFin: to });
    onChange('personalizado');
    setShowCustom(false);
  };

  const handleCustomCancel = () => {
    setShowCustom(false);
    // Si no hay fechas guardadas, volver a 'hoy'
    if (!fechasCustom) {
      onChange('hoy');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {OPCIONES.map((opt) => {
          const Icon = opt.icon;
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setShowCustom(false);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
              aria-pressed={isActive}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          );
        })}
        {/* Botón Personalizado */}
        <button
          type="button"
          onClick={handleCustomClick}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
            isCustom
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          )}
          aria-pressed={isCustom}
          title="Rango de fechas personalizado"
        >
          <CalendarSearch className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Personalizado</span>
        </button>
      </div>

      {/* Inputs de fecha personalizada */}
      {showCustom && (
        <div className="inline-flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 w-[140px] text-xs"
            max={customTo || undefined}
          />
          <span className="text-xs text-gray-400 px-1">→</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 w-[140px] text-xs"
            min={customFrom || undefined}
          />
          <Button
            variant="default"
            size="icon"
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            className="h-8 w-8 bg-blue-600 hover:bg-blue-700"
            title="Aplicar"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCustomCancel}
            className="h-8 w-8"
            title="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Etiqueta del rango activo cuando es personalizado y no se está editando */}
      {isCustom && !showCustom && fechasCustom && (
        <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline-block">
          {fechasCustom.fechaInicio} → {fechasCustom.fechaFin}
        </span>
      )}

      {/* Filtro de horas opcional */}
      {onHorasChange && (
        showHours ? (
          <HorasPresets
            horaInicio={horas?.horaInicio ?? ''}
            horaFin={horas?.horaFin ?? ''}
            onApply={handleApplyHours}
            onCancel={() => setShowHours(false)}
          />
        ) : (
          <Button
            variant={hasHoras ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleHours}
            className="h-8 text-xs"
            title="Filtrar por horas del día"
          >
            <Clock className="h-3.5 w-3.5 mr-1" />
            {hasHoras
              ? `${horas?.horaInicio || '00:00'}-${horas?.horaFin || '23:59'}`
              : 'Horas'}
          </Button>
        )
      )}
    </div>
  );
}
