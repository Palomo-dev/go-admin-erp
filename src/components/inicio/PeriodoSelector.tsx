'use client';

import { useState } from 'react';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  CalendarHeart,
  Clock,
  CalendarMinus,
  CalendarSearch,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SegmentedControl, DateRangeButton, clasesBoton, type OpcionSegmento, type RangoFechas } from '@/components/kit';
import { HorasPresets } from './HorasPresets';
import type { PeriodoDashboard, HorasDashboard, FechasCustomDashboard } from './inicioService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

interface PeriodoSelectorProps {
  value: PeriodoDashboard;
  onChange: (periodo: PeriodoDashboard) => void;
  horas?: HorasDashboard | null;
  onHorasChange?: (horas: HorasDashboard | null) => void;
  fechasCustom?: FechasCustomDashboard | null;
  onFechasCustomChange?: (fechas: FechasCustomDashboard | null) => void;
}

const OPCIONES: { value: PeriodoDashboard; labelKey: 'today' | 'yesterday' | '7days' | '30days' | '90days' | 'year'; icon: LucideIcon }[] = [
  { value: 'hoy', labelKey: 'today', icon: CalendarClock },
  { value: 'ayer', labelKey: 'yesterday', icon: CalendarMinus },
  { value: '7d', labelKey: '7days', icon: Calendar },
  { value: '30d', labelKey: '30days', icon: CalendarDays },
  { value: '90d', labelKey: '90days', icon: CalendarRange },
  { value: 'año', labelKey: 'year', icon: CalendarHeart },
];

/**
 * Periodo del inicio (Figma `SelectorPeriodo` 447:72932): `SegmentedControl`
 * del kit con los atajos y «Personalizado», y el rango en el `DateRangeButton`
 * del kit (popover con calendario, se aplica al elegir el segundo día). Las
 * etiquetas se ven también en móvil: antes solo quedaba el icono.
 */
export function PeriodoSelector({
  value,
  onChange,
  horas,
  onHorasChange,
  fechasCustom,
  onFechasCustomChange,
}: PeriodoSelectorProps) {
  const t = useTranslations('home');
  const { getToday, toDate } = useFormatDate();
  const [showHours, setShowHours] = useState(false);
  /** «Personalizado» elegido pero aún sin rango aplicado. */
  const [showCustom, setShowCustom] = useState(false);
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

  const handlePeriodo = (v: PeriodoDashboard) => {
    if (v === 'personalizado') {
      // El rango se aplica desde el DateRangeButton; hasta entonces el panel
      // sigue con el periodo anterior.
      if (!isCustom) setShowCustom(true);
      return;
    }
    onChange(v);
    setShowCustom(false);
  };

  // Rango del botón: el aplicado o, mientras se elige, los últimos 30 días en
  // la zona de la organización.
  const hoy = getToday();
  const rango: RangoFechas = fechasCustom
    ? { desde: fechasCustom.fechaInicio, hasta: fechasCustom.fechaFin }
    : { desde: toDate(new Date(Date.now() - 30 * 86400000)), hasta: hoy };

  const handleRango = ({ desde, hasta }: RangoFechas) => {
    onFechasCustomChange?.({ fechaInicio: desde, fechaFin: hasta });
    onChange('personalizado');
    setShowCustom(false);
  };

  const opciones: OpcionSegmento<PeriodoDashboard>[] = [
    ...OPCIONES.map((o) => ({ valor: o.value, etiqueta: t(`periods.${o.labelKey}`), icono: o.icon })),
    { valor: 'personalizado', etiqueta: t('periods.custom'), icono: CalendarSearch },
  ];

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <SegmentedControl
        opciones={opciones}
        valor={showCustom ? 'personalizado' : value}
        onValorChange={handlePeriodo}
        etiqueta={t('periods.label')}
        tamano="sm"
        className="max-w-full overflow-x-auto [scrollbar-width:none]"
      />

      {(showCustom || isCustom) && (
        <DateRangeButton
          valor={rango}
          onValorChange={handleRango}
          hoy={hoy}
          etiqueta={t('periods.customRange')}
        />
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
          <button
            type="button"
            onClick={handleToggleHours}
            aria-pressed={hasHoras}
            className={clasesBoton({ variante: hasHoras ? 'tinte' : 'secundario', tamano: 'sm' })}
            title={t('hours.filterByHours')}
          >
            <Clock aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {hasHoras
              ? `${horas?.horaInicio || '00:00'}-${horas?.horaFin || '23:59'}`
              : t('hours.hours')}
          </button>
        )
      )}
    </div>
  );
}
