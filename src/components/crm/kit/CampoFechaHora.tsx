'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { combinarFechaHora, partirFechaHora } from './fechasCrm';
import { CampoHora } from '@/components/kit/CampoHora';

/**
 * Fecha y hora del CRM: `CampoFecha` para el día y el campo de hora del kit al
 * lado (el mismo patrón que usan las demás pantallas con día + hora).
 * Sustituye al `<input type="datetime-local">` sin cambiar qué se guarda:
 * `valor` / `onValorChange` usan el mismo `YYYY-MM-DDTHH:mm` (hora de pared de
 * la organización, sin zona) y `''` mientras falte el día o la hora, igual que
 * el campo nativo.
 *
 * `id` y `aria-*` van al disparador de la fecha: la etiqueta de `FormField`
 * apunta a él.
 */
export interface CampoFechaHoraProps {
  valor: string;
  onValorChange: (valor: string) => void;
  min?: string | null;
  max?: string | null;
  id?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  className?: string;
}

export function CampoFechaHora({ valor, onValorChange, min, max, id, disabled, className, ...aria }: CampoFechaHoraProps) {
  const t = useTranslations('crm.kit.campoFechaHora');
  const [borrador, setBorrador] = React.useState(() => partirFechaHora(valor));

  // Un valor completo que llega de fuera (reinicio, prellenado) manda sobre el borrador.
  React.useEffect(() => {
    setBorrador((b) => (combinarFechaHora(b.dia, b.hora) === valor ? b : partirFechaHora(valor)));
  }, [valor]);

  const cambiar = (parcial: Partial<{ dia: string; hora: string }>) => {
    const n = { ...borrador, ...parcial };
    setBorrador(n);
    onValorChange(combinarFechaHora(n.dia, n.hora));
  };

  return (
    <div className={cn('flex min-w-0 gap-2', className)}>
      <CampoFecha id={id} valor={borrador.dia} onValorChange={(dia) => cambiar({ dia })} min={min} max={max} disabled={disabled} className="flex-1" {...aria} />
      <CampoHora
        aria-label={t('hora')}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        valor={borrador.hora}
        disabled={disabled}
        limpiable={false}
        onValorChange={(hora) => cambiar({ hora })}
        className="w-[136px] shrink-0"
      />
    </div>
  );
}
