'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { ChipCuenta } from '@/components/kit/ChipCuenta';
import { useOrigenCuenta } from '@/components/kit/CampoCuentaAutomatica';
import type { CuentaEfectiva, SugerenciaCuenta } from '@/lib/finanzas/contabilidad/cuentaEfectiva';

/** «Ver cuentas contables», a la derecha sobre las líneas del documento. */
export function InterruptorCuentas({ activo, onCambiar }: { activo: boolean; onCambiar: (valor: boolean) => void }) {
  const t = useTranslations('cuentasAutomaticas');
  const id = useId();
  return (
    <div className="flex items-center justify-end gap-2">
      <label htmlFor={id} className="text-sm text-fg-secondary">
        {t('interruptor')}
      </label>
      <Switch id={id} checked={activo} onCheckedChange={onCambiar} />
    </div>
  );
}

/**
 * Bajo cada línea, con el interruptor encendido. La sugerencia nunca se escribe
 * sola: si se escribiera, encender el interruptor cambiaría el documento. Por eso
 * el chip muestra lo que hará el asiento y «Usar» es una decisión de la persona.
 */
export function PieCuentaLinea({
  efectiva,
  cargando,
  sugerencia,
  onAbrir,
  onUsarSugerencia,
}: {
  efectiva: CuentaEfectiva | undefined;
  cargando: boolean;
  sugerencia?: SugerenciaCuenta | null;
  onAbrir: () => void;
  onUsarSugerencia?: (cuenta: string) => void;
}) {
  const t = useTranslations('cuentasAutomaticas');
  const origenDe = useOrigenCuenta();
  return (
    <span className="mt-1 flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-secondary">{t('cuentaContable')}</span>
        <ChipCuenta cuenta={efectiva?.cuenta} estado={efectiva?.estado ?? 'automatica'} cargando={cargando} onClick={onAbrir} aria-label={t('abrirCuenta')} />
        {efectiva && <span className="whitespace-normal text-xs text-fg-muted">{origenDe(efectiva)}</span>}
      </span>
      {sugerencia && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          <span className="whitespace-normal">
            {t('sugerencia.texto', { cuenta: sugerencia.cuenta, nombre: sugerencia.nombre, veces: sugerencia.veces, compras: sugerencia.compras })}
          </span>
          <button
            type="button"
            onClick={() => onUsarSugerencia?.(sugerencia.cuenta)}
            className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('sugerencia.usar')}
          </button>
        </span>
      )}
    </span>
  );
}
