'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { FilaDato, ListaDatos, ResumenTotales, type ImpuestoResumen } from '@/components/kit';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

/**
 * Zona izquierda del cobro (POS-UX-V2 D4, Figma «Cobro v2»): «Total a pagar»
 * grande, «N productos · ver detalle» plegable, el resumen de totales del kit
 * y las tres cifras Total pagado · Falta · Cambio.
 *
 * No calcula nada: todos los importes llegan ya calculados por el cobro
 * (`calculateCartTotals` y `cuentasDelCobro` en `CheckoutDialog`).
 */
export interface LineaResumenCobro {
  id: string | number;
  nombre: string;
  cantidad: number;
  total: number;
}

export interface ResumenCobroProps {
  moneda: ContextoMoneda | string;
  /** Total con impuestos, propina y flete (`cartTotal`). */
  totalAPagar: number;
  lineas: readonly LineaResumenCobro[];
  /** Descuentos ya aplicados en las líneas (informativo: el subtotal ya los descuenta). */
  descuentos?: number;
  subtotal: number;
  /** Precios con impuesto incluido: el subtotal es la base imponible. */
  impuestosIncluidos: boolean;
  impuestos: readonly ImpuestoResumen[];
  propina: number;
  flete: number;
  pagado: number;
  falta: number;
  cambio: number;
}

/** La tarifa solo se pinta si el nombre del impuesto no la trae ya («IVA 19%»). */
function impuestosParaResumen(impuestos: readonly ImpuestoResumen[]): ImpuestoResumen[] {
  return impuestos.map((i) => (i.nombre.includes('%') ? { ...i, tarifa: null } : i));
}

export function ResumenCobro({
  moneda,
  totalAPagar,
  lineas,
  descuentos = 0,
  subtotal,
  impuestosIncluidos,
  impuestos,
  propina,
  flete,
  pagado,
  falta,
  cambio,
}: ResumenCobroProps) {
  const t = useTranslations('posCobro.resumen');
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const [detalle, setDetalle] = useState(false);
  const idDetalle = useId();
  const unidades = lineas.length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-fg-secondary">{t('totalAPagar')}</span>
        <span className="text-3xl font-bold leading-9 tabular-nums text-brand" data-testid="cobro-total-a-pagar">
          {formatear(totalAPagar)}
        </span>
        <button
          type="button"
          aria-expanded={detalle}
          aria-controls={idDetalle}
          onClick={() => setDetalle((v) => !v)}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('verDetalle', { n: unidades })}
          <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', detalle && 'rotate-180')} strokeWidth={1.5} />
        </button>
        <div id={idDetalle} className={detalle ? 'mt-2' : 'hidden'}>
          <ListaDatos etiqueta={t('detalle')} className="max-h-56 overflow-y-auto rounded-lg border border-line bg-surface px-2 py-1">
            {lineas.map((l) => (
              <FilaDato
                key={l.id}
                tamano="sm"
                etiqueta={
                  <span className="text-fg">
                    {l.nombre} <span className="text-fg-muted">{t('cantidad', { cantidad: l.cantidad })}</span>
                  </span>
                }
                valor={formatear(l.total)}
              />
            ))}
            {descuentos > 0 && (
              <FilaDato tamano="sm" tono="exito" separadorAntes etiqueta={t('descuentos')} valor={`−${formatear(descuentos)}`} />
            )}
          </ListaDatos>
        </div>
      </div>

      <ResumenTotales
        moneda={moneda}
        etiqueta={t('etiqueta')}
        etiquetaSubtotal={impuestosIncluidos ? t('subtotalBase') : t('subtotal')}
        etiquetaTotal={t('total')}
        subtotal={subtotal}
        impuestos={impuestosParaResumen(impuestos)}
        cargos={[
          { id: 'propina', etiqueta: t('propina'), importe: propina },
          { id: 'flete', etiqueta: t('flete'), importe: flete },
        ]}
        total={totalAPagar}
      />

      <dl aria-label={t('cifras')} className="mt-auto grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-fg-secondary">{t('pagado')}</dt>
          <dd className="text-base font-semibold tabular-nums text-fg">{formatear(pagado)}</dd>
        </div>
        <div className={cn('flex flex-col gap-0.5 rounded-lg border bg-surface px-3 py-2', falta > 0 ? 'border-line-warning' : 'border-line')}>
          <dt className="text-xs text-fg-secondary">{t('falta')}</dt>
          <dd className={cn('text-base font-semibold tabular-nums', falta > 0 ? 'text-warning-text' : 'text-fg')}>{formatear(falta)}</dd>
        </div>
        <div className={cn('flex flex-col gap-0.5 rounded-lg border bg-surface px-3 py-2', cambio > 0 ? 'border-line-success' : 'border-line')}>
          <dt className="text-xs text-fg-secondary">{t('cambio')}</dt>
          <dd className={cn('text-base font-semibold tabular-nums', cambio > 0 ? 'text-success-text' : 'text-fg')}>{formatear(cambio)}</dd>
        </div>
      </dl>
    </>
  );
}
