'use client';

import { useTranslations } from 'next-intl';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import type { OportunidadDetalleApi } from './apiOportunidades';
import { cantidadLineas, lineasDesdeApi, subtotal, totalLineas } from './lineasLogica';

/**
 * Pestaña «Líneas» del detalle (Figma 775:473076): productos, espacios y
 * conceptos de la oportunidad con su total (cálculo único de `lineasLogica`).
 * Se editan en «Editar» (formulario en página).
 */
export function LineasResumen({ op }: { op: OportunidadDetalleApi }) {
  const t = useTranslations('crm.oportunidad.lineas');
  const moneda = useMonedaOrganizacion().paraDocumento(op.currency);
  const l = lineasDesdeApi(op);
  if (cantidadLineas(l) === 0) return <p className="py-6 text-center text-sm text-fg-secondary">{t('sinLineas')}</p>;
  const filas = [
    ...l.products.map((x) => ({ clave: x.id ?? `p${x.product_id}`, nombre: x.nombre ?? t('producto'), detalle: t('detalleCantidad', { n: x.quantity, precio: formatMoneda(x.unit_price, moneda) }), total: subtotal(x.quantity, x.unit_price) })),
    ...l.spaces.map((x) => ({ clave: x.id ?? `s${x.space_id}`, nombre: x.nombre ?? t('espacio'), detalle: t('detalleNoches', { n: x.nights, precio: formatMoneda(x.unit_price, moneda) }), total: subtotal(x.nights, x.unit_price) })),
    ...l.custom.map((x, i) => ({ clave: x.id ?? `c${i}`, nombre: x.concept, detalle: t('detalleCantidad', { n: x.quantity, precio: formatMoneda(x.unit_price, moneda) }), total: subtotal(x.quantity, x.unit_price) })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-line">
        {filas.map((f) => (
          <li key={f.clave} className="flex items-center gap-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-fg">{f.nombre}</span>
              <span className="text-xs text-fg-secondary">{f.detalle}</span>
            </div>
            <span className="text-sm tabular-nums text-fg">{formatMoneda(f.total, moneda)}</span>
          </li>
        ))}
      </ul>
      <p className="self-end text-sm font-semibold text-fg">{t('totalGeneral', { total: formatMoneda(totalLineas(l), moneda) })}</p>
    </div>
  );
}
