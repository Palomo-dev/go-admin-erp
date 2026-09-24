'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { SegmentedControl } from '@/components/kit';
import { addPlainDays } from '@/lib/utils/dateCore';

export type ModoVigencia = 'ahora' | 'programar';

export interface ValorVigencia {
  modo: ModoVigencia;
  /** Día (YYYY-MM-DD) en la zona de la organización; solo con `programar`. */
  dia: string;
}

/**
 * «Vigente desde»: ahora o un día futuro. El día es plano en la zona de la
 * organización; quien guarda lo convierte con `fechas.toInstant(dia)`.
 */
export function CampoVigencia({
  valor,
  onChange,
  hoy,
  error,
  deshabilitado,
}: {
  valor: ValorVigencia;
  onChange: (v: ValorVigencia) => void;
  hoy: string;
  error?: string | null;
  deshabilitado?: boolean;
}) {
  const t = useTranslations('productoDetalle.precios.vigencia');
  const idDia = useId();
  const idAyuda = useId();
  const manana = addPlainDays(hoy, 1);

  return (
    <fieldset className="flex flex-col gap-2" disabled={deshabilitado}>
      <legend className="mb-1 text-sm font-medium text-fg">{t('etiqueta')}</legend>
      <SegmentedControl<ModoVigencia>
        etiqueta={t('etiqueta')}
        anchoCompleto
        valor={valor.modo}
        onValorChange={(modo) => onChange({ modo, dia: valor.dia || manana })}
        opciones={[
          { valor: 'ahora', etiqueta: t('ahora') },
          { valor: 'programar', etiqueta: t('programar') },
        ]}
      />
      {valor.modo === 'programar' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idDia} className="text-xs font-medium text-fg-secondary">
            {t('dia')}
          </label>
          <input
            id={idDia}
            type="date"
            min={manana}
            value={valor.dia}
            onChange={(e) => onChange({ ...valor, dia: e.target.value })}
            aria-invalid={!!error || undefined}
            aria-describedby={idAyuda}
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand aria-[invalid=true]:border-danger"
          />
          <p id={idAyuda} className={error ? 'text-xs text-danger-text' : 'text-xs text-fg-secondary'}>
            {error ?? t('ayudaProgramar')}
          </p>
        </div>
      )}
    </fieldset>
  );
}

/** Error de la vigencia (día vacío o no futuro) o null. */
export function errorVigencia(v: ValorVigencia, hoy: string): 'diaRequerido' | 'diaPasado' | null {
  if (v.modo === 'ahora') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dia)) return 'diaRequerido';
  if (v.dia <= hoy) return 'diaPasado';
  return null;
}
