'use client';

import { useState } from 'react';
import { Clock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';

interface HorasPresetsProps {
  horaInicio: string;
  horaFin: string;
  onApply: (horaInicio: string | null, horaFin: string | null) => void;
  onCancel: () => void;
}

// Presets comunes para filtrar por horas del día
const PRESETS: { label: string; inicio: string; fin: string; icon?: string }[] = [
  { label: 'Mañana', inicio: '06:00', fin: '12:00', icon: '🌅' },
  { label: 'Tarde', inicio: '12:00', fin: '18:00', icon: '☀️' },
  { label: 'Noche', inicio: '18:00', fin: '23:59', icon: '🌙' },
  { label: 'Madrugada', inicio: '00:00', fin: '06:00', icon: '🌃' },
  { label: 'Almuerzo', inicio: '12:00', fin: '14:00', icon: '🍽️' },
  { label: 'Cena', inicio: '18:00', fin: '22:00', icon: '🍴' },
];

export function HorasPresets({ horaInicio, horaFin, onApply, onCancel }: HorasPresetsProps) {
  const [inicio, setInicio] = useState(horaInicio);
  const [fin, setFin] = useState(horaFin);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setInicio(preset.inicio);
    setFin(preset.fin);
  };

  const handleApply = () => {
    onApply(inicio || null, fin || null);
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Presets rápidos */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => {
          const isActive = inicio === preset.inicio && fin === preset.fin;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              title={`${preset.inicio} - ${preset.fin}`}
            >
              {preset.icon && <span className="text-xs">{preset.icon}</span>}
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Inputs manuales */}
      <div className="flex items-center gap-1">
        <Clock className="h-4 w-4 text-gray-400" />
        <Input
          type="time"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="h-8 w-[100px] text-xs"
          aria-label="Hora de inicio"
        />
        <span className="text-xs text-gray-400">→</span>
        <Input
          type="time"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className="h-8 w-[100px] text-xs"
          aria-label="Hora de fin"
        />
        <Button
          variant="default"
          size="icon"
          onClick={handleApply}
          className="h-8 w-8 bg-blue-600 hover:bg-blue-700"
          title="Aplicar"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="h-8 w-8"
          title="Cancelar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
