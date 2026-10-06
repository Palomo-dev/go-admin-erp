'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, HandCoins } from 'lucide-react';
import { KbdButton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { DialogoMesa } from './DialogoMesa';
import type { LineaMesa, TotalesCuenta } from './cuentaMesaLogica';

/**
 * Pre-cuenta (Figma D9, clon de 880:114048): lo que falta por pagar agrupado
 * por producto, subtotal, base gravable e impuestos por nombre y tasa, y la
 * propina voluntaria sugerida (no forma parte de la factura). Sale impresa en
 * la estación de caja (80 mm) o en el navegador. «Cobrar» lleva al paso 9.
 */
export interface PreCuentaMesaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesaNombre: string;
  comensales: number;
  lineas: LineaMesa[];
  totales: TotalesCuenta;
  formatear: (valor: number) => string;
  nombreImpuesto: (tasa: number) => string;
  imprimiendo?: boolean;
  onImprimir: () => void;
  /** Cobrar con la propina elegida (porcentaje o valor). */
  onCobrar: (propina: { porcentaje: number | null; valor: number }) => void;
  /** Sin caja: «Cobrar» abre la apertura (S4). */
  sinCaja?: boolean;
}

const PORCENTAJES = [5, 10] as const;

export function PreCuentaMesaDialog({
  abierto,
  onAbiertoChange,
  mesaNombre,
  comensales,
  lineas,
  totales,
  formatear,
  nombreImpuesto,
  imprimiendo,
  onImprimir,
  onCobrar,
  sinCaja,
}: PreCuentaMesaDialogProps) {
  const t = useTranslations('posMesasFlujo.precuenta');
  const [propina, setPropina] = useState<'sin' | '5' | '10' | 'otro'>('10');
  const [otro, setOtro] = useState('');

  useEffect(() => {
    if (abierto) {
      setPropina('10');
      setOtro('');
    }
  }, [abierto]);

  const agrupadas = useMemo(() => {
    const mapa = new Map<string, { nombre: string; cantidad: number; total: number }>();
    for (const l of lineas.filter((x) => !x.pagada && x.cantidad > 0)) {
      const clave = `${l.nombre}|${l.variante ?? ''}|${l.precioUnitario}`;
      const previo = mapa.get(clave);
      if (previo) {
        previo.cantidad += l.cantidad;
        previo.total += l.total;
      } else {
        mapa.set(clave, { nombre: l.variante ? `${l.nombre} · ${l.variante}` : l.nombre, cantidad: l.cantidad, total: l.total });
      }
    }
    return Array.from(mapa.values());
  }, [lineas]);

  // Base de la propina: subtotal después de descuentos y antes de impuestos.
  const base = totales.subtotal;
  const valorPropina =
    propina === 'sin' ? 0 : propina === 'otro' ? Math.max(0, Number(otro.replace(/[^\d]/g, '')) || 0) : Math.round((base * Number(propina)) / 100);

  const fila = (etiqueta: string, valor: string, clase?: string) => (
    <div className={cn('flex justify-between text-[13px] text-fg-secondary', clase)}>
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums text-fg">{valor}</dd>
    </div>
  );

  return (
    <DialogoMesa
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { mesa: mesaNombre, n: comensales })}
      descripcion={t('noFactura')}
      textoCerrar={t('cerrar')}
      ancho={560}
      pie={
        <>
          <KbdButton variante="fantasma" tamano="md" atajo="Esc" onClick={() => onAbiertoChange(false)}>
            {t('cerrar')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="md" atajo="P" cargando={imprimiendo} onClick={onImprimir}>
            {t('imprimir')}
          </KbdButton>
          <KbdButton variante="primario" tamano="md" atajo="F4" onClick={() => onCobrar({ porcentaje: propina === '5' || propina === '10' ? Number(propina) : null, valor: valorPropina })}>
            {sinCaja ? t('abrirCaja') : t('cobrar')}
          </KbdButton>
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {agrupadas.map((l) => (
          <li key={`${l.nombre}-${l.total}`} className="flex justify-between gap-3 text-sm text-fg-secondary">
            <span className="min-w-0 truncate">{t('linea', { n: l.cantidad, nombre: l.nombre })}</span>
            <span className="shrink-0 tabular-nums text-fg">{formatear(l.total)}</span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1 rounded-lg bg-subtle px-3 py-2.5">
        {fila(t('subtotal'), formatear(totales.subtotal + totales.descuento))}
        {totales.descuento > 0 && fila(t('descuentos'), `−${formatear(totales.descuento)}`, '[&>dd]:text-danger-text')}
        {fila(t('baseGravable'), formatear(totales.subtotal))}
        {totales.impuestos.map((i) => fila(nombreImpuesto(i.tasa), formatear(i.importe)))}
        {totales.abonado > 0 && fila(t('abonado'), `−${formatear(totales.abonado)}`)}
        <div className="mt-0.5 flex items-baseline justify-between">
          <dt className="text-base font-medium text-fg">{t('total')}</dt>
          <dd className="text-base font-bold tabular-nums text-brand-deep">{formatear(totales.saldo)}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2 rounded-lg bg-brand-tint px-3.5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
          <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('propinaTitulo')}
        </h3>
        <p className="text-xs text-fg-secondary">{t('propinaTexto')}</p>
        <div role="radiogroup" aria-label={t('propinaTitulo')} className="flex flex-wrap gap-2">
          {(['sin', ...PORCENTAJES.map(String), 'otro'] as Array<'sin' | '5' | '10' | 'otro'>).map((op) => {
            const activo = propina === op;
            const etiqueta =
              op === 'sin'
                ? t('sinPropina')
                : op === 'otro'
                  ? t('otroValor')
                  : t('porcentaje', { pct: op, valor: formatear(Math.round((base * Number(op)) / 100)) });
            return (
              <button
                key={op}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setPropina(op)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activo ? 'border-line-brand bg-surface text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
                )}
              >
                {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                {etiqueta}
              </button>
            );
          })}
          {propina === 'otro' && (
            <input
              type="text"
              inputMode="numeric"
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              aria-label={t('otroValor')}
              className="h-8 w-28 rounded-lg border border-line-strong bg-surface px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          )}
        </div>
        <p className="text-xs text-fg-muted">{t('propinaBase', { base: formatear(base) })}</p>
      </section>
    </DialogoMesa>
  );
}
