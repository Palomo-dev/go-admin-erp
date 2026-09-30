'use client';

import { useState } from 'react';
import { Clock, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';

interface HorasPresetsProps {
  horaInicio: string;
  horaFin: string;
  onApply: (horaInicio: string | null, horaFin: string | null) => void;
  onCancel: () => void;
}

// Presets comunes para filtrar por horas del día. Sin emoji (el manual los
// prohíbe como icono); los mismos seis presets de siempre.
// Los comparte el selector de periodo del inicio (`SelectorPeriodoInicio`).
export const PRESETS_HORAS: { labelKey: 'morning' | 'afternoon' | 'night' | 'dawn' | 'lunch' | 'dinner'; inicio: string; fin: string }[] = [
  { labelKey: 'morning', inicio: '06:00', fin: '12:00' },
  { labelKey: 'afternoon', inicio: '12:00', fin: '18:00' },
  { labelKey: 'night', inicio: '18:00', fin: '23:59' },
  { labelKey: 'dawn', inicio: '00:00', fin: '06:00' },
  { labelKey: 'lunch', inicio: '12:00', fin: '14:00' },
  { labelKey: 'dinner', inicio: '18:00', fin: '22:00' },
];

export function HorasPresets({ horaInicio, horaFin, onApply, onCancel }: HorasPresetsProps) {
  const t = useTranslations('home.hours');
  const [inicio, setInicio] = useState(horaInicio);
  const [fin, setFin] = useState(horaFin);

  const applyPreset = (preset: typeof PRESETS_HORAS[0]) => {
    setInicio(preset.inicio);
    setFin(preset.fin);
  };

  const handleApply = () => {
    onApply(inicio || null, fin || null);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2 shadow-sm">
      {/* Presets rápidos */}
      <div className="flex flex-wrap gap-1">
        {PRESETS_HORAS.map((preset) => {
          const isActive = inicio === preset.inicio && fin === preset.fin;
          return (
            <button
              key={preset.labelKey}
              type="button"
              onClick={() => applyPreset(preset)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                isActive
                  ? 'bg-brand-action text-fg-on-brand'
                  : 'bg-subtle text-fg-secondary hover:bg-hover hover:text-fg'
              )}
              title={`${preset.inicio} - ${preset.fin}`}
            >
              {t(preset.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Inputs manuales */}
      <div className="flex items-center gap-1">
        <Clock aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
        <Input
          type="time"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="h-8 w-[100px] text-xs"
          aria-label={t('start')}
        />
        <span aria-hidden="true" className="text-xs text-fg-muted">→</span>
        <Input
          type="time"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className="h-8 w-[100px] text-xs"
          aria-label={t('end')}
        />
        <button
          type="button"
          onClick={handleApply}
          className={clasesBoton({ variante: 'primario', tamano: 'sm', className: 'w-8 px-0' })}
          title={t('apply')}
          aria-label={t('apply')}
        >
          <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-8 px-0' })}
          title={t('cancel')}
          aria-label={t('cancel')}
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
