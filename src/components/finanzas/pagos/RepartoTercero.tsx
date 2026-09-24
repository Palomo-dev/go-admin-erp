'use client';

/**
 * Reparto de un pago entre las facturas abiertas de un cliente (Figma X2/X2b,
 * `740:51004`, `740:52151`): casilla por factura, de la más antigua a la más
 * nueva, y la casilla del sobrante a saldo a favor. Lo que se aplica a cada una
 * lo decide `repartirFifo` al confirmar (misma regla que valida la RPC).
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import type { DocumentoAbiertoPago } from '@/lib/finanzas/pagos/contrato';
import { ordenarFifo } from '@/lib/finanzas/pagos/reparto';

export interface RepartoTerceroProps {
  documentos: readonly DocumentoAbiertoPago[];
  seleccion: ReadonlySet<string>;
  onSeleccionChange: (s: Set<string>) => void;
  sobranteAFavor: boolean;
  onSobranteChange: (v: boolean) => void;
  formatear: (v: number) => string;
  formatearFecha: (v: string | null) => string;
  cargando?: boolean;
}

export function RepartoTercero({
  documentos,
  seleccion,
  onSeleccionChange,
  sobranteAFavor,
  onSobranteChange,
  formatear,
  formatearFecha,
  cargando,
}: RepartoTerceroProps) {
  const t = useTranslations('pagos.reparto');
  const base = useId();
  const ordenados = ordenarFifo(documentos.map((d) => ({ ...d, id: d.cuenta_id })));
  const total = ordenados.filter((d) => seleccion.has(d.cuenta_id)).reduce((s, d) => s + d.saldo, 0);
  const todas = ordenados.length > 0 && ordenados.every((d) => seleccion.has(d.cuenta_id));

  const alternar = (id: string) => {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSeleccionChange(s);
  };

  if (!cargando && ordenados.length === 0) {
    return <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">{t('sinFacturas')}</p>;
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-fg">{t('titulo')}</legend>
      <p className="text-xs text-fg-muted">{t('ayuda')}</p>
      <div className="max-h-60 overflow-y-auto rounded-lg border border-line">
        <div className="flex items-center gap-3 border-b border-line bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary">
          <Checkbox
            id={`${base}-todas`}
            checked={todas}
            onCheckedChange={() => onSeleccionChange(todas ? new Set() : new Set(ordenados.map((d) => d.cuenta_id)))}
          />
          <label htmlFor={`${base}-todas`} className="cursor-pointer">
            {t('todas')}
          </label>
        </div>
        <ul>
          {ordenados.map((d) => {
            const id = `${base}-${d.cuenta_id}`;
            return (
              <li key={d.cuenta_id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0 hover:bg-hover">
                <Checkbox id={id} checked={seleccion.has(d.cuenta_id)} onCheckedChange={() => alternar(d.cuenta_id)} />
                <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-fg">{d.numero ?? t('sinNumero')}</span>
                    <span className="text-xs text-fg-muted">
                      {d.vencimiento ? t('vence', { fecha: formatearFecha(d.vencimiento) }) : t('sinVencimiento')}
                    </span>
                  </span>
                  <span className="tabular-nums text-fg">{formatear(d.saldo)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-secondary">{t('totalSeleccion')}</span>
        <span className="font-semibold tabular-nums text-fg">{formatear(total)}</span>
      </div>
      <div className="flex items-start gap-2 text-sm text-fg">
        <Checkbox id={`${base}-sobrante`} checked={sobranteAFavor} onCheckedChange={(v) => onSobranteChange(v === true)} className="mt-0.5" />
        <label htmlFor={`${base}-sobrante`} className="cursor-pointer">
          {t('sobrante')}
          <span className="block text-xs text-fg-muted">{t('sobranteAyuda')}</span>
        </label>
      </div>
    </fieldset>
  );
}
