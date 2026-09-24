'use client';

/**
 * Selección de líneas de una nota crédito (Figma `730:18795`, N3 `738:43675`):
 * casilla y cantidad por línea, con lo ya acreditado y lo disponible. El valor
 * de cada línea sale de `valorLineaNota` (misma proporción que la RPC). Una
 * sola maquetación para escritorio y móvil: cada línea es una fila que se
 * apila en pantallas angostas.
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { CampoNumero } from '@/components/kit';
import { valorLineaNota, type LineaAcreditable } from '@/lib/finanzas/ventas/contratoNotaCredito';

export interface SeleccionLineasNotaProps {
  lineas: readonly LineaAcreditable[];
  /** itemId → cantidad elegida (ausente = no seleccionada). */
  seleccion: Readonly<Record<string, number>>;
  onSeleccionChange: (s: Record<string, number>) => void;
  formatear: (v: number) => string;
  /** Solo lectura: modo «Toda la factura». */
  soloLectura?: boolean;
}

const fmtCantidad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''));

export function SeleccionLineasNota({ lineas, seleccion, onSeleccionChange, formatear, soloLectura }: SeleccionLineasNotaProps) {
  const t = useTranslations('facturasVenta.nota.lineas');
  const base = useId();

  const alternar = (l: LineaAcreditable, marcada: boolean) => {
    const s = { ...seleccion };
    if (marcada) s[l.itemId] = l.disponible;
    else delete s[l.itemId];
    onSeleccionChange(s);
  };

  if (lineas.length === 0) {
    return <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">{t('sinLineas')}</p>;
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t('titulo')}</legend>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {lineas.map((l) => {
          const id = `${base}-${l.itemId}`;
          const agotada = l.disponible <= 0;
          const marcada = soloLectura ? !agotada : seleccion[l.itemId] !== undefined;
          const cantidad = soloLectura ? l.disponible : seleccion[l.itemId] ?? 0;
          return (
            <li key={l.itemId} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm ${agotada ? 'opacity-60' : ''}`}>
              {!soloLectura && (
                <Checkbox id={id} checked={marcada} disabled={agotada} onCheckedChange={(v) => alternar(l, v === true)} />
              )}
              <label htmlFor={soloLectura ? undefined : id} className="flex min-w-0 flex-1 basis-48 flex-col">
                <span className="truncate font-medium text-fg">{l.descripcion || t('sinDescripcion')}</span>
                <span className="text-xs text-fg-muted">
                  {t('facturada', { cantidad: fmtCantidad(l.cantidad) })}
                  {l.acreditada > 0 && ` · ${t('acreditada', { cantidad: fmtCantidad(l.acreditada) })}`}
                  {' · '}
                  {agotada ? t('agotada') : t('disponible', { cantidad: fmtCantidad(l.disponible) })}
                </span>
              </label>
              <div className="flex items-center gap-3">
                {!soloLectura && marcada && (
                  <div className="w-24">
                    <CampoNumero
                      aria-label={t('cantidadDe', { linea: l.descripcion })}
                      valor={cantidad}
                      onValorChange={(v) => onSeleccionChange({ ...seleccion, [l.itemId]: Math.min(Math.max(v ?? 0, 0), l.disponible) })}
                      minimo={0}
                      maximo={l.disponible}
                      decimales={3}
                      alinear="derecha"
                      tamano="sm"
                    />
                  </div>
                )}
                <span className="w-28 text-right tabular-nums text-fg">{marcada ? formatear(valorLineaNota(l, cantidad)) : '—'}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
