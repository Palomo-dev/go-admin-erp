'use client';

/**
 * F14 — selector de rango del panel: mes de inicio y mes de fin (inclusivo en
 * pantalla; el servidor recibe el primer día del mes siguiente como fin
 * exclusivo). Aritmética de calendario sobre YYYY-MM, sin `Date` local.
 * Errores junto al campo con `aria-describedby`; máximo 36 meses.
 */

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addMonthsPlain, MAX_RANGE_MONTHS } from '@/lib/services/crm/revenueOs/dateRange';

export interface RangeSelection {
  /** YYYY-MM-DD inclusivo. */
  start: string;
  /** YYYY-MM-DD exclusivo (primer día del mes siguiente al elegido). */
  end: string;
}

interface Props {
  /** Rango aplicado hoy (start inclusivo, end exclusivo), para poblar los campos. */
  current: { start: string; end: string } | null;
  onApply: (range: RangeSelection) => void;
  disabled?: boolean;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthsBetween(startMonth: string, endMonthInclusive: string): number {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonthInclusive.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

export function validateMonths(startMonth: string, endMonth: string): string | null {
  if (!MONTH_RE.test(startMonth) || !MONTH_RE.test(endMonth)) return 'Elige mes y año en ambos campos';
  if (endMonth < startMonth) return 'El mes final debe ser igual o posterior al inicial';
  if (monthsBetween(startMonth, endMonth) > MAX_RANGE_MONTHS) return `Máximo ${MAX_RANGE_MONTHS} meses`;
  return null;
}

export function RevenueRangeControl({ current, onApply, disabled }: Props) {
  const startId = useId();
  const endId = useId();
  const errId = useId();
  const [startMonth, setStartMonth] = useState(current ? current.start.slice(0, 7) : '');
  // El fin exclusivo del servidor se muestra como el mes anterior (inclusivo).
  const [endMonth, setEndMonth] = useState(current ? addMonthsPlain(current.end, -1).slice(0, 7) : '');
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const problem = validateMonths(startMonth, endMonth);
    setError(problem);
    if (problem) {
      document.getElementById(startId)?.focus();
      return;
    }
    onApply({ start: `${startMonth}-01`, end: addMonthsPlain(`${endMonth}-01`, 1) });
  };

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      aria-label="Periodo del panel"
    >
      <div className="space-y-1">
        <Label htmlFor={startId} className="text-xs text-gray-600 dark:text-gray-300">
          Desde (mes)
        </Label>
        <Input
          id={startId}
          type="month"
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="h-9 w-40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={endId} className="text-xs text-gray-600 dark:text-gray-300">
          Hasta (mes)
        </Label>
        <Input
          id={endId}
          type="month"
          value={endMonth}
          onChange={(e) => setEndMonth(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="h-9 w-40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          disabled={disabled}
        />
      </div>
      <Button type="submit" size="sm" className="h-9 bg-blue-600 text-white hover:bg-blue-700" disabled={disabled}>
        Aplicar
      </Button>
      {error && (
        <p id={errId} role="alert" className="basis-full text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
